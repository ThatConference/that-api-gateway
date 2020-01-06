import 'dotenv/config';
import connect from 'connect';
import cors from 'cors';
import debug from 'debug';
import jwt from 'express-jwt';
import jwks from 'jwks-rsa';
import responseTime from 'response-time';
import { Storage } from '@google-cloud/storage';
import * as Sentry from '@sentry/node';
import mime from 'mime-types';
import uuid from 'uuid/v4';

import fileUpload from './middleware/fileUpload';
import envConfig from './envConfig';
import { version } from '../package.json';

const api = connect();
const dlog = debug('that:api:gateway:fileUpload');
dlog('fileUpload api started');
const defaultVersion = `that-api-gateway@${version}`;

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.THAT_ENVIRONMENT,
  release: process.env.SENTRY_VERSION || defaultVersion,
  debug: process.env.NODE_ENV === 'development',
});

Sentry.configureScope(scope => {
  scope.setTag('thatApp', 'that-api-gateway');
});

const jwtCheck = jwt({
  secret: jwks.expressJwtSecret({
    cache: JSON.parse(process.env.JWKS_CACHE || true),
    rateLimit: JSON.parse(process.env.JWKS_RATE_LIMIT || true),
    jwksRequestsPerMinute: process.env.JWKS_RPM || 5,
    jwksUri: envConfig.security.jwksUri,
  }),
  audience: envConfig.security.audience,
  issuer: envConfig.security.issuer,
  algorithms: ['RS256'],
});

function authz(role) {
  return (req, res, next) => {
    if (req.user.permissions.includes(role)) {
      dlog('passed permissions check');
      next();
    } else {
      dlog('failed permission validation');
      res.status(403).send('Permissions Denied');
    }
  };
}

async function uploadFile(req, res) {
  dlog('uploading file %o', req.files);

  const [profileImage] = req.files;

  const type = mime.lookup(profileImage.originalname);

  const storage = new Storage();
  // const bucket = storage.bucket(`${envConfig.google.bucket}/members`);
  const bucket = storage.bucket('that-images');
  const imageName = `${uuid()}.${mime.extensions[type][0]}`;
  const blob = bucket.file(`members/${imageName}`);

  const stream = blob.createWriteStream({
    contentType: type,
    cacheControl: 'no-cache',
    gzip: true,
  });

  stream.on('error', err => {
    dlog('error %o', err);
    res
      .set('Content-Type', 'application/json')
      .status(500)
      .json(err);
  });

  stream.on('finish', () => {
    dlog('finished writing');
    res.status(200).json({
      data: {
        url: `https://that.imgix.net/members/${imageName}?w=250&h=250&fit=facearea&facepad=2&mask=ellipse&fm=png`,
      },
    });
  });

  stream.end(profileImage.buffer);
}

function failure(err, req, res, next) {
  dlog('middleware catchall error %o', err);
  Sentry.captureException(err);

  res
    .set('Content-Type', 'application/json')
    .status(500)
    .json(err);
}

export default api
  .use(cors())
  .use(responseTime())
  .use(jwtCheck)
  .use('/profile', authz('members'))
  .use('/profile', fileUpload)
  .use('/profile', uploadFile)

  .use(failure);