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
    return next(new HttpErrors(err.status, `Error retrieving Synopsis Report ${request.query.id}`, { expose: false }));
  }

  return response.json(srQueryResults.body).status(200);  
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
