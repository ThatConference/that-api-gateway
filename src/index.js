import 'dotenv/config';
import express from 'express';
import debug from 'debug';

import responseTime from 'response-time';
import * as Sentry from '@sentry/node';
import { v4 as uuidv4 } from 'uuid';
import { express as voyagerMiddleware } from 'graphql-voyager/middleware';

import graphServer from './server';
import config from './envConfig';

const dlog = debug('that:api:gateway:index');
dlog('graph api started');

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

  const correlationId =
    req.headers['that-correlation-id'] &&
    req.headers['that-correlation-id'] !== 'undefined'
      ? req.headers['that-correlation-id']
      : uuidv4();

  Sentry.configureScope(scope => {
    scope.setTag('correlationId', correlationId);
    scope.setContext('headers', { headers: req.headers });
  });

  req.userContext = {
    authToken: req.headers.authorization,
    correlationId,
    enableMocks: false,
  };
  if (req.headers['that-site']) req.userContext.site = req.headers['that-site'];
  if (req.headers.referer) req.userContext.referer = req.headers.referer;

  dlog('headers %o', req.headers);
  dlog('userContext %o', req.userContext);

  next();
}

async function schemaRefresh(req, res) {
  dlog('Refreshing Gateway Schemas');

  dlog('graphServer.config.gateway.load()');
  const { schema, executor } = await graphServer.config.gateway.load({});

  dlog('graphServer.generateSchemaDerivedData(schema)');
  const schemaDerivedData = await graphServer.generateSchemaDerivedData(schema);

  graphServer.schema = schema;
  graphServer.schemaDerivedData = schemaDerivedData;
  graphServer.config.schema = schema;
  graphServer.config.executor = executor;
  graphServer.requestOptions.executor = executor;

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
  .use(responseTime())
  .use(createUserContext)
  .use('/.internal/apollo/schema-refresh', schemaRefresh)
  .use('/view', voyagerMiddleware({ endpointUrl: '/graphql' }))
  .use(failure);

const port = process.env.PORT || 8000;
graphServer.start().then(() => {
  graphServer.applyMiddleware({ app: api, path: '/' });
  api.listen({ port }, () =>
    // eslint-disable-next-line no-console
    console.log(`✨Gateway 🌉 is running 🏃‍♂️ on port 🚢 ${port}`),
  );
});

graphServer.applyMiddleware({ app: api, path: '/' });
// const port = process.env.PORT || 8000;
// api.listen({ port }, () => dlog(`gateway running on %d`, port));

// export const handler = api;
