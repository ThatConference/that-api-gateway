/* eslint-disable no-console */
/* eslint-disable import/prefer-default-export */
import 'dotenv/config';
import connect from 'connect';
import cors from 'cors';
import debug from 'debug';
import pino from 'pino';
import responseTime from 'response-time';
import * as Sentry from '@sentry/node';
import uuid from 'uuid/v4';
import { express as voyagerMiddleware } from 'graphql-voyager/middleware';

import apolloServer from './server';
import { version } from '../../package.json';

const dlog = debug('that:api:gateway:index');
dlog('graph api started');

const defaultVersion = `that-api-gateway@${version}`;
const api = connect();

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  prettyPrint: JSON.parse(process.env.LOG_PRETTY_PRINT || false),
  mixin() {
    return {
      service: 'that-api-gateway',
    };
  },
});

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.THAT_ENVIRONMENT,
  release: process.env.SENTRY_VERSION || defaultVersion,
  debug: process.env.NODE_ENV === 'development',
});

Sentry.configureScope(scope => {
  scope.setTag('thatApp', 'that-api-gateway');
});

// create the apollo server
const graphServer = apolloServer(logger);

function attachLogger(loggerInstance) {
  dlog('attaching Logger');
  return (req, res, next) => {
    dlog('attached Logger');
    req.log = loggerInstance;
    next();
  };
}

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
  dlog('creating user context.');

  const correlationId = req.headers['that-correlation-id']
    ? req.headers['that-correlation-id']
    : uuid();

  const contextLogger = req.log.child({ correlationId });

  req.userContext = {
    locale: req.headers.locale,
    authToken: req.headers.authorization,
    correlationId,
    sentry: Sentry,
    logger: contextLogger,
    enableMocks: req.headers['that-enable-mocks']
      ? req.headers['that-enable-mocks']
      : false,
  };

  next();
}

async function schemaRefresh(req, res) {
  dlog('Refreshing Gateway Schemas');
  await graphServer.config.gateway.load();
  res.json({ status: 'reloaded' });
}

const graphApi = graphServer.createHandler();

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
  dlog('gateway api handler called');

  // if (process.env.NODE_ENV === 'development') {
  //   req.log.debug('debug mode -> refreshing gateway schemas');
  //   await graphServer.config.gateway.load();
  // }

  return graphApi(req, res);
}

function failure(err, req, res, next) {
  req.log.error(err);
  req.log.trace('Middleware Catch All');

  Sentry.captureException(err);

  res
    .set('Content-Type', 'application/json')
    .status(500)
    .json(err);
}

export const handler = api
  .use(cors())
  .use(responseTime())
  .use(attachLogger(logger))
  .use(markSentry)
  .use(createUserContext)
  .use('/.internal/apollo/schema-refresh', schemaRefresh)
  .use('/view', voyagerMiddleware({ endpointUrl: '/graphql' }))
  .use(apiHandler)
  .use(failure);
