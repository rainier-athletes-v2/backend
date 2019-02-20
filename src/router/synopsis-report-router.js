import { Router } from 'express';
import HttpErrors from 'http-errors';
import superagent from 'superagent';
import bearerAuthMiddleware from '../lib/middleware/bearer-auth-middleware';
import * as soql from '../lib/sf-soql-queries';

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

export default synopsisReportRouter;
