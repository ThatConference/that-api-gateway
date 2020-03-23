import 'dotenv/config';
import express from 'express';
import debug from 'debug';
import { middleware } from '@thatconference/api';

import responseTime from 'response-time';
import * as Sentry from '@sentry/node';
import uuid from 'uuid/v4';
import { express as voyagerMiddleware } from 'graphql-voyager/middleware';

import graphServer from './server';
import config from './envConfig';

const dlog = debug('that:api:gateway:index');
dlog('graph api started');
const { requestLogger } = middleware;

const api = express();

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

  const correlationId = req.headers['that-correlation-id']
    ? req.headers['that-correlation-id']
    : uuid();

  Sentry.configureScope(scope => {
    scope.setTag('correlationId', correlationId);
  });

  req.userContext = {
    authToken: req.headers.authorization,
    correlationId,
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

function failure(err, req, res, next) {
  dlog('middleware error %O', err);
  Sentry.captureException(err);

  res
    .set('Content-Type', 'application/json')
    .status(500)
    .json(err);
}

api
  .set('etag', false)
  .use(responseTime())
  .use(requestLogger('that:api:gateway').handler)
  .use(createUserContext)
  .use('/.internal/apollo/schema-refresh', schemaRefresh)
  .use('/view', voyagerMiddleware({ endpointUrl: '/graphql' }))
  .use(failure);

graphServer.applyMiddleware({ app: api, path: '/' });
// const port = process.env.PORT || 8000;
// api.listen({ port }, () => dlog(`gateway running on %d`, port));

export const handler = api;
