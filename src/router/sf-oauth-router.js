import { Router } from 'express';
import superagent from 'superagent';
import HttpErrors from 'http-errors';
import jwt from 'jsonwebtoken';
import Profile from '../model/profile';
import logger from '../lib/logger';

// const SF_OAUTH_URL = 'https://login.salesforce.com/services/oauth2/token';

require('dotenv').config();

const sfOAuthRouter = new Router();

sfOAuthRouter.get('/api/v2/oauth/sf', async (request, response, next) => {
  if (!request.query.code) {
    response.redirect(process.env.CLIENT_URL);
    return next(new HttpErrors(500, 'Salesforce OAuth Code Error'));
  }
  console.log(`|${request.query.code}|`);

  // const code = request.query.code.slice(0, request.query.code.length - 2);
  // console.log(`|${code}|`);

  const temp = {
    code: request.query.code,
    access_type: 'offline',
    grant_type: 'authorization_code',
    client_id: process.env.SF_OAUTH_ID,
    // client_secret: process.env.SF_OAUTH_SECRET,
    redirect_uri: `${process.env.API_URL}/oauth/sf`,
  };
  console.log(temp);

  let sfTokenResponse;
  try {
    sfTokenResponse = await superagent.post(process.env.SF_OAUTH_TOKEN_URL)
      .type('form')
      .send({
        code: request.query.code,
        // access_type: 'offline',
        grant_type: 'authorization_code',
        client_id: process.env.SF_OAUTH_ID,
        // client_secret: process.env.SF_OAUTH_SECRET,
        redirect_uri: `${process.env.API_URL}/oauth/sf`,
      });
  } catch (err) {
    console.error(err);
    return next(new HttpErrors(err.status, 'Error from Salesforce Oauth error fetching authorization tokens', { expose: false }));
  }

  console.log('sfTokenResponse', sfTokenResponse.body);
  
  if (!sfTokenResponse.body.access_token) {
    logger.log(logger.ERROR, 'No Token from Google');
    return response.redirect(process.env.CLIENT_URL);
  }

  const { access_token, id_token, signature, id, instance_url } = sfTokenResponse.body;

  const sfUserInfo = jwt.decode(id_token);
  console.log('sfUserInfo decode', sfUserInfo);
  const {
    email, 
    picture, 
    sub,  
    nickname,
  } = sfUserInfo;
  const sfProfile = sfUserInfo.profile;
  const firstName = sfUserInfo.given_name;
  const lastName = sfUserInfo.family_name;

  // at this point Oauth is complete. Now we need to see they are
  // in the profile collection
  let profile;
  try {
    profile = await superagent.get(sfProfile)
  } catch (err) {
    return next(new HttpErrors(err.status, `Error retrieving profile from ${sfProfile}`, { expose: false }));
  }


  if (!profile) {
    // user not in profile collection, check process.env.ROOT_ADMIN
    const rootAdmin = JSON.parse(process.env.ROOT_ADMIN);
    if (email !== rootAdmin.email) {
      return next(new HttpErrors(401, 'User not recognized'));
    }
    // they're authorized. Create a profile for them
    logger.log(logger.INFO, 'Creating ROOT_ADMIN profile');
    const newProfile = new Profile({
      primaryEmail: email,
      firstName,
      lastName,
      picture,
      role: rootAdmin.role,
    });
    try {
      profile = await newProfile.save();
    } catch (err) {
      logger.log(logger.ERROR, `Error saving new ROOT ADMIN profile: ${err}`);
    }
  }

  // at this point we have a profile for sure
  if (!(profile.role === 'admin' || profile.role === 'mentor')) {
    return next(new HttpErrors(401, 'User not authorized.'));  
  }
  logger.log(logger.INFO, 'Profile validated');

  // this call returns a jwt with profileId and sf tokens
  // as payload
  const raToken = await profile.createTokenPromise(sfTokenResponse.body);

  // send raToken as cookie and in response json
  const firstDot = process.env.CLIENT_URL.indexOf('.');
  const domain = firstDot > 0 ? process.env.CLIENT_URL.slice(firstDot) : null;
  const cookieOptions = { maxAge: 7 * 1000 * 60 * 60 * 24 };
  if (domain) cookieOptions.domain = domain;
  response.cookie('RaToken', raToken, cookieOptions);
  response.cookie('RaUser', Buffer.from(profile.role)
    .toString('base64'), cookieOptions);
  return response.redirect(`${process.env.CLIENT_URL}#GET-TOKEN`);
});

export default sfOAuthRouter;
