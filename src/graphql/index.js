import 'dotenv/config';
import connect from 'connect';
// import cors from 'cors';
import debug from 'debug';

import responseTime from 'response-time';
import * as Sentry from '@sentry/node';
import uuid from 'uuid/v4';
import { express as voyagerMiddleware } from 'graphql-voyager/middleware';

import graphServer from './server';
import config from '../envConfig';

const dlog = debug('that:api:gateway:index');
dlog('graph api started');

const api = connect();

Sentry.init({
  dsn: config.sentry.dsn,
  environment: config.sentry.environment,
  release: config.sentry.release,
  debug: config.sentry.debug,
});

Sentry.configureScope(scope => {
  scope.setTag('thatApp', 'that-api-gateway');
});

function createUserContext(req, res, next) {
  dlog('creating user context.');

  req.userContext = {
    authToken: req.headers.authorization,
    sentry: Sentry,

    correlationId: req.headers['that-correlation-id']
      ? req.headers['that-correlation-id']
      : uuid(),

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

const graphApi = graphServer.createHandler({
  cors: {
    origin: '*',
    credentials: true,
  },
});

function apiHandler(req, res) {
  dlog('gateway api handler called');
  return graphApi(req, res);
}

function failure(err, req, res, next) {
  dlog('middleware error %O', err);
  Sentry.captureException(err);

  res
    .set('Content-Type', 'application/json')
    .status(500)
    .json(err);
}

export default api
  .use(responseTime())
  .use(createUserContext)
  .use('/.internal/apollo/schema-refresh', schemaRefresh)
  .use('/view', voyagerMiddleware({ endpointUrl: '/graphql' }))
  .use(apiHandler)
  .use(failure);
