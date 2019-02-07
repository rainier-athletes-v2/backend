import { Router } from 'express';
import superagent from 'superagent';
import HttpErrors from 'http-errors';
import jsonWebToken from 'jsonwebtoken';
import logger from '../lib/logger';

require('dotenv').config();

const sfOAuthRouter = new Router();

sfOAuthRouter.get('/api/v2/oauth/sf', async (request, response, next) => {
  if (!request.query.code) {
    response.redirect(process.env.CLIENT_URL);
    return next(new HttpErrors(500, 'Salesforce OAuth: code not received.'));
  }

  let sfTokenResponse;
  try {
    sfTokenResponse = await superagent.post(process.env.SF_OAUTH_TOKEN_URL)
      .type('form')
      .send({
        code: request.query.code,
        grant_type: 'authorization_code',
        client_id: process.env.SF_OAUTH_ID,
        redirect_uri: `${process.env.API_URL}/oauth/sf`,
      });
  } catch (err) {
    return next(new HttpErrors(err.status, 'Salesforce Oauth: error fetching authorization tokens', { expose: false }));
  }

  console.log('sfTokenResponse access_token', sfTokenResponse.body.access_token);
  
  if (!sfTokenResponse.body.access_token) {
    logger.log(logger.ERROR, 'No access token from Salesforce');
    return response.redirect(process.env.CLIENT_URL);
  }

  const accessToken = sfTokenResponse.body.access_token;

  // we have credentials now. Need to drill down to user's Contact record to verify their role(s).
  // first, use id url to retrieve their user_id and sobjects url
  const idUrl = sfTokenResponse.body.id;
  let idResponse;
  try {
    idResponse = await superagent.get(idUrl).set('Authorization', `Bearer ${accessToken}`);
  } catch (err) {
    console.log('id retrieval error', err);
    return next(new HttpErrors(err.status, `Error retrieving id from ${idUrl}`, { expose: false }));
  }
  const sobjectsUrl = idResponse.body.urls.sobjects.replace('{version}', process.env.SF_API_VERSION);
  const queryUrl = idResponse.body.urls.query.replace('{version}', process.env.SF_API_VERSION);
  const userId = idResponse.body.user_id;
  const userUrl = `${sobjectsUrl}User/${userId}`;
  console.log('idResponse userUrl:', userUrl);

  // now get user data
  let userResponse;
  try {
    userResponse = await superagent.get(userUrl).set('Authorization', `Bearer ${accessToken}`);
  } catch (err) {
    console.log('User retrieval error', err);
    return next(new HttpErrors(err.status, `Error retrieving User info from ${sobjectsUrl}User/${userId}`, { expose: false }));
  }
  
  // now get ContactId and retrieve Contact record
  const contactId = userResponse.body.ContactId;
  const contactUrl = `${sobjectsUrl}Contact/${contactId}`;
  console.log('userResponse contactUrl', contactUrl);
  let contactResponse;
  try {
    contactResponse = await superagent.get(contactUrl).set('Authorization', `Bearer ${accessToken}`);
  } catch (err) {
    console.log('contact retrieval error', err);
    return next(new HttpErrors(err.status, `Error retrieving Contact info from ${sobjectsUrl}Contact/${contactId}`, { expose: false }));
  }
  console.log('contactResponse Mentor__c', contactResponse.body.Mentor__c, 'Staff__c', contactResponse.body.Staff__c);

  // now we can validate user's role as Mentor or Staff
  const validUser = contactResponse.body.Mentor__c || contactResponse.body.Staff__c;
  if (!validUser) {
    return next(new HttpErrors(401, 'User not authorized.', { expose: false }));
  }
  logger.log(logger.INFO, 'User validated as Mentor and/or Staff');

  // user is validated.  Build object for use creating raToken
  const raTokenPayload = {
    accessToken,
    sobjectsUrl,
    queryUrl,
    role: contactResponse.body.Mentor__c ? 'mentor' : 'staff',
    contactId,
    contactUrl,
    userId,
    userUrl,
    firstName: idResponse.body.first_name,
    lastName: idResponse.body.last_name,
    
  };
  console.log('raTokenPayload', raTokenPayload);
  
  const raToken = jsonWebToken.sign(raTokenPayload, process.env.SECRET);

  // send raToken as cookie and in response json
  const firstDot = process.env.CLIENT_URL.indexOf('.');
  const domain = firstDot > 0 ? process.env.CLIENT_URL.slice(firstDot) : null;
  const cookieOptions = { maxAge: 7 * 1000 * 60 * 60 * 24 };
  if (domain) cookieOptions.domain = domain;
  response.cookie('RaToken', raToken, cookieOptions);
  response.cookie('RaUser', Buffer.from(raTokenPayload.role)
    .toString('base64'), cookieOptions);
  return response.redirect(`${process.env.CLIENT_URL}#GET-TOKEN`);
});

export default sfOAuthRouter;
