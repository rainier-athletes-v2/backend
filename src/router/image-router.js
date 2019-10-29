import { Router } from 'express';
import HttpErrors from 'http-errors';
import superagent from 'superagent';
import multer from 'multer';
import bearerAuthMiddleware from '../lib/middleware/bearer-auth-middleware';
// import logger from '../lib/logger';
// import * as soql from '../lib/sf-soql-queries';

const imageRouter = new Router();
const multerUpload = multer({ dest: 'uploads/' });

imageRouter.post('/api/v2/image/upload', bearerAuthMiddleware, multerUpload.single('image'), (request, response, next) => {
  if (!request.body) {
    return next(new HttpErrors(403, 'Single Image Upload POST: Missing request body', { expose: false }));
  }
  if (!request.file) {
    return next(new HttpErrors(403, 'Single Image Upload POST: Missing file in request body', { expose: false }));
  }

  const { file } = request;
  console.log(`name: ${file.originalname}, size: ${file.size}, type: ${file.mimetype}`);
  // console.log(JSON.stringify(files));
  return response.json(['file size', file.size]).status(200);
  // return next(new HttpErrors(500, 'User profile missing from request.', { expose: false }));
});

export default imageRouter;
