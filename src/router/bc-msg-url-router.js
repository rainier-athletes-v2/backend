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

  const rawProjects = await fetchAllProjects(projectsUrl, request.accessToken, next);
  const reducedProjects = rawProjects.map(p => ({
    name: p.name,
    url: p.url,
    msgUrl: p.dock.find(d => d.name === 'message_board').url || null,
  }));
  return response.send({ projects: reducedProjects }).status(200);
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
    return next(new HttpErrors(403, 'BC Project Scan: Request missing required project', { expose: false }));
  }
  
  const buff = Buffer.from(request.query.project, 'base64');
  const project = JSON.parse(buff.toString('utf8'));
  const { studentEmail, basecampToken } = request.query;
  const { accessToken } = jsonWebToken.verify(basecampToken, process.env.SECRET);

  const people = await fetchProjectPeople(project, accessToken, next);

  let menteeFound = false;
  for (let p = 0; p < people.length; p++) {
    if (people[p].email_address.toLowerCase().trim() === studentEmail.toLowerCase().trim()) {
      menteeFound = true;
      break;
    }
    if (request.timedout) {
      return next(new HttpErrors(503, `Request timed out searching project people of project ${project.name}.`, { expose: false }));
    }
  }
  
  if (!menteeFound) {
    return response.send({ messageBoardUrl: null }).status(200);
  }
  const messageBoardUrl = project.msgUrl;
  // const messageBoardUrl = messageBoard && messageBoard.url;
  const messageBoardPostUrl = messageBoardUrl && messageBoardUrl.replace('.json', '/messages.json');

  return response.send({ messageBoardUrl: messageBoardPostUrl }).status(200);
});

export default bcUrlRouter;
