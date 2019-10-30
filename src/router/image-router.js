import { Router } from 'express';
import HttpErrors from 'http-errors';
import fetch from 'node-fetch';
import multer from 'multer';
import bearerAuthMiddleware from '../lib/middleware/bearer-auth-middleware';

const imageRouter = new Router();
const multerStorage = multer.memoryStorage();
const multerUpload = multer({ storage: multerStorage });

imageRouter.post('/api/v2/image/upload', bearerAuthMiddleware, multerUpload.single('image'), async (request, response, next) => {
  if (!request.body) {
    return next(new HttpErrors(403, 'Single Image Upload POST: Missing request body', { expose: false }));
  }
  if (!request.file) {
    return next(new HttpErrors(403, 'Single Image Upload POST: Missing file in request body', { expose: false }));
  }
  if (!request.profile.accessToken) {
    return next(new HttpErrors(403, 'Single Image Upload POST: Request missing basecamp token', { expose: false }));
  }

  const { file, body, profile } = request;
  
  let bcResponse;
  try { 
    bcResponse = await fetch(`https://3.basecampapi.com/3595417/attachments.json?name=${body.name}`, {
      method: 'post',
      body: file.buffer,
      headers: { 
        Authorization: `Bearer ${profile.accessToken}`,
        'Content-Type': file.mimetype, 
        'Content-Length': file.size,
      },
    });
  } catch (error) {
    return next(new HttpErrors(error.statusCode, 'Error sending file to basecamp', { expose: false }));
  }
  let responseJson;
  try {
    responseJson = await bcResponse.json();
  } catch (jsonError) {
    return next(new HttpErrors(jsonError.statusCode, 'Error retrieving JSON attachment response', { expose: false }));
  }
  return response.json(responseJson).status(bcResponse.status);
});

export default imageRouter;
