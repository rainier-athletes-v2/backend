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

  // we have credentials now. Need to drill down to user's Contact record to verify their role(s).
  // first, use id url to retrieve their user_id and sobjects url
  const authorizationsUrl = 'https://launchpad.37signals.com/authorization.json';
  let authResponse;
  try {
    authResponse = await superagent.get(authorizationsUrl)
      .set('Authorization', `Bearer ${accessToken}`)
      .set({ 'User-Agent': 'Rainier Athletes Mentor Portal (selpilot@gmail.com)' });
  } catch (err) {
    return next(new HttpErrors(err.status, `Error retrieving info from ${authorizationsUrl}`, { expose: false }));
  }

  const raAccount = authResponse.body.accounts.find(a => a.name.trim() === 'Rainier Athletes') || {};
  const raTokenPayload = {
    accessToken,
    refreshToken,
    accountUrl: raAccount.href,
  };
  console.log('basecamp info:', raTokenPayload);
  return raTokenPayload;
};

const sendCookieResponse = (response, tokenPayload) => {
  const raToken = jsonWebToken.sign({ accessToken: tokenPayload.accessToken, accountUrl: tokenPayload.accountUrl }, process.env.SECRET);
  const firstDot = process.env.CLIENT_URL.indexOf('.');
  const domain = firstDot > 0 ? process.env.CLIENT_URL.slice(firstDot) : null;
  const cookieOptions = { maxAge: 14 * 24 * 60 * 60 * 1000 }; // two weeks
  if (domain) cookieOptions.domain = domain;
  response.cookie('RaBcToken', raToken, cookieOptions);
  // const refreshOptions = { maxAge: 5 * 360 * 24 * 60 * 60 * 1000 };
  response.cookie('RaBcRefresh', tokenPayload.refreshToken, cookieOptions);
  return response.redirect(`${process.env.CLIENT_URL}`);
};

const dumpAccessToken = (token) => {
  if (process.env.NODE_ENV.toLowerCase() === 'development') {
    console.log(`>>>>>>>>> BASECAMP access_token: ${token} <<<<<<<<<<<<`);
  }
};

bcOAuthRouter.post('/api/v2/oauth/bc', async (request, response, next) => {
  // try using the refresh token
  // ?type=refresh&refresh_token=your-current-refresh-token&client_id=your-client-id&redirect_uri=your-redirect-uri&client_secret=your-client-secret
  let refreshResponse;
  try {
    refreshResponse = await superagent.post(process.env.SF_OAUTH_TOKEN_URL)
      .query({
        type: 'refresh',
        refresh_token: request.body.refresh_token,
        client_id: process.env.BC_OAUTH_ID,
        client_secret: process.env.BC_CLIENT_SECRET,
        redirect_uri: `${process.env.API_URL}/unused`,
      });
  } catch (err) {
    console.log('use of refresh token failed', err);
    return next(new HttpErrors(err.status, 'Using refresh token', { expose: false }));
  }
  console.log('refresh token response', refreshResponse.body);

  dumpAccessToken(refreshResponse.body.access_token);

  const tokenPayload = await retrieveBasecampInfo(refreshResponse, next);

  const raToken = jsonWebToken.sign(tokenPayload, process.env.SECRET);
  // const { refreshToken } = tokenPayload;
  // console.log('oauth post response', { raToken, refreshToken });
  return response.json({ raBcToken: raToken }).status(200);
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
      .set({ 'User-Agent': 'Rainier Athletes Mentor Portal (selpilot@gmail.com)' })
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

  return sendCookieResponse(response, raTokenPayload);
});

export default bcOAuthRouter;
