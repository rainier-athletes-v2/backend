import { Router } from 'express';
import HttpErrors from 'http-errors';
import superagent from 'superagent';
import jsonWebToken from 'jsonwebtoken';
import bearerAuthMiddleware from '../lib/middleware/bearer-auth-middleware';

const synopsisSummaryRouter = new Router();

const prepContentForBasecamp = (html) => {
  const text = html.replace(/"/g, '\'');
  return text;
};

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

  try {
    await superagent.post(messageBoardUrl)
      .set('Authorization', `Bearer ${request.accessToken}`)
      .set('User-Agent', 'Rainier Athletes Mentor Portal (selpilot@gmail.com)')
      .set('Content-Type', 'application/json')
      .send(message);
  } catch (err) {
    return next(new HttpErrors(500, 'SR Summary POST: Error posting summary message', { expose: false }));
  }

  return response.sendStatus(201);
});

export default synopsisSummaryRouter;
