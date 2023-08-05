/* eslint-disable no-console */
import http from 'node:http';
import express from 'express';
import cors from 'cors';
import debug from 'debug';

import responseTime from 'response-time';
import * as Sentry from '@sentry/node';
import { v4 as uuidv4 } from 'uuid';
import { expressMiddleware } from '@apollo/server/express4';
import { json as jsonBodyParser } from 'body-parser';

import createGraphQLServer from './server';
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
  if (req.userContext.authToken?.toLowerCase()?.includes('basic')) {
    Sentry.configureScope(scope => {
      scope.setContext('user context', { userContext: req.userContext });
      scope.setLevel('info');
      scope.setContext('all headers', { headers: req.headers });
      Sentry.captureMessage('Basic auth sent to api', {
        auth: req.headers.authorization,
      });
    });
  }

  dlog('headers %o', req.headers);
  dlog('userContext %o', req.userContext);

  next();
}

function getVersion(isAllApis = false) {
  // if isAllApis then make requests to children for their versions
  return (req, res) => {
    dlog(
      'method %s, defaultVersion %s, isAllApis %s',
      req.method,
      config.sentry.release,
      isAllApis,
    );
    return res.json({ version: config?.sentry?.release });
  };
}

function failure(err, req, res, next) {
  dlog('middleware error %O', err);
  if (err instanceof Error) {
    Sentry.captureException(err);
  } else {
    Sentry.captureException(new Error(err.message));
  }

  res.status(500).json(err);
}

const httpServer = http.createServer(api);
const graphServer = createGraphQLServer(httpServer);
const port = process.env.PORT || 8000;
api.use(Sentry.Handlers.requestHandler());
api.use(cors(), responseTime(), jsonBodyParser());
api.use(createUserContext);
api.use('/version', getVersion());

graphServer
  .start()
  .then(() => {
    api.use(
      expressMiddleware(graphServer, {
        context: async ({ req: { userContext }, res }) => ({
          ...userContext,
          res,
        }),
      }),
    );
    api.use(Sentry.Handlers.errorHandler());
    api.use(failure);
    api.listen({ port }, () =>
      console.log(`✨Gateway 🌉 is running 🏃‍♂️ on port 🚢 ${port}`),
    );
  })
  .catch(err => {
    console.log(`graphServer.start() error 💥: ${err.message}`);
    throw err;
  });
