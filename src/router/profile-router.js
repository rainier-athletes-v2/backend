import { Router } from 'express';
import HttpErrors from 'http-errors';
import superagent from 'superagent';
import Profile from '../model/profile';
import bearerAuthMiddleware from '../lib/middleware/bearer-auth-middleware';
import logger from '../lib/logger';

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
  if (request.profile && ['staff', 'mentor'].includes(request.profile.role)) {
    // retrieve students related to current user
    const { 
      accessToken, 
      queryUrl, 
      sobjectsUrl, 
      contactId,
    } = request.profile;

    const myStudentsQuery = `?q=select+name,+(select+npe4__RelatedContact__c,+npe4__Type__c,+npe4__Status__c+from+npe4__Relationships__r)+from+contact+where+id+=+'${contactId}'`;
    const classScheduleQuery = '?q=select+name,+id,+(select+Class__c+from+Class_Schedules__r)+from+Contact+where+Id+=';

    let related;
    try {
      related = await superagent.get(`${queryUrl}${myStudentsQuery}`)
        .set('Authorization', `Bearer ${accessToken}`);
    } catch (err) {
      return next(new HttpErrors(err.status, `Error retrieving myStudents for contact ${request.profile.contactId}`, { expose: false }));
    }

    if (related.body.totalSize > 1) {
      return next(new HttpErrors(500, `myStudents unexpected response length of ${related.body.totalSize}`, { expose: false }));
    }

    const contacts = related.body.records[0].npe4__Relationships__r.records;

    const studentIds = contacts.map(contact => (contact.npe4__Status__c === 'Current' 
      && contact.npe4__Type__c === 'Student' 
      && contact.npe4__RelatedContact__c));

    const studentContactPromises = [];
    for (let i = 0; i < studentIds.length; i++) {
      studentContactPromises.push(
        superagent.get(`${sobjectsUrl}Contact/${studentIds[i]}`).set('Authorization', `Bearer ${accessToken}`),
      );
    }
    const studentContactData = await Promise.all(studentContactPromises);
    const studentContacts = studentContactData.map(result => (
      {
        id: result.body.Id, 
        firstName: result.body.FirstName, 
        lastName: result.body.LastName, 
        name: result.body.Name,
        grade: result.body.Student_Grade__c,
        schoolId: result.body.Student_ID__c,
        gender: related.body.Gender__c,
        role: 'student',
      }
    ));

    // get student class schedule info
    const studentSchedulePromises = [];
    for (let i = 0; i < studentIds.length; i++) {
      studentSchedulePromises.push(
        superagent.get(`${queryUrl}${classScheduleQuery}'${studentIds[i]}'`).set('Authorization', `Bearer ${accessToken}`),
      );
    }
    const studentScheduleData = await Promise.all(studentSchedulePromises);

    // studentClassIds is an object using student SF ID as key and array of Class__c IDs as value
    const studentClassIds = {};
    for (let i = 0; i < studentScheduleData.length; i++) {
      const id = studentScheduleData[i].body.records[0].Id;
      const classes = studentScheduleData[i].body.records[0].Class_Schedules__r.records;
      studentClassIds[id] = classes.map(c => c.Class__c);
    }
    
    const studentProfiles = [];
    for (let i = 0; i < studentContacts.length; i++) {
      studentProfiles.push(
        {
          ...studentContacts[i],
          classScheduleIds: [...studentClassIds[studentContacts[i].id]],
        },
      );
    }

    return response.json(studentProfiles);
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
