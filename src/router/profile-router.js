import { Router } from 'express';
import HttpErrors from 'http-errors';
import superagent from 'superagent';
import bearerAuthMiddleware from '../lib/middleware/bearer-auth-middleware';
// import logger from '../lib/logger';
import * as soql from '../lib/sf-soql-queries';

const profileRouter = new Router();

profileRouter.get('/api/v2/profiles/me', bearerAuthMiddleware, (request, response, next) => {
  if (request.profile) {
    return response.json(
      {
        firstName: request.profile.firstName,
        lastName: request.profile.lastName,
        role: request.profile.role,
        isMentor: request.profile.isMentor,
        isStaff: request.profile.isStaff,
      },
    );
  }
  return next(new HttpErrors(500, 'User profile missing from request.', { expose: false }));
});

profileRouter.get('/api/v2/profiles/myStudents', bearerAuthMiddleware, async (request, response, next) => {
  if (request.profile && ['admin', 'mentor'].includes(request.profile.role)) {
    // retrieve students related to current user
    const { 
      accessToken, 
      queryUrl, 
      contactId,
    } = request.profile;

    const myStudentsQuery = `?q=${soql.myStudents(contactId)}`; 
    let relatedContacts;
    try {
      relatedContacts = await superagent.get(`${queryUrl}${myStudentsQuery}`)
        .set('Authorization', `Bearer ${accessToken}`);
    } catch (err) {
      return next(new HttpErrors(err.status, `Error retrieving myStudents for contact ${request.profile.contactId}`, { expose: false }));
    }

    // if (relatedContacts.body.totalSize > 1) {
    //   return next(new HttpErrors(500, `myStudents unexpected response length of ${relatedContacts.body.totalSize}`, { expose: false }));
    // }
    // filter down to unique students
    const uniqueStudents = new Map();
    const { records } = relatedContacts.body;
    for (let i = 0; i < records.length; i++) {
      if (uniqueStudents.has(records[i].Student__r.Id) === false
        && records[i].Student__r.Student__c) {
        uniqueStudents.set(records[i].Student__r.Id, { student: records[i].Student__r, pointTracker: records[i].PointTrackers__r });
      }
    }
    // console.log(uniqueStudents);
    // const studentContacts = relatedContacts.body.records[0].npe4__Relationships__r.records.map((student) => {
    const studentsArray = [...uniqueStudents.values()];
    const studentContacts = studentsArray.map((studentObj) => {
      const ref = studentObj.student;
      const profile = {
        id: ref.Id, 
        accountId: ref.AccountId,
        active: true, // ref.npe4__Status__c === 'Current',
        firstName: ref.FirstName, 
        lastName: ref.LastName,
        name: ref.Name,
        role: 'student', // or could be npe4__Type__c.toLowerCase() but not sure that'll always be student
        primaryEmail: ref.Email,
        phone: ref.HomePhone,
        cellPhone: ref.MobilePhone,
        studentData: {
          gender: ref.Gender__c,
          dateOfBirth: ref.Birthdate,
          grade: ref.Student_Grade__c,
          schoolId: ref.Student_ID__c,
          synopsisReportArchiveUrl: ref.StudentSynopsisReportArchiveUrl__c,
          googleCalendarUrl: ref.StudentGoogleCalendarUrl__c,
          googleDocsUrl: ref.StudentGoogleDocsUrl__c,
          synergyUsername: ref.Synergy_Username__c,
          synergyPassword: ref.Synergy_Password__c,
          schoolName: studentObj.pointTracker.totalSize ? studentObj.pointTracker.records[0].Class__r.School__r.Name : '',
          teams: [],
          family: [],
        },
      };
      return profile;
    });

    // fetch student team info
    const affPromises = [];
    studentContacts.forEach((student) => {
      const affiliationsQuery = `?q=${soql.studentAffiliations(student.id)}`;
      try {
        affPromises.push(
          superagent.get(`${queryUrl}${affiliationsQuery}`)
            .set('Authorization', `Bearer ${accessToken}`),
        );
      } catch (err) {
        return next(new HttpErrors(err.status, `Error retrieving student affiliations for student ${student.id}`, { expose: false }));
      }
      return undefined;
    });
    const affBodies = await Promise.all(affPromises);
    const affRecords = affBodies.map(b => b.body.records);
    // console.log(JSON.stringify(affRecords, null, 2));
    const teamData = [];
    affRecords.forEach((student) => {
      // student is an array of affiliation objects. find the teams
      const teams = student.filter(aff => aff.npe5__Organization__r.Type === 'Sports Team' && aff.npe5__Status__c === 'Current')
        .map(team => ({
          student: team.npe5__Contact__r.Id,
          team: {
            coach: team.npe5__Organization__r.npe01__One2OneContact__r.Name,
            phone: team.npe5__Organization__r.npe01__One2OneContact__r.Phone,
            email: team.npe5__Organization__r.npe01__One2OneContact__r.Email,
            role: 'coach',
            currentCoach: true,
            sport: 'not specified',
            teamName: team.npe5__Organization__r.Name,
            league: 'not specified',
            teamCalendarUrl: 'not specified',
            currentlyPlaying: true,
          },
        }));
      teamData.push(teams);
    });

    // add coach and sports info to studentContacts
    teamData.forEach((student) => {  
      student.forEach((team) => { 
        const studentRef = studentContacts.find(s => s.id === team.student); 
        studentRef.studentData.teams.push({ ...team.team });
        // studentRef.studentData.sports.push({ ...team.sport });
      });
    });

    // fetch student family members
    const accPromises = [];
    studentContacts.forEach((student) => {
      const familyQuery = `?q=${soql.studentFamilyMembers(student.accountId)}`;
      try {
        accPromises.push(
          superagent.get(`${queryUrl}${familyQuery}`)
            .set('Authorization', `Bearer ${accessToken}`),
        );
      } catch (err) {
        return next(new HttpErrors(err.status, `Error retrieving family members for student ${student.id}`, { expose: false }));
      }
      return undefined;
    });
    const accBodies = await Promise.all(accPromises);
    const accRecords = accBodies.map((b) => {
      const accountId = b.body.records[0].Id;
      const contacts = b.body.records[0].Contacts ? b.body.records[0].Contacts.records : [];
      return { accountId, contacts };
    });
    // add family contacts to each studentContact
    accRecords.forEach((student) => {
      const studentRef = studentContacts.find(s => s.accountId === student.accountId);
      student.contacts.forEach(contact => studentRef.studentData.family.push({
        name: contact.Name,
        email: contact.Email,
        phone: contact.Phone,
      }));
    });

    return response.json(studentContacts);
  }
  return next(new HttpErrors(401, 'User not authorized to query by id.', { expose: false }));
});

export default profileRouter;
