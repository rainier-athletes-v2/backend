import { Router } from 'express';
import HttpErrors from 'http-errors';
import superagent from 'superagent';
// import Profile from '../model/profile';
import bearerAuthMiddleware from '../lib/middleware/bearer-auth-middleware';
// import logger from '../lib/logger';

const scheduleRouter = new Router();

scheduleRouter.get('/api/v2/schedule/:studentId', bearerAuthMiddleware, async (request, response, next) => {
  if (!request.params || (request.params && !request.params.studentId)) {
    return next(new HttpErrors(400, 'Bad schedule request. Missing studendId in URL', { expose: false }));
  }

  if (!(request.profile && ['staff', 'mentor'].includes(request.profile.role))) {
    return next(new HttpErrors(403, 'User not authorized.', { expose: false }));
  }

  // good to go
  const classScheduleQuery = '?q=select+name,+id,+(select+Class__c+from+Class_Schedules__r)+from+Contact+where+Id+=';
  const { 
    accessToken, 
    queryUrl, 
    sobjectsUrl, 
  } = request.profile;
  const { studentId } = request.params;

  // get student's class schedule info
  const classScheduleData = await superagent.get(`${queryUrl}${classScheduleQuery}'${studentId}'`).set('Authorization', `Bearer ${accessToken}`);

  // map to array of Class__c id's
  const classIds = classScheduleData.body.records[0].Class_Schedules__r.records.map(c => c.Class__c);
  
  // fetch Class__c data
  const classPromises = [];
  for (let i = 0; i < classIds.length; i++) {
    classPromises.push(
      superagent.get(`${sobjectsUrl}Class__c/${classIds[i]}`).set('Authorization', `Bearer ${accessToken}`),
    );
  }
  const classDataResult = await Promise.all(classPromises);
  
  // map to array of Class__c objects
  const classData = classDataResult.map(r => r.body);
  /*
  {
    "attributes": {
        "type": "Class__c",
        "url": "/services/data/v44.0/sobjects/Class__c/a0t5C0000003PSGQA2"
    },
    "Id": "a0t5C0000003PSGQA2",
    "OwnerId": "0051U000000fDfVQAU",
    "IsDeleted": false,
    "Name": "PE 6th",
    "CreatedDate": "2019-01-30T03:52:17.000+0000",
    "CreatedById": "0051U000000fDfVQAU",
    "LastModifiedDate": "2019-02-04T19:18:15.000+0000",
    "LastModifiedById": "0051U000000fDfVQAU",
    "SystemModstamp": "2019-02-04T19:18:15.000+0000",
    "Teacher__c": "0035C00000Ghna5QAB",
    "Period__c": 1,
    "School_Year__c": 2018,
    "Term__c": "S1",
    "School__c": "0015C00000Lz4nNQAR"
}
*/
  // studentClassIds is an object using student SF ID as key and array of Class__c IDs as value
  // const studentClassIds = {};
  // for (let i = 0; i < studentScheduleData.length; i++) {
  //   const id = studentScheduleData[i].body.records[0].Id;
  //   const classes = studentScheduleData[i].body.records[0].Class_Schedules__r.records;
  //   studentClassIds[id] = classes.map(c => c.Class__c);
  // }
  return response.json(classData);
});

export default scheduleRouter;
