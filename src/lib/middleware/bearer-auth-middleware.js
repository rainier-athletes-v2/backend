import HttpErrors from 'http-errors';
import jsonWebToken from 'jsonwebtoken';
import { promisify } from 'util';
// import Profile from '../../model/profile';

const jwtVerify = promisify(jsonWebToken.verify);

export default (request, response, next) => {
  if (!request.headers.authorization) return next(new HttpErrors(400, 'BEARER AUTH MIDDLEWARE: no Authorization header', { expose: false }));

  const token = request.headers.authorization.split('Bearer ')[1];
  if (!token) return next(new HttpErrors(401, 'BEARER AUTH MIDDLEWARE: no Bearer token', { expose: false }));

  // let tokenPayload;
  return jwtVerify(token, process.env.SECRET)
    .catch((error) => {
      return Promise.reject(new HttpErrors(401, `BEARER AUTH - unable to verify token ${JSON.stringify(error)}`, { expose: false }));
    })
    .then((decryptedToken) => {;
      request.profile = decryptedToken;
      return next();
    })
    .catch(next);
};
