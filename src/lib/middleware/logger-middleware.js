'use strict';

import logger from '../logger';

export default (request, response, next) => {
  let logUrl = request.url.slice(0, 150);
  if (request.url.length > 100) logUrl += '...';
  logger.log(logger.INFO, `${new Date().toISOString()}; Processing a ${request.method} on ${logUrl}`);
  return next();
};
