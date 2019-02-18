import { Router } from 'express';
import HttpErrors from 'http-errors';
import superagent from 'superagent';
import PointTracker from '../model/point-tracker';
import StudentData from '../model/student-data';
import bearerAuthMiddleware from '../lib/middleware/bearer-auth-middleware';
import * as soql from './sf-soql-queries';

const synopsisReportRouter = new Router();

synopsisReportRouter.get('/api/v2/synopsisreports/:studentId', bearerAuthMiddleware, async (request, response, next) => {
  if (!['mentor', 'admin'].includes(request.profile.role)) {
    return next(new HttpErrors(403, 'SynopsisReport GET: User not authorized.'));
  }
  if (!request.params.studentId) {
    return next(new HttpErrors(400, 'SynopsisReport GET: Bad request. No student ID.'));
  }

  const { 
    accessToken, 
    queryUrl, 
  } = request.profile;

  const srQuery = `?q=${soql.recentSynopsisReports(request.params.studentId)}`; 
  let srQueryResults;
  try {
    srQueryResults = await superagent.get(`${queryUrl}${srQuery}`)
      .set('Authorization', `Bearer ${accessToken}`);
  } catch (err) {
    return next(new HttpErrors(err.status, `Error retrieving Synopsis Report ${request.query.id}`, { expose: false }));
  }

  return response.json(srQueryResults.body).status(200);  
});

synopsisReportRouter.get('/api/v2/synopsisreport/:reportId', bearerAuthMiddleware, async (request, response, next) => {
  if (!['mentor', 'admin'].includes(request.profile.role)) {
    return next(new HttpErrors(403, 'SynopsisReport GET: User not authorized.'));
  }
  if (!request.params.reportId) {
    return next(new HttpErrors(400, 'SynopsisReport GET: Bad request. No SR ID.'));
  }

  const { 
    accessToken, 
    queryUrl, 
  } = request.profile;

  const srQuery = `?q=${soql.thisSynopsisReport(request.params.reportId)}`; 
  let srQueryResults;
  try {
    srQueryResults = await superagent.get(`${queryUrl}${srQuery}`)
      .set('Authorization', `Bearer ${accessToken}`);
  } catch (err) {
    return next(new HttpErrors(err.status, `Error retrieving Synopsis Report ${request.params.reportId}`, { expose: false }));
  }
  return response.json(srQueryResults.body).status(200);  
});

const _prepSynopsisReport = (sr) => {
  // strip out properties that will cause SF PATCH (update) request to blow up
  const newSR = Object.assign({}, sr);
  delete newSR.attributes;
  delete newSR.Id;
  delete newSR.Name;
  delete newSR.Week__c;
  delete newSR.Start_Date__c;
  delete newSR.Student__r;
  delete newSR.PointTrackers__r;
  return newSR;
};

const _prepPointTrackers = (sr) => {
  // prep point trackers array for use as update request body
  const pt = {};
  pt.allOrNone = false;
  pt.records = sr.PointTrackers__r.records.map((p) => {
    delete p.Class__r;
    delete p.Name;
    return p;
  });
  return pt;
};

synopsisReportRouter.put('/api/v2/synopsisreport', bearerAuthMiddleware, async (request, response, next) => {
  if (!['mentor', 'admin'].includes(request.profile.role)) {
    return next(new HttpErrors(403, 'SynopsisReport PUT: User not authorized.'));
  }
  if (!request.body) {
    return next(new HttpErrors(400, 'SynopsisReport PUT: Missing request body', { expose: false }));
  }

  const {
    accessToken,
    sobjectsUrl,
    ptUpdateUrl,
  } = request.profile;

  const synopsisReport = request.body;

  const srId = synopsisReport.Id;
  const srName = synopsisReport.Name;
  const preppedSR = _prepSynopsisReport(synopsisReport); // prepair SynopsisReport__c for update
  const preppedPT = _prepPointTrackers(synopsisReport);

  try {
    await superagent.patch(`${sobjectsUrl}SynopsisReport__c/${srId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(preppedSR);
  } catch (err) {
    return next(new HttpErrors(err.status, `Error Updating Synopsis Report ${request.body.Id}`, { expose: false }));
  }

  let ptResult;
  try {
    ptResult = await superagent.patch(ptUpdateUrl)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(preppedPT);
  } catch (err) {
    return next(new HttpErrors(err.status, `Error Updating Point Trackers for SR ${srName}`, { expose: false }));
  }

  if (ptResult.body.every(r => r.success)) {
    return response.sendStatus(204);
  }
  return next(new HttpErrors(500, `Failure saving point trackers for SR ${srName}`, { expose: false }));
});

synopsisReportRouter.post('/api/v1/pointstracker', bearerAuthMiddleware, (request, response, next) => {
  if (!request.body) return next(new HttpErrors(400, 'POINT-TRACKER ROUTER POST: Missing request body', { expose: false }));

  PointTracker.init()
    .then(() => {
      // find and remove any existing PT with the same title as on the request
      return PointTracker.findOneAndRemove({ title: request.body.title });
    })
    .then(() => {
      // get student's data from mongo
      return StudentData.findOne({ student: request.body.student });
    })
    .then((studentData) => {
      if (!studentData) return next(new HttpErrors(400, 'POINT-TRACKER ROUTER POST: Missing student id in req body', { expose: false }));
      
      // get student's current mentor _id
      const currentMentor = studentData.mentors.find(m => m.currentMentor);
      let currentMentorId;
      if (currentMentor) currentMentorId = currentMentor.mentor._id;

      if (currentMentorId && currentMentorId.toString() !== request.profile._id.toString()) {
        request.body.mentorIsSubstitute = true;
        request.body.mentor = request.profile._id.toString();
      } else if (currentMentorId) {
        // submitter isn't a sub. Get mentor ID from student's profile
        const [mentors] = studentData.mentors.filter(m => m.currentMentor);
        request.body.mentor = mentors.mentor._id.toString(); // findById autopopulates so id is the mentor, not just id.
        request.body.mentorIsSubstitute = false;
      }
      // set timestamps
      request.body.createdAt = new Date();
      request.body.updatedAt = request.body.createdAt;
      return new PointTracker(request.body).save();
    })
    .then((pointstracker) => {
      return response.json(pointstracker);
    })
    .catch(next);
  return undefined;
});

synopsisReportRouter.put('/api/v1/pointstracker', bearerAuthMiddleware, (request, response, next) => {
  if (!request.body._id) return next(new HttpErrors(400, 'POINT-TRACKER ROUTER PUT: Missing request body', { expose: false }));
  
  PointTracker.init()
    .then(() => {
      return PointTracker.findOneAndUpdate(request.body);
    })
    .then((result) => {
      if (!result) return next(new HttpErrors(404, 'Unable to update point tracker'));
      return PointTracker.findById(request.body._id.toString());
    })
    .then((tracker) => {
      tracker.updatedAt = new Date();
      return tracker.save();
    })
    .then((updated) => {
      if (!updated) return next(new HttpErrors(500, 'Unable to retrieve updated point tracker'));
      return response.json(updated).status(200);
    })
    .catch(next);
  return undefined;
});

synopsisReportRouter.delete('/api/v1/pointstracker', bearerAuthMiddleware, (request, response, next) => {
  if (!request.query.id) return next(new HttpErrors(400, 'DELETE POINT-TRACKER ROUTER: bad query', { expose: false }));

  PointTracker.init()
    .then(() => {
      return PointTracker.findByIdAndRemove(request.query.id);
    })
    .catch(next);
  return response.sendStatus(200);
});

export default synopsisReportRouter;
