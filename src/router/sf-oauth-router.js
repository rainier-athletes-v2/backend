import { Router } from 'express';
import superagent from 'superagent';
import HttpErrors from 'http-errors';
import jsonWebToken from 'jsonwebtoken';
import logger from '../lib/logger';

require('dotenv').config();

const sfOAuthRouter = new Router();

const retrieveMentorInfo = async (sfResponse, next) => {
  const accessToken = sfResponse.body.access_token;
  const refreshToken = sfResponse.body.refresh_token;
  // we have credentials now. Need to drill down to user's Contact record to verify their role(s).
  // first, use id url to retrieve their user_id and sobjects url
  const idUrl = sfResponse.body.id;
  let idResponse;
  try {
    idResponse = await superagent.get(idUrl).set('Authorization', `Bearer ${accessToken}`);
  } catch (err) {
    return next(new HttpErrors(err.status, `SF: Error retrieving id from ${idUrl}`, { expose: false }));
  }
  const ptUpdateUrl = `${sfResponse.body.instance_url}/services/data/v${process.env.SF_API_VERSION}/composite/sobjects`;
  const sobjectsUrl = idResponse.body.urls.sobjects.replace('{version}', process.env.SF_API_VERSION);
  const restUrl = idResponse.body.urls.rest.replace('{version}', process.env.SF_API_VERSION);
  const queryUrl = idResponse.body.urls.query.replace('{version}', process.env.SF_API_VERSION).slice(0, -1); // remove trailing '/'
  const userId = idResponse.body.user_id;
  const userUrl = `${sobjectsUrl}User/${userId}`;

  // now get user data
  let userResponse;
  try {
    userResponse = await superagent.get(userUrl).set('Authorization', `Bearer ${accessToken}`);
  } catch (err) {
    return next(new HttpErrors(err.status, `SF: Error retrieving User info from ${sobjectsUrl}User/${userId}`, { expose: false }));
  }

  // now get ContactId and retrieve Contact record
  const contactId = userResponse.body.ContactId;
  const contactUrl = `${sobjectsUrl}Contact/${contactId}`;
  let contactResponse;
  try {
    contactResponse = await superagent.get(contactUrl).set('Authorization', `Bearer ${accessToken}`);
  } catch (err) {
    return next(new HttpErrors(err.status, `SF: Error retrieving Contact info from ${sobjectsUrl}Contact/${contactId}`, { expose: false }));
  }

  // now we can validate user's role as Mentor or Staff
  const validUser = contactResponse.body.Mentor__c || contactResponse.body.Staff__c;
  if (!validUser) {
    return next(new HttpErrors(401, 'SF: User not authorized.', { expose: false }));
  }

  // user is validated.  Build object for use creating raToken
  let userRole = 'unauthorized';
  if (contactResponse.body.Staff__c) {
    userRole = 'admin';
  } else if (contactResponse.body.Mentor__c) {
    userRole = 'mentor';
  }
  
  const raTokenPayload = {
    accessToken,
    refreshToken,
    sobjectsUrl,
    restUrl,
    queryUrl,
    ptUpdateUrl,
    role: userRole,
    contactId,
    contactUrl,
    userId,
    userUrl,
    firstName: idResponse.body.first_name,
    lastName: idResponse.body.last_name,
  };

  return raTokenPayload;
};

const setBCOAuthUrl = () => {
  const baseUrl = process.env.BC_OAUTH_AUTHORIZE_URL;
  const type = 'type=web_server';
  const clientId = `client_id=${process.env.BC_OAUTH_ID.trim()}`;
  const redirect = `redirect_uri=${process.env.API_URL}/oauth/bc`;
  const oAuthUrl = `${baseUrl}?${type}&${clientId}&${redirect}`;
  return oAuthUrl;
};

const sendCookieResponse = (response, tokenPayload) => {
  const raToken = jsonWebToken.sign(tokenPayload, process.env.SECRET);
  const firstDot = process.env.CLIENT_URL.indexOf('.');
  const domain = firstDot > 0 ? process.env.CLIENT_URL.slice(firstDot) : null;
  const cookieOptions = { maxAge: process.env.SF_SESSION_TIMEOUT_MINUTES * 60 * 1000 };
  if (domain) cookieOptions.domain = domain;
  response.cookie('RaSfToken', raToken, cookieOptions);
  response.cookie('RaUser', Buffer.from(tokenPayload.role)
    .toString('base64'), cookieOptions);
  response.cookie('RaSfRefresh', tokenPayload.refreshToken, cookieOptions);
  // return response.redirect(`${process.env.CLIENT_URL}`);
  return response.redirect(setBCOAuthUrl());
};

const dumpAccessToken = (token) => {
  if (process.env.NODE_ENV.toLowerCase() === 'development') {
    console.log(`>>>>>>>>> SF: access_token: ${token} <<<<<<<<<<<<`);
  }
};

sfOAuthRouter.post('/api/v2/oauth/sf', async (request, response, next) => {
  // try using the refresh token
  let refreshResponse;
  try {
    refreshResponse = await superagent.post(process.env.SF_OAUTH_TOKEN_URL)
      .type('form')
      .send({
        grant_type: 'refresh_token',
        refresh_token: request.body.refresh_token,
        client_id: process.env.SF_OAUTH_ID,
      });
  } catch (err) {
    return next(new HttpErrors(err.status, 'SF: Error using refresh token', { expose: false }));
  }
  
  dumpAccessToken(JSON.stringify(refreshResponse.body.access_token, null, 2));
  
  const tokenPayload = await retrieveMentorInfo(refreshResponse, next);

  const raToken = jsonWebToken.sign(tokenPayload, process.env.SECRET);

  return response.json({ raToken, raUser: Buffer.from(tokenPayload.role).toString('base64') }).status(200);
});

sfOAuthRouter.get('/api/v2/oauth/sf', async (request, response, next) => {
  if (!request.query.code) {
    response.redirect(process.env.CLIENT_URL);
    return next(new HttpErrors(500, 'SF: Salesforce OAuth: code not received.'));
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
    return next(new HttpErrors(err.status, 'SF: Salesforce Oauth: error fetching authorization tokens', { expose: false }));
  }

  if (!sfTokenResponse.body.access_token) {
    logger.log(logger.ERROR, 'SF: No access token from Salesforce');
    return response.redirect(process.env.CLIENT_URL);
  }

  dumpAccessToken(JSON.stringify(sfTokenResponse.body.access_token, null, 2));
  
  const raTokenPayload = await retrieveMentorInfo(sfTokenResponse, next);

  return sendCookieResponse(response, raTokenPayload);
});

export default sfOAuthRouter;
