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
  const classScheduleQuery = '?q=select+Class__c,TeacherFormula__c,Class__r.Name,TermFormula__c,PeriodFormula__c+from+ClassSchedule__c+where+Student__c+=+';
  const { 
    accessToken, 
    queryUrl, 
    sobjectsUrl, 
  } = request.profile;
  const { studentId } = request.params;

  // get student's class schedule info
  const classScheduleData = await superagent.get(`${queryUrl}${classScheduleQuery}'${studentId}'`).set('Authorization', `Bearer ${accessToken}`);

  // map to array of Class__c id's
  // const classIds = classScheduleData.body.records[0].Class_Schedules__r.records.map(c => c.Class__c);
  
  // // fetch Class__c data
  // const classPromises = [];
  // for (let i = 0; i < classIds.length; i++) {
  //   classPromises.push(
  //     superagent.get(`${sobjectsUrl}Class__c/${classIds[i]}`).set('Authorization', `Bearer ${accessToken}`),
  //   );
  // }
  // const classDataResult = await Promise.all(classPromises);

  // map to array of Class__c objects
  const classData = classScheduleData.map(r => r.body);
  /*
  {
    "totalSize": 7,
    "done": true,
    "records": [
        {
            "attributes": {
                "type": "ClassSchedule__c",
                "url": "/services/data/v44.0/sobjects/ClassSchedule__c/a0u5C000001INnIQAW"
            },
            "Class__c": "a0t5C0000003PSGQA2",
            "TeacherFormula__c": "Pilichowski Graham, T.",
            "Class__r": {
                "attributes": {
                    "type": "Class__c",
                    "url": "/services/data/v44.0/sobjects/Class__c/a0t5C0000003PSGQA2"
                },
                "Name": "PE 6th"
            },
            "TermFormula__c": "S1",
            "PeriodFormula__c": 1
        },
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
