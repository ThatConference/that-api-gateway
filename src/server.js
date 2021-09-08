import { isNil } from 'lodash';
import { ApolloServer } from 'apollo-server-express';
import { ApolloGateway, RemoteGraphQLDataSource } from '@apollo/gateway';
import debug from 'debug';

import config from './envConfig';

const dlog = debug('that:api:gateway:graphql');

class AuthenticatedDataSource extends RemoteGraphQLDataSource {
  constructor(url) {
    dlog('constructor');
    super({ url });
  }

  // eslint-disable-next-line class-methods-use-this
  willSendRequest({ request, context }) {
    dlog('sending request %s', request.http.url);

    if (!isNil(context)) {
      dlog('user has context, calling child services, and setting headers');

      request.http.headers.set('that-enable-mocks', context.enableMocks);
      if (context.authToken)
        request.http.headers.set('Authorization', context.authToken);
      if (context.correlationId)
        request.http.headers.set('that-correlation-id', context.correlationId);
      if (context.referer) {
        request.http.headers.set('X-Forwarded-For', context.referer);
        request.http.headers.set('that-forwarded-for', context.referer);
      }
      if (context.site) request.http.headers.set('that-site', context.site);
    }
  }
}

const createGateway = new ApolloGateway({
  serviceList: [
    {
      name: 'Events',
      url: config.servicesList.events,
    }, // port: 8001
    {
      name: 'Partners',
      url: config.servicesList.partners,
    }, // port: 8002
    {
      name: 'Sessions',
      url: config.servicesList.sessions,
    }, // port: 8003
    {
      name: 'Members',
      url: config.servicesList.members,
    }, // port: 8004
    {
      name: 'Garage',
      url: config.servicesList.garage,
    }, // port: 8005
    {
      name: 'Communications',
      url: config.servicesList.communications,
    }, // port: 8006
  ],

  // for every child service we want to add information to the request header.
  buildService({ name, url }) {
    dlog(`building schema for ${name} : ${url}`);
    return new AuthenticatedDataSource(url);
  },
  debug: config.apollo.debug,
  serviceHealthCheck: true,
});

const createServer = new ApolloServer({
  gateway: createGateway,
  subscriptions: false,
  engine: false,
  introspection: config.apollo.introspection,
  playground: config.apollo.playground
    ? {
        settings: {
          'schema.polling.enable': false,
          'schema.disableComments': false,
        },
      }
    : false,
  context: ({ req: { userContext } }) => userContext,

  plugins: [],
});

export default createServer;
