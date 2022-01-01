import { Router } from 'express';
import HttpErrors from 'http-errors';
import superagent from 'superagent';
import jsonWebToken from 'jsonwebtoken';
import timeout from 'connect-timeout';
import bearerAuthMiddleware from '../lib/middleware/bearer-auth-middleware';

const Throttle = require('superagent-throttle');

const throttle = new Throttle({
  active: true,
  rate: 50,
  ratePer: 10000,
  concurrent: 1,
});

const bcUrlRouter = new Router();

const parseLinkHeader = (linkHeaders) => {
  // Link: <https://3.basecampapi.com/999999999/buckets/2085958496/messages.json?page=4>; rel="next"
  if (!linkHeaders) {
    return {};
  }
  const parts = linkHeaders.split(',').reduce((acc, link) => {
    const match = link.match(/<(.*)>; rel="(\w*)"/);
    const url = match[1];
    const rel = match[2];
    acc[rel] = url;
    return acc;
  }, {});
  return parts;
};

const fetch = async (url, auth, next, errorMsg) => {
  let res;

  try {
    res = await superagent.get(url)
      .use(throttle.plugin())
      .set('Authorization', `Bearer ${auth}`)
      .set('User-Agent', 'Rainier Athletes Mentor Portal (selpilot@gmail.com)')
      .set('Content-Type', 'application/json');
  } catch (err) {
    return next(new HttpErrors(err.status, errorMsg, { expose: false }));
  }

  return res;
};

const fetchAllProjects = async (url, auth, next) => {
  const allProjects = [];
  let projects;
  let projUrl = url;

  do {
    // eslint-disable-next-line no-await-in-loop
    projects = await fetch(projUrl, auth, next, `SR Summary GET: Error fetching projects from ${projUrl}`);

    projects.body.forEach((p) => {
      if (p.purpose.toLowerCase().trim() === 'topic') { // mentee projects have purpose === topic
        allProjects.push(p);
      }
    });
    projUrl = parseLinkHeader(projects.get('Link')).next;
  } while (projUrl);

  return allProjects;
};

const fetchProjectPeople = async (project, auth, next) => {
  let peopleUrl = project.url.replace('.json', '/people.json');
  const allPeople = [];
  let totalPeople = 0;
  let people;
  do { 
    try {
      // eslint-disable-next-line no-await-in-loop
      people = await fetch(peopleUrl, auth, next, `SR Summary GET: Error fetching ${peopleUrl}`);
    } catch (err) {
      return next(new HttpErrors(err.status, `Error fetching people at url ${peopleUrl}`));
    }
    if (!totalPeople) {
      totalPeople = people.get('X-Total-Count');
    }
    people.body.forEach(p => allPeople.push(p));
    peopleUrl = parseLinkHeader(people.get('Link')).next;
  } while (peopleUrl);
  return allPeople;
};

const findStudentMessageBoardUrl = async (request, next) => {
  const { accessToken } = request;
  const { studentEmail } = request.query;
  const authorizationUrl = 'https://launchpad.37signals.com/authorization.json';

  const auth = await fetch(authorizationUrl, accessToken, next, 'SR Summary: BC authorization.json request error');
  const raAccount = auth.body.accounts ? auth.body.accounts.find(a => a.name.toLowerCase().trim() === 'rainier athletes') : null;
  if (!raAccount) {
    return next(new HttpErrors(403, 'SR Summary GET: Rainier Athletes account not found among authorization response accounts', { expose: false }));  
  }
  // Get all of mentor's projects (GET /projects.json)
  // for each project id = N
  //     get all the people associated with the project  (GET /projects/N/people.json)
  //     if student is in list of people
  //          add N to list of projects that include both mentor and student
  //          exit loops
  // If list of projects is longer than 1 entry (this will be rare but could happen)
  //     get mentor's help disambiguating (pick the project to post message to)
  // create new message in selected message board (POST /buckets/1/message_boards/3/messages.json) 

  const projectsUrl = `${raAccount.href}/projects.json`;

  const projects = await fetchAllProjects(projectsUrl, accessToken, next);
  if (projects.length === 0) {
    return next(new HttpErrors(404, 'SR Summary GET: No projects found associated with the mentor', { expose: false }));  
  }
  console.log(`>>>> ${projects.length} projects found to search for ${studentEmail}. <<<<`);
  const menteesProjects = [];
  for (let i = 0; i < projects.length; i++) {
    // eslint-disable-next-line no-await-in-loop
    const people = await fetchProjectPeople(projects[i], accessToken, next);
    let menteeFound = false;
    for (let p = 0; p < people.length; p++) {
      if (people[p].email_address.toLowerCase().trim() === studentEmail.toLowerCase().trim()) {
        menteesProjects.push(projects[i]);
        menteeFound = true;
        console.log(`mentee found in project ${i + 1}, person ${p + 1}`);
        break;
      }
    }
    if (menteeFound) break;
    if (request.timedout) {
      return next(new HttpErrors(503, `Request timed out searching ${projects.length} basecamp projects.`, { expose: false}));
    }
  }

  if (menteesProjects.length === 0) {
    return undefined;
  }

  const messageBoard = menteesProjects[0].dock.find(d => d.name === 'message_board') || null;
  const messageBoardUrl = messageBoard && messageBoard.url;
  const messageBoardPostUrl = messageBoardUrl && messageBoardUrl.replace('.json', '/messages.json');

  return messageBoardPostUrl;

  // return 'https://3.basecampapi.com/3595417/buckets/8778597/message_boards/1248902284/messages.json';
};

// const prepContentForBasecamp = (html) => {
//   const text = html.replace(/"/g, '\'');
//   return text;
// };

const fetchRaAccount = async (request, next) => {
  const { accessToken } = request;
  const authorizationUrl = 'https://launchpad.37signals.com/authorization.json';

  const auth = await fetch(authorizationUrl, accessToken, next, 'BC Projects: BC authorization.json request error');
  const raAccount = auth.body.accounts ? auth.body.accounts.find(a => a.name.toLowerCase().trim() === 'rainier athletes') : null;
  if (!raAccount) {
    return next(new HttpErrors(404, 'SR Summary GET: Rainier Athletes account not found among authorization response accounts', { expose: false }));  
  }
  return raAccount;
};

// return all mentor basecamp projects
bcUrlRouter.get('/api/v2/bc-projects', timeout(25000), bearerAuthMiddleware, async (request, response, next) => {
  // request.query = {
  //   basecampToken
  // }
  if (!request.query) {
    return next(new HttpErrors(403, 'BC Projects: Missing request query', { expose: false }));
  }
  if (!request.query.basecampToken) {
    return next(new HttpErrors(403, 'BC Projects: Request missing required Basecamp auth token', { expose: false }));
  }

  const { basecampToken } = request.query;
  request.accessToken = jsonWebToken.verify(basecampToken, process.env.SECRET).accessToken;

  const raAccount = await fetchRaAccount(request, next);

  const projectsUrl = `${raAccount.href}/projects.json`;

  const projects = await fetchAllProjects(projectsUrl, request.accessToken, next);
  
  return response.send({ projects }).status(200);
});

// fetch people associated with project for student email
bcUrlRouter.get('/api/v2/bc-project-scan', timeout(25000), bearerAuthMiddleware, async (request, response, next) => {
  // request.query = {
  //   project, studentEmail, basecampToken
  // }
  if (!request.query) {
    return next(new HttpErrors(403, 'BC Project Scan: Missing request query', { expose: false }));
  }
  if (!request.query.basecampToken) {
    return next(new HttpErrors(403, 'BC Project Scan: Request missing required Basecamp auth token', { expose: false }));
  }
  if (!request.query.studentEmail) {
    return next(new HttpErrors(403, 'BC Project Scan: Request missing required Student Email', { expose: false }));
  }
  if (!request.query.project) {
    return next(new HttpErrors(403, 'BC Project Scan: Request missing required project', { expose: false}));
  }

  const { project, studentEmail, basecampToken } = request.query;
  const { accessToken } = jsonWebToken.verify(basecampToken, process.env.SECRET);

  const people = await fetchProjectPeople(project, accessToken, next);

  let menteeFound = false;
  for (let p = 0; p < people.length; p++) {
    if (people[p].email_address.toLowerCase().trim() === studentEmail.toLowerCase().trim()) {
      // menteesProjects.push(projects[i]);
      menteeFound = true;
      console.log(`mentee found in project <name?>, person ${p + 1}`);
      break;
    }
    if (request.timedout) {
      return next(new HttpErrors(503, 'Request timed out searching project people.', { expose: false}));
    }
  }
  
  if (menteeFound) {
    const messageBoard = project.dock.find(d => d.name === 'message_board') || null;
    const messageBoardUrl = messageBoard && messageBoard.url;
    const messageBoardPostUrl = messageBoardUrl && messageBoardUrl.replace('.json', '/messages.json');

    return response.send({ messageBoardUrl: messageBoardPostUrl }).status(200);
  }
  return response.send({ messageBoardUrl: '' }).status(200);
});

// return message board URL for a given student/mentor pair
// bcUrlRouter.get('/api/v2/synopsissummary', timeout(25000), bearerAuthMiddleware, async (request, response, next) => {
//   // request.query = {
//   //   basecampToken, studentEmail
//   // }
//   if (!request.query) {
//     return next(new HttpErrors(403, 'SR Summary GET: Missing request query', { expose: false }));
//   }
//   if (!request.query.basecampToken) {
//     return next(new HttpErrors(403, 'SR Summary GET: Request missing required Basecamp auth token', { expose: false }));
//   }
//   if (!request.query.studentEmail) {
//     return next(new HttpErrors(403, 'SR Summary GET: Request missing required Student Email', { expose: false }));
//   }

//   const { basecampToken } = request.query;

//   request.accessToken = jsonWebToken.verify(basecampToken, process.env.SECRET).accessToken;

//   const projects = await fetchAllProjects(projectsUrl, accessToken, next);
//   if (projects.length === 0) {
//     return next(new HttpErrors(404, 'SR Summary GET: No projects found associated with the mentor', { expose: false }));  
//   }
//   console.log(`>>>> ${projects.length} projects found to search for ${studentEmail}. <<<<`);
//   return response.send({ messageBoardUrl: studentMessageBoardUrl }).status(200);
// });

// // post synopsis report summary to student's message board
// bcUrlRouter.post('/api/v2/synopsissummary', bearerAuthMiddleware, async (request, response, next) => {
//   // the request.body = {
//   //  subject, content, basecampToken, messageBoardUrl
//   // }
//   if (!request.body) {
//     return next(new HttpErrors(403, 'SR Summary POST: Missing request body', { expose: false }));
//   }
//   if (!request.body.subject || !request.body.content || !request.body.basecampToken || !request.body.messageBoardUrl) {
//     return next(new HttpErrors(403, 'SR Summary POST: Request missing required properties', { expose: false }));
//   }
  
//   // https://3.basecampapi.com/3595417/buckets/8778597/message_boards/1248902284/messages.json
//   const {
//     subject, 
//     content, 
//     basecampToken, 
//     messageBoardUrl, 
//   } = request.body;
  
//   request.accessToken = jsonWebToken.verify(basecampToken, process.env.SECRET).accessToken;

//   const message = {
//     subject,
//     content: prepContentForBasecamp(content),
//     status: 'active',
//   };

//   // let summaryPost;
//   try {
//     await superagent.post(messageBoardUrl)
//       .set('Authorization', `Bearer ${request.accessToken}`)
//       .set('User-Agent', 'Rainier Athletes Mentor Portal (selpilot@gmail.com)')
//       .set('Content-Type', 'application/json')
//       .send(message);
//   } catch (err) {
//     return next(new HttpErrors(500, 'SR Summary POST: Error posting summary message', { expose: false }));
//   }

//   return response.sendStatus(201);
// });

export default bcUrlRouter;
