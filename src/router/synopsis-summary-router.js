import { Router } from 'express';
import HttpErrors from 'http-errors';
import superagent from 'superagent';
import bearerAuthMiddleware from '../lib/middleware/bearer-auth-middleware';

const synopsisSummaryRouter = new Router();

const fetch = async (url, auth, next, errorMsg) => {
  let res;
  try {
    res = await superagent.get(url)
      .set('Authorization', `Bearer ${auth}`)
      .set('User-Agent', 'Rainier Athletes Mentor Portal (selpilot@gmail.com)')
      .set('Content-Type', 'application/json')
  } catch (err) {
    return next(new HttpErrors(err.status, errorMsg, { expose: false }));
  }
  return res;
};

const fetchAllProjects = async (url, auth, next) => {
  let page = 1;
  const pageUrl = p => (`${url}/page=${p}`);
  const allProjects = [];
  let projects = await fetch(pageUrl(page), auth, next, `SR Summary: Error fetching page ${page} of projects`);
  while (projects.body.length) {
    projects.body.forEach((p) => {
      if (p.purpose.toLowerCase().trim() === 'topic') { // mentee projects have purpose === topic
        allProjects.push(p);
      }
    });
    page += 1;
    // eslint-disable-next-line no-await-in-loop
    projects = await fetch(pageUrl(page), auth, next, `SR Summary: Error fetching page ${page} of projects`);
  }
  return allProjects;
};

const fetchProjectPeople = async (project, auth, next) => {
  const peopleUrl = project.url.replace('.json', '/people.json');
  const pageUrl = p => (`${peopleUrl}/page=${p}`);
  const allPeople = [];
  let page = 1;
  let people = await fetch(pageUrl(page), auth, next, `SR Summary: Error fetching page ${page} of project people`);
  while (people.body.length) {
    people.body.forEach(p => allPeople.push(p));
    page += 1;
    // eslint-disable-next-line no-await-in-loop
    people = await fetch(pageUrl(page), auth, next, `SR Summary: Error fetching page ${page} of project people`);
  }
  return allPeople;
};

const findStudentMessageBoardUrl = async (request, next) => {
  const { studentEmail, basecampToken } = request.body;
  const authorizationUrl = 'https://launchpad.37signals.com/authorization.json';

  const auth = await fetch(authorizationUrl, basecampToken, next, 'SR Summary: BC authorization.json request error');

  const raAccount = auth.body.accounts ? auth.body.accounts.find(a => a.name.toLowerCase().trim() === 'rainier athletes') : null;
  if (!raAccount) {
    return next(new HttpErrors(403, 'SR Summary: Rainier Athletes account not found among authorization response accounts', { expose: false }));  
  }

  // Get all of mentor's projects (GET /projects.json)
  // for each project id = N
  //     get all the people associated with the project  (GET /projects/N/people.json)
  //     if student is in list of people
  //          add N to list of projects that include both mentor and student
  // If list of projects is longer than 1 entry (this will be rare but could happen)
  //     get mentor's help disambiguating (pick the project to post message to)
  // create new message in selected message board (POST /buckets/1/message_boards/3/messages.json) 

  const projectsUrl = `${raAccount.href}/projects.json`;

  const projects = fetchAllProjects(projectsUrl, basecampToken, next);
  if (projects.length === 0) {
    return next(new HttpErrors(500, 'SR Summary: No projects found associated with the mentor', { expose: false }));  
  }

  const menteesProjects = [];
  for (let i = 0; i < projects.length; i++) {
    // eslint-disable-next-line no-await-in-loop
    const people = await fetchProjectPeople(projects[i], basecampToken, next);
    people.forEach((person) => {
      if (person.email_address.toLowerCase().trim() === studentEmail.toLowerCase().trim()) {
        menteesProjects.push(projects[i]);
      }
    });
  }

  if (menteesProjects.length > 1) {
    console.log('More than 1 project with both mentor and mentee as members!');
    console.log(JSON.stringify(menteesProjects, null, 2));
    // for now...
    return next(new HttpErrors(500, 'SR Summary: More than 1 project with both mentor and mentee as members!', { expose: false })); 
  }

  const messageBoard = menteesProjects[0].dock.find(d => d.name === 'message_board') || null;
  const messageBoardUrl = messageBoard && messageBoard.url;
  const messageBoardPostUrl = messageBoardUrl && messageBoardUrl.replace('.json', '/messages.json');
  return messageBoardPostUrl;

  // return 'https://3.basecampapi.com/3595417/buckets/8778597/message_boards/1248902284/messages.json';
};

const prepContentForBasecamp = (html) => {
  const text = html.replace(/"/g, '\'');
  return text;
};

synopsisSummaryRouter.post('/api/v2/synopsissummary', bearerAuthMiddleware, async (request, response, next) => {
  if (!request.body) {
    return next(new HttpErrors(403, 'SR Summary: Missing request body', { expose: false }));
  }
  if (!request.body.subject || !request.body.content || !request.body.basecampToken || !request.body.studentEmail) {
    return next(new HttpErrors(403, 'SR Summary: Request missing required properties', { expose: false }));
  }
  console.log('synopsisSummaryRouter received', request.body);
  
  // https://3.basecampapi.com/3595417/buckets/8778597/message_boards/1248902284/messages.json
  const {
    subject, 
    content, 
    basecampToken,  
  } = request.body;
  
  const message = {
    subject,
    content: prepContentForBasecamp(content),
    status: 'active',
  };
  
  
  const studentMessageBoard = await findStudentMessageBoardUrl(request);
  
  console.log('sr summaryRouter sending', JSON.stringify(message, null, 2));
  let result;
  try {
    result = await superagent.post(studentMessageBoard)
      .set('Authorization', `Bearer ${basecampToken}`)
      .set('User-Agent', 'Rainier Athletes Mentor Portal (selpilot@gmail.com)')
      .set('Content-Type', 'application/json')
      .json(message);
  } catch (err) {
    console.log('Error posting message to basecamp', err.status);
  }
  console.log('status: ', result.status);
  console.log(JSON.stringify(result.body, null, 2));
  return response.status(201);
});

export default synopsisSummaryRouter;
