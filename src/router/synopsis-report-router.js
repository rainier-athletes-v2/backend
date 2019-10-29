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

const translateGradesToLetters = (pointTrackers) => {
  for (let i = 0; i < pointTrackers.length; i++) {
    if (pointTrackers[i].Grade__c === null) {
      pointTrackers[i].Grade__c = 'N/A';
    } else if (pointTrackers[i].Grade__c >= 90) {
      pointTrackers[i].Grade__c = 'A';
    } else if (pointTrackers[i].Grade__c >= 80) {
      pointTrackers[i].Grade__c = 'B';
    } else if (pointTrackers[i].Grade__c >= 70) {
      pointTrackers[i].Grade__c = 'C';
    } else if (pointTrackers[i].Grade__c >= 60) {
      pointTrackers[i].Grade__c = 'D';
    } else {
      pointTrackers[i].Grade__c = 'F';
    }
  }
};

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

  translateGradesToLetters(srQueryResults.body.records[0].PointTrackers__r.records);
  return response.json(srQueryResults.body).status(200);  
});

const translateLettersToGrades = (pointTracker) => {
  if (pointTracker.Grade__c === 'N/A') {
    pointTracker.Grade__c = null;
  } else if (pointTracker.Grade__c === 'A') {
    pointTracker.Grade__c = 90;
  } else if (pointTracker.Grade__c === 'B') {
    pointTracker.Grade__c = 80;
  } else if (pointTracker.Grade__c === 'C') {
    pointTracker.Grade__c = 70;
  } else if (pointTracker.Grade__c === 'D') {
    pointTracker.Grade__c = 60;
  } else {
    pointTracker.Grade__c = 0;
  }
};

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
  delete newSR.PointTrackers__r;
  delete newSR.summer_SR;
  return newSR;
};

const _prepPointTrackers = (sr) => {
  // prep point trackers array for use as update request body
  const pt = {};
  pt.allOrNone = false;
  pt.records = sr.PointTrackers__r.records.map((p) => {
    delete p.Class__r;
    delete p.Name;
    translateLettersToGrades(p);
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
  // console.log('before prepSR', JSON.stringify(synopsisReport.PointTrackers__r));
  const preppedSR = _prepSynopsisReport(synopsisReport); // prepair SynopsisReport__c for update
  try {
    await superagent.patch(`${sobjectsUrl}SynopsisReport__c/${srId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(preppedSR);
  } catch (err) {
    return next(new HttpErrors(err.status, `Error Updating Synopsis Report ${request.body.Id}`, { expose: false }));
  }
  if (!synopsisReport.summer_SR) {
    const preppedPT = _prepPointTrackers(synopsisReport);
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
  }
  return response.sendStatus(204);
});

export default synopsisReportRouter;
