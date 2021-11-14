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
    console.log(err);
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
  delete newSR.Mentor__r;
  return newSR;
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
  } = request.profile;

  const synopsisReport = request.body;

  const srId = synopsisReport.Id;
  const preppedSR = _prepSynopsisReport(synopsisReport); // prepair SynopsisReport__c for update

  try {
    await superagent.patch(`${sobjectsUrl}SynopsisReport__c/${srId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(preppedSR);
  } catch (err) {
    console.log('error', JSON.stringify(err, null, 2));
    return next(new HttpErrors(err.status, `Error Updating Synopsis Report ${request.body.Id}`, { expose: false }));
  }

  return response.sendStatus(204);
});

export default synopsisReportRouter;
