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
      return next(new HttpErrors(err.status, `Error retrieving myStudents for contact ${request.profile.contactId}.`, { expose: false }));
    }

    // filter down to unique students
    const uniqueStudents = new Map();
    const { records } = relatedContacts.body;
    for (let i = 0; i < records.length; i++) {
      if (uniqueStudents.has(records[i].Student__r.Id) === false
        && records[i].Student__r.Student__c) {
        uniqueStudents.set(records[i].Student__r.Id, { student: records[i].Student__r, pointTracker: records[i].PointTrackers__r });
      }
    }
    
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
        primaryEmail: ref.Rainier_Athletes_Email__c,
        phone: ref.HomePhone,
        cellPhone: ref.MobilePhone,
        email: ref.Rainier_Athletes_Email__c,
        studentData: {
          gender: ref.Gender__c,
          dateOfBirth: ref.Birthdate,
          grade: ref.Student_Grade__c,
          schoolId: ref.Student_ID__c,
          synopsisReportArchiveUrl: ref.StudentSynopsisReportArchiveUrl__c,
          googleCalendarUrl: ref.StudentGoogleCalendarUrl__c,
          synergyUsername: ref.Synergy_Username__c,
          synergyPassword: ref.Synergy_Password__c,
          teams: [],
          family: [],
        },
      };
      if (studentObj.pointTracker) {
        if (studentObj.pointTracker.records[0].Class__r) {
          profile.studentData.schoolName = studentObj.pointTracker.records[0].Class__r.School__r.Name;
        } else {
          profile.studentData.schoolName = 'Unknown';
        }
      } else {
        profile.studentData.schoolName = 'Unknown';
      }
      return profile;
    });

    // fetch related teacher (their "main" teacher). May or may not be present. Intended for elementary students.
    const relPromises = [];
    studentContacts.forEach((student) => {
      const teacherQuery = `?q=${soql.relatedTeacher(student.id)}`;
      try {
        relPromises.push(
          superagent.get(`${queryUrl}${teacherQuery}`)
            .set('Authorization', `Bearer ${accessToken}`),
        );
      } catch (err) {
        return next(new HttpErrors(err.status, `Error retrieving teacher relationships for student ${student.id}`, { expose: false }));
      }
      return undefined;
    });
    const relBodies = await Promise.all(relPromises);
    const relRecords = relBodies.map(b => (b.body.records[0] ? b.body.records[0] : {}));
    // add teacher name to each studentContact's studentData. relRecords is an array of objects, one per student.
    relRecords.forEach((teacher) => {
      if (teacher.npe4__Contact__c) { // teacher object isn't empty
        const studentRef = studentContacts.find(s => s.id === teacher.npe4__Contact__c);
        if (studentRef) {
          studentRef.studentData.teacher = teacher.npe4__RelatedContact__r.Name;
        }
      }
    });

    // fetch student team info
    
    const affPromises = [];
    studentContacts.forEach((student) => {
      const affiliationsQuery = `?q=${soql.studentTeamAffiliations(student.id)}`;
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
    
    const teamData = [];
    affRecords.forEach((student) => {
      // student is an array of affiliation objects. Query returns only current teams with end date >= today
      const teams = student.map(team => ({
        student: team.npe5__Contact__r.Id,
        team: {
          coach: team.npe5__Organization__r.npe01__One2OneContact__r.Name,
          phone: team.npe5__Organization__r.npe01__One2OneContact__r.Phone,
          email: team.npe5__Organization__r.npe01__One2OneContact__r.Email,
          role: 'coach',
          currentCoach: true,
          sport: 'DEV: this not in Salesforce',
          teamName: team.npe5__Organization__r.Name,
          league: team.npe5__Organization__r.Parent.Name,
          teamCalendarUrl: 'DEV: this not in Salesforce',
          currentlyPlaying: true,
        },
      }));
      teamData.push(teams);
    });
    // fetch parent organization name using ParentId stored in teamData[n].team.league

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
