import express from 'express';
import cors from 'cors';
import HttpError from 'http-errors';
import logger from './logger';

// middleware
import errorMiddleware from './middleware/error-middleware';
import loggerMiddleware from './middleware/logger-middleware';

// our routes
import sfOauthRouter from '../router/sf-oauth-router';
import bcOauthRouter from '../router/bc-oauth-router';
import profileRouter from '../router/profile-router';
import synopsisReportRouter from '../router/synopsis-report-router';
import synopsisPdfRouter from '../router/synopsis-pdf-router';

const app = express();
const PORT = process.env.PORT || 3000;
let server = null;

const originWhitelist = JSON.parse(process.env.CORS_ORIGINS);

const corsOptions2 = {
  origin: (origin, callback) => {
    if (originWhitelist.indexOf(origin) !== -1) {
      callback(null, true);
    } else if (typeof origin === 'undefined') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
};
app.options('*', cors(corsOptions2));
app.use(cors(corsOptions2));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());


// our own api routers or middleware
app.use(loggerMiddleware);
app.use(sfOauthRouter);
app.use(bcOauthRouter);
app.use(profileRouter);
app.use(synopsisReportRouter);
app.use(synopsisPdfRouter);

app.all('*', (request, response, next) => {
  logger.log(logger.INFO, 'returning 404 from the catch/all route');
  return next(new HttpError(404, 'Route Not Registered', { expose: false }));
});

app.use(errorMiddleware);

const startServer = () => {
  server = app.listen(PORT, () => {
    console.log(`Server up on port ${PORT}`);
  });
};

const stopServer = () => {
  server.close();
};

export { startServer, stopServer };
