import { Router } from 'express';
import { google } from 'googleapis';
import HttpError from 'http-errors';
import pdf from 'html-pdf';
import uuid from 'uuid/v4';
import bearerAuthMiddleware from '../lib/middleware/bearer-auth-middleware';
import createGoogleDriveFunction from '../lib/googleDriveLib';

const synopsisPdfRouter = new Router();

synopsisPdfRouter.post('/api/v2/synopsispdf', bearerAuthMiddleware, async (request, response, next) => {
  const name = typeof request.body.name === 'string' && request.body.name !== '' ? request.body.name.replace(/[^A-Za-z0-9]/gi, '_') : false;
  const school = typeof request.body.school === 'string' && request.body.school !== '' ? request.body.school.replace(/[^A-Za-z0-9]/gi, '_') : false;
  const title = typeof request.body.title === 'string' && request.body.title !== '' ? request.body.title : false;
  const html = typeof request.body.html === 'string' && request.body.html !== '' ? request.body.html : false;
  if (!(name && school && html && title)) return next(new HttpError(400, 'Missing or invalid name, school, title or html parameters on request body', { expose: false }));
  
  const oAuth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_ID,
    process.env.GOOGLE_OAUTH_SECRET,
    `${process.env.API_URL}/oauth/google email profile openid`,
  );

  oAuth2Client.setCredentials(request.profile.googleTokenResponse);

  const googleDrive = google.drive({ version: 'v3', auth: oAuth2Client });

  // const { googleDrive } = request.profile;
  const studentFolderName = name;
  const schoolFolderName = school;
  const pdfName = `${title}.pdf`;
  const TEMP_FILE = `${__dirname}/${uuid()}.pdf`;

  const sendFileToGoogleDrive = createGoogleDriveFunction(googleDrive, TEMP_FILE, pdfName, schoolFolderName, studentFolderName, response, next);

  const options = {
    border: {
      top: '0.8in',
      right: '0.8in',
      left: '0.5in',
    },
    format: 'Letter',
    orientation: 'portrait',
    paginationOffset: 1,
    footer: {
      height: '28mm',
      contents: {
        default: '<span style="color: #444;">{{page}}</span>/<span>{{pages}}</span>', // fallback value
      },
    },
  };

  pdf.create(html, options).toFile(TEMP_FILE,
    (err) => {
      if (err) return next(new HttpError(500, 'Error creating pdf from html', { expose: false }));
      return sendFileToGoogleDrive();
    });

  return undefined; // to satisfy linter...
});

export default synopsisPdfRouter;
