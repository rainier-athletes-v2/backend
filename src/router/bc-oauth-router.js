import { Router } from 'express';
import superagent from 'superagent';
import HttpErrors from 'http-errors';
import jsonWebToken from 'jsonwebtoken';
// import { google } from 'googleapis';
import logger from '../lib/logger';

require('dotenv').config();

const bcOAuthRouter = new Router();

const retrieveBasecampInfo = async (bcResponse, next) => {
  const accessToken = bcResponse.body.access_token;
  const refreshToken = bcResponse.body.refresh_token;
  console.log('bcResponse.body', bcResponse.body);
  // we have credentials now. Need to drill down to user's Contact record to verify their role(s).
  // first, use id url to retrieve their user_id and sobjects url
  const accountsUrl = 'https://launchpad.37signals.com/authorization.json';
  let accountResponse;
  try {
    accountResponse = await superagent.get(accountsUrl).set('Authorization', `Bearer ${accessToken}`);
  } catch (err) {
    return next(new HttpErrors(err.status, `Error retrieving id from ${accountsUrl}`, { expose: false }));
  }
  // const ptUpdateUrl = `${sfResponse.body.instance_url}/services/data/v${process.env.SF_API_VERSION}/composite/sobjects`;
  // const sobjectsUrl = idResponse.body.urls.sobjects.replace('{version}', process.env.SF_API_VERSION);
  // const queryUrl = idResponse.body.urls.query.replace('{version}', process.env.SF_API_VERSION);
  // const userId = idResponse.body.user_id;
  // const userUrl = `${sobjectsUrl}User/${userId}`;

  // // now get user data
  // let userResponse;
  // try {
  //   userResponse = await superagent.get(userUrl).set('Authorization', `Bearer ${accessToken}`);
  // } catch (err) {
  //   return next(new HttpErrors(err.status, `Error retrieving User info from ${sobjectsUrl}User/${userId}`, { expose: false }));
  // }

  // // now get ContactId and retrieve Contact record
  // const contactId = userResponse.body.ContactId;
  // const contactUrl = `${sobjectsUrl}Contact/${contactId}`;
  // let contactResponse;
  // try {
  //   contactResponse = await superagent.get(contactUrl).set('Authorization', `Bearer ${accessToken}`);
  // } catch (err) {
  //   return next(new HttpErrors(err.status, `Error retrieving Contact info from ${sobjectsUrl}Contact/${contactId}`, { expose: false }));
  // }

  // // now we can validate user's role as Mentor or Staff
  // const validUser = contactResponse.body.Mentor__c || contactResponse.body.Staff__c;
  // if (!validUser) {
  //   return next(new HttpErrors(401, 'User not authorized.', { expose: false }));
  // }

  // // user is validated.  Build object for use creating raToken
  // let userRole = 'unauthorized';
  // if (contactResponse.body.Staff__c) {
  //   userRole = 'admin';
  // } else if (contactResponse.body.Mentor__c) {
  //   userRole = 'mentor';
  // }

  // const raTokenPayload = {
  //   accessToken,
  //   refreshToken,
  //   sobjectsUrl,
  //   queryUrl,
  //   ptUpdateUrl,
  //   role: userRole,
  //   contactId,
  //   contactUrl,
  //   userId,
  //   userUrl,
  //   firstName: idResponse.body.first_name,
  //   lastName: idResponse.body.last_name,
  // };

  return accountResponse.body;
};

const sendCookieResponse = (response, tokenPayload) => {
  const raToken = jsonWebToken.sign(tokenPayload, process.env.SECRET);
  const firstDot = process.env.CLIENT_URL.indexOf('.');
  const domain = firstDot > 0 ? process.env.CLIENT_URL.slice(firstDot) : null;
  const cookieOptions = { maxAge: process.env.SF_SESSION_TIMEOUT_MINUTES * 60 * 1000 };
  if (domain) cookieOptions.domain = domain;
  response.cookie('RaToken', raToken, cookieOptions);
  response.cookie('RaUser', Buffer.from(tokenPayload.role)
    .toString('base64'), cookieOptions);
  const refreshOptions = { maxAge: 5 * 360 * 24 * 60 * 60 * 1000 };
  response.cookie('RaRefresh', tokenPayload.refreshToken, refreshOptions);
  return response.redirect(`${process.env.CLIENT_URL}`);
};

const dumpAccessToken = (token) => {
  if (process.env.NODE_ENV.toLowerCase() === 'development') {
    console.log(`>>>>>>>>> BASECAMP access_token: ${token} <<<<<<<<<<<<`);
  }
};

bcOAuthRouter.post('/api/v2/oauth/bc', async (request, response, next) => {
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
    console.log('use of refresh token failed', err);
    return next(new HttpErrors(err.status, 'Using refresh token', { expose: false }));
  }
  
  dumpAccessToken(refreshResponse.body.access_token);

  const tokenPayload = await retrieveBasecampInfo(refreshResponse, next);

  const raToken = jsonWebToken.sign(tokenPayload, process.env.SECRET);
  // const { refreshToken } = tokenPayload;
  // console.log('oauth post response', { raToken, refreshToken });
  return response.json({ raToken, raUser: Buffer.from(tokenPayload.role).toString('base64') }).status(200);
});

bcOAuthRouter.get('/api/v2/oauth/bc', async (request, response, next) => {
  if (!request.query.code) {
    response.redirect(process.env.CLIENT_URL);
    return next(new HttpErrors(500, 'Salesforce OAuth: code not received.'));
  }
  // ?type=web_server&client_id=your-client-id&redirect_uri=your-redirect-uri&client_secret=your-client-secret&code=verification-code
  let bcTokenResponse;
  try {
    bcTokenResponse = await superagent.post(process.env.BC_OAUTH_TOKEN_URL)
      .query({
        type: 'web_server',
        client_id: process.env.BC_OAUTH_ID,
        redirect_uri: `${process.env.API_URL}/oauth/bc`,
        client_secret: process.env.BC_CLIENT_SECRET,
        code: request.query.code,
      });
  } catch (err) {
    return next(new HttpErrors(err.status, 'Salesforce Oauth: error fetching authorization tokens', { expose: false }));
  }

  if (!bcTokenResponse.body.access_token) {
    logger.log(logger.ERROR, 'No access token from Salesforce');
    return response.redirect(process.env.CLIENT_URL);
  }

  dumpAccessToken(bcTokenResponse.body.access_token);
  
  const raTokenPayload = await retrieveBasecampInfo(bcTokenResponse, next);

  return response.json(raTokenPayload);
});

export default bcOAuthRouter;
