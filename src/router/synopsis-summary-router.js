import { Router } from 'express';
import HttpErrors from 'http-errors';
import superagent from 'superagent';
import jsonWebToken from 'jsonwebtoken';
import bearerAuthMiddleware from '../lib/middleware/bearer-auth-middleware';

const synopsisSummaryRouter = new Router();

const pageUrl = (url, page) => (`${url}?page=${page}`);

const fetch = async (url, auth, next, errorMsg) => {
  let res;
  // console.log('fetch url', url, 'auth', auth);
  try {
    res = await superagent.get(url)
      .set('Authorization', `Bearer ${auth}`)
      .set('User-Agent', 'Rainier Athletes Mentor Portal (selpilot@gmail.com)')
      .set('Content-Type', 'application/json');
  } catch (err) {
    return next(new HttpErrors(err.status, errorMsg, { expose: false }));
  }
  // console.log('fetch', res.status);
  return res;
};

const fetchAllProjects = async (url, auth, next) => {
  let page = 1;
  const allProjects = [];
  let projects;
  do {
    // eslint-disable-next-line no-await-in-loop
    projects = await fetch(pageUrl(url, page), auth, next, `SR Summary GET: Error fetching page ${page} of projects`);
    projects.body.forEach((p) => {
      if (p.purpose.toLowerCase().trim() === 'topic') { // mentee projects have purpose === topic
        allProjects.push(p);
      }
    });
    page += 1;
    // eslint-disable-next-line no-await-in-loop
    // projects = await fetch(pageUrl(url, page), auth, next, `SR Summary: Error fetching page ${page} of projects`);
  } while (projects.get('Link'));
  console.log(`${page - 1} pages of projects found`);
  return allProjects;
};

const fetchProjectPeople = async (project, auth, next) => {
  const peopleUrl = project.url.replace('.json', '/people.json');
  const allPeople = [];
  let page = 1;
  let people;
  do {
    // eslint-disable-next-line no-await-in-loop
    people = await fetch(pageUrl(peopleUrl, page), auth, next, `SR Summary GET: Error fetching page ${page} of project people`);
    people.body.forEach(p => allPeople.push(p));
    page += 1;
    // eslint-disable-next-line no-await-in-loop
  } while (people.get('Link'));
  return allPeople;
};

const findStudentMessageBoardUrl = async (request, next) => {
  const { accessToken } = request;
  const { studentEmail } = request.query;
  const authorizationUrl = 'https://launchpad.37signals.com/authorization.json';

  console.log('requesting authorization');
  const auth = await fetch(authorizationUrl, accessToken, next, 'SR Summary: BC authorization.json request error');

  const raAccount = auth.body.accounts ? auth.body.accounts.find(a => a.name.toLowerCase().trim() === 'rainier athletes') : null;
  if (!raAccount) {
    return next(new HttpErrors(403, 'SR Summary GET: Rainier Athletes account not found among authorization response accounts', { expose: false }));  
  }
  console.log('raAccount', JSON.stringify(raAccount, null, 2));
  // Get all of mentor's projects (GET /projects.json)
  // for each project id = N
  //     get all the people associated with the project  (GET /projects/N/people.json)
  //     if student is in list of people
  //          add N to list of projects that include both mentor and student
  // If list of projects is longer than 1 entry (this will be rare but could happen)
  //     get mentor's help disambiguating (pick the project to post message to)
  // create new message in selected message board (POST /buckets/1/message_boards/3/messages.json) 

  const projectsUrl = `${raAccount.href}/projects.json`;
  console.log('projectsUrl', projectsUrl);
  const projects = await fetchAllProjects(projectsUrl, accessToken, next);
  if (projects.length === 0) {
    return next(new HttpErrors(500, 'SR Summary GET: No projects found associated with the mentor', { expose: false }));  
  }
  console.log('found', projects.length, 'topic (student) projects');
  const menteesProjects = [];
  for (let i = 0; i < projects.length; i++) {
    // eslint-disable-next-line no-await-in-loop
    const people = await fetchProjectPeople(projects[i], accessToken, next);
    let menteeFound = false;
    for (let p = 0; p < people.length; p++) {
      if (people[p].email_address.toLowerCase().trim() === studentEmail.toLowerCase().trim()) {
        menteesProjects.push(projects[i]);
        menteeFound = true;
        console.log('mentee found');
        break;
      }
    }
    if (menteeFound) break;
  }

  // console.log('found', menteesProjects.length, 'joint projects');
  // if (menteesProjects.length > 1) {
  //   console.log('More than 1 project with both mentor and mentee as members!');
  //   console.log(JSON.stringify(menteesProjects, null, 2));
  //   // for now...
  //   return next(new HttpErrors(500, 'SR Summary GET: More than 1 project with both mentor and mentee as members!', { expose: false })); 
  // }
  if (menteesProjects.length === 0) {
    return undefined;
  }
  const messageBoard = menteesProjects[0].dock.find(d => d.name === 'message_board') || null;
  const messageBoardUrl = messageBoard && messageBoard.url;
  const messageBoardPostUrl = messageBoardUrl && messageBoardUrl.replace('.json', '/messages.json');
  // console.log('messageBoardPostUrl', messageBoardPostUrl);
  return messageBoardPostUrl;

  // return 'https://3.basecampapi.com/3595417/buckets/8778597/message_boards/1248902284/messages.json';
};

const prepContentForBasecamp = (html) => {
  const text = html.replace(/"/g, '\'');
  return text;
};

// return message board URL for a given student/mentor pair
synopsisSummaryRouter.get('/api/v2/synopsissummary', bearerAuthMiddleware, async (request, response, next) => {
  // request.query = {
  //   basecampToken, studentEmail
  // }
  console.log('studentEmail', request.query.studentEmail, 'basecampToken truthy?', !!request.query.basecampToken);
  if (!request.query) {
    return next(new HttpErrors(403, 'SR Summary GET: Missing request query', { expose: false }));
  }
  if (!request.query.basecampToken || !request.query.studentEmail) {
    return next(new HttpErrors(403, 'SR Summary GET: Request missing required query parameters', { expose: false }));
  }

  const { basecampToken } = request.query;

  request.accessToken = jsonWebToken.verify(basecampToken, process.env.SECRET).accessToken;

  console.log('sr get calling findStudentMessageBoardUrl');
  const studentMessageBoardUrl = await findStudentMessageBoardUrl(request);
  if (!studentMessageBoardUrl) {
    return next(new HttpErrors(500, 'SR Summary GET: No message board found under mentor with student', { expose: false }));
  }
  console.log('GET returning', studentMessageBoardUrl);
  response.send({ messageBoardUrl: studentMessageBoardUrl }).status(200);
});

// post synopsis report summary to student's message board
synopsisSummaryRouter.post('/api/v2/synopsissummary', bearerAuthMiddleware, async (request, response, next) => {
  // the request.body = {
  //  subject, content, basecampToken, messageBoardUrl
  // }
  if (!request.body) {
    return next(new HttpErrors(403, 'SR Summary POST: Missing request body', { expose: false }));
  }
  if (!request.body.subject || !request.body.content || !request.body.basecampToken || !request.body.messageBoardUrl) {
    return next(new HttpErrors(403, 'SR Summary POST: Request missing required properties', { expose: false }));
  }
  
  // https://3.basecampapi.com/3595417/buckets/8778597/message_boards/1248902284/messages.json
  const {
    subject, 
    content, 
    basecampToken, 
    messageBoardUrl, 
  } = request.body;
  
  request.accessToken = jsonWebToken.verify(basecampToken, process.env.SECRET).accessToken;

  const message = {
    subject,
    content: prepContentForBasecamp(content),
    status: 'active',
  };

  let result;
  try {
    result = await superagent.post(messageBoardUrl)
      .set('Authorization', `Bearer ${request.accessToken}`)
      .set('User-Agent', 'Rainier Athletes Mentor Portal (selpilot@gmail.com)')
      .set('Content-Type', 'application/json')
      .send(message);
  } catch (err) {
    console.log('Error posting message to basecamp', JSON.stringify(err, null, 2));
    return next(new HttpErrors(500, 'SR Summary POST: Error posting summary message', { expose: false }));
  }
  console.log('returning good status', result.status);
  return response.sendStatus(201);
});

export default synopsisSummaryRouter;
