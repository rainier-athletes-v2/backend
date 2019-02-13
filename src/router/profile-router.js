import { Router } from 'express';
import HttpErrors from 'http-errors';
import superagent from 'superagent';
import Profile from '../model/profile';
import bearerAuthMiddleware from '../lib/middleware/bearer-auth-middleware';
import logger from '../lib/logger';
import * as soql from './sf-soql-queries';

const profileRouter = new Router();

profileRouter.post('/api/v1/profiles', bearerAuthMiddleware, (request, response, next) => {
  logger.log(logger.INFO, `.post /api/v1/profiles req.body: ${request.body}`);
  Profile.init()
    .then(() => {
      return new Profile(request.body).save();
    })
    .then((profile) => {
      logger.log(logger.INFO, `POST PROFILE ROUTER: new profile created with 200 code, ${JSON.stringify(profile)}`);
      return response.json(profile).status(200);
    })
    .catch((err) => {
      // err.code === 11000 is conflict on duplicate primaryEmail. If found, reactivate profile.
      if (err.code === 11000) return Profile.findOne({ primaryEmail: request.body.primaryEmail });
      return next(err);
    })
    .then((result) => {
      const keys = Object.keys(request.body);
      for (let i = 0; i < keys.length; i++) {
        result[keys[i]] = request.body[keys[i]];
      }
      result.active = true;
      return result.save();
    })
    .then((result) => {
      return response.json(result).status(200);
    })
    .catch(next);

  return undefined;
});

profileRouter.get('/api/v1/profiles', bearerAuthMiddleware, (request, response, next) => {
  if (request.query.id && request.profile.role !== 'admin' && request.profile.role !== 'mentor') {
    return next(new HttpErrors(401, 'User not authorized to query by id.', { expose: false }));
  }
  if (request.query.id) {
    Profile.init()
      .then(() => {
        Profile.findById(request.query.id)
          .then((profile) => {
            return response.json(profile);
          })
          .catch(next);
      });
    return undefined;
  }

  if (Object.keys(request.query).length > 0) {
    Profile.init()
      .then(() => {
        return Profile.find(request.query);
      })
      .then((requestedPropReturn) => {
        return response.json(requestedPropReturn);
      })
      .catch(next);
    return undefined;
  }

  if (request.profile.role === 'admin') {
    Profile.init()
      .then(() => {
        return Profile.find();
      })
      .then((profiles) => {
        return response.json(profiles);
      })
      .catch(next);
    return undefined;
  }

  Profile.init()
    .then(() => {
      Profile.findById(request.profile._id.toString())
        .then((profile) => {
          delete profile.role;
          return response.json(profile);
        });
      return undefined;
    })
    .catch(next);
  return undefined;
});

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

    if (relatedContacts.body.totalSize > 1) {
      return next(new HttpErrors(500, `myStudents unexpected response length of ${relatedContacts.body.totalSize}`, { expose: false }));
    }

    const studentContacts = relatedContacts.body.records[0].npe4__Relationships__r.records.map((student) => {
      const ref = student.npe4__RelatedContact__r;
      const profile = {
        id: ref.Id, 
        active: student.npe4__Status__c === 'Current',
        firstName: ref.FirstName, 
        lastName: ref.LastName, 
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
          coaches: [],
          sports: [],
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
          coach: {
            name: team.npe5__Organization__r.npe01__One2OneContact__r.Name,
            phone: team.npe5__Organization__r.npe01__One2OneContact__r.Phone,
            email: team.npe5__Organization__r.npe01__One2OneContact__r.Email,
            role: 'coach',
            currentCoach: true,
          },
          sport: {
            sport: 'not specified',
            team: team.npe5__Organization__r.Name,
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
        studentRef.studentData.coaches.push({ coach: { ...team.coach }, currentCoach: true });
        studentRef.studentData.sports.push({ ...team.sport });
      });
    });

    return response.json(studentContacts);
  }
  return next(new HttpErrors(401, 'User not authorized to query by id.', { expose: false }));
});


// update route
profileRouter.put('/api/v1/profiles', bearerAuthMiddleware, (request, response, next) => {
  if (!Object.keys(request.body).length) return next(new HttpErrors(400, 'PUT PROFILE ROUTER: Missing request body', { expose: false }));

  Profile.init()
    .then(() => {
      return Profile.findOneAndUpdate({ _id: request.body._id }, request.body, { runValidators: true });
    })
    .then((profile) => {
      return Profile.findOne(profile._id);
    })
    .then((profile) => {
      response.json(profile);
    })
    .catch(next);
  return undefined;
});

profileRouter.delete('/api/v1/profiles', bearerAuthMiddleware, (request, response, next) => {
  if (request.profile.role !== 'admin') return next(new HttpErrors(401, 'User not authorized to query by id.', { expose: false }));
  if (!request.query.id) return next(new HttpErrors(400, 'Bad delete request. Missing id query.', { expose: false }));
  Profile.init()
    .then(() => {
      return Profile.findById(request.query.id);
    })
    .then((profile) => {
      if (!profile) return next(new HttpErrors(404, 'Error locating profile for inactivation', { expose: false }));
      profile.active = false;
      return profile.save();
    })
    .then((result) => {
      return response.json(result).status(200);
    })
    .catch((err) => {
      logger.log(logger.ERROR, 'DELETE PROFILE ROUTER: non-fatal errors deactivating profile');
      return next(new HttpErrors(404, `Error deactivating profile: ${err}`, { expose: false }));
      // return response.status(200);
    });
  return undefined;
});

export default profileRouter;
