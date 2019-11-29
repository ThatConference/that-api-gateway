/* eslint-disable no-console */
/* eslint-disable import/prefer-default-export */
import 'dotenv/config';
import connect from 'connect';
import cors from 'cors';
import loglevel, { Logger } from 'loglevel';
import loglevelDebug from 'loglevel-debug';
import responseTime from 'response-time';
import * as Sentry from '@sentry/node';
import uuid from 'uuid/v4';
import { express as voyagerMiddleware } from 'graphql-voyager/middleware';

import apolloServer from './graphql';

const api = connect();
const logger = loglevel.getLogger(`that-api-gatway:`);

loglevelDebug(logger);
if (process.env.NODE_ENV === 'development') {
  logger.enableAll();
}

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.THAT_ENVIRONMENT,
});

Sentry.configureScope(scope => {
  scope.setTag('thatApp', 'that-api-gateway');
});

function markSentry(req, res, next) {
  Sentry.addBreadcrumb({
    category: 'api',
    message: 'Gateway Init',
    level: Sentry.Severity.Info,
  });
  next();
}

/**
 * http middleware function
 * here we are intercepting the http call and building our own notion of a users context.
 * we then add it to the request so it can later be used by the gateway.
 * If you had something like a token that needs to be passed through to the gateways children this is how you intercept it and setup for later.
 *
 * @param {string} req - http request
 * @param {string} res - http response
 * @param {string} next - next function to execute
 *
 */
function createUserContext(req, res, next) {
  req.userContext = {
    locale: req.headers.locale,
    authToken: req.headers.authorization,
    correlationId: req.headers['that-correlation-id']
      ? req.headers['that-correlation-id']
      : uuid(),
    sentry: Sentry,
    logger,
    enableMocks: req.headers['that-enable-mocks']
      ? req.headers['that-enable-mocks']
      : [],
  };

  next();
}

/**
 * http middleware function that follows adhering to express's middleware.
 * Last item in the middleware chain.
 * This is your api handler for your serverless function
 *
 * @param {string} req - http request
 * @param {string} res - http response
 *
 */
function apiHandler(req, res) {
  logger.info('api handler called');

  const graphServer = apolloServer(req.userContext);
  const graphApi = graphServer.createHandler();

  graphApi(req, res);
}

function failure(err, req, res, next) {
  logger.trace('Middleware Catch All');
  logger.error('catchall', err);

  Sentry.captureException(err);

  res
    .set('Content-Type', 'application/json')
    .status(500)
    .json(err);
}

/**
 * http middleware function that follows adhering to express's middleware.
 * Last item in the middleware chain.
 * This is your api handler for your serverless function
 *
 */
export const graphEndpoint = api
  .use(responseTime())
  .use(cors())
  .use(markSentry)
  .use(createUserContext)
  .use('/voyager', voyagerMiddleware({ endpointUrl: '/graphql' }))
  .use(apiHandler)
  .use(failure);
