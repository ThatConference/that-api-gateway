import _ from 'lodash';
import { ApolloServer } from 'apollo-server-express';
import { ApolloGateway, RemoteGraphQLDataSource } from '@apollo/gateway';
import debug from 'debug';
import { graph } from '@thatconference/api';

import config from './envConfig';

const dlog = debug('that:api:gateway:graphql');
const { lifecycle } = graph.events;

class AuthenticatedDataSource extends RemoteGraphQLDataSource {
  constructor(url) {
    dlog('constructor');
    super({ url });
  }

  // eslint-disable-next-line class-methods-use-this
  willSendRequest({ request, context }) {
    dlog('sending request %s', request.http.url);

    if (!_.isNil(context)) {
      dlog('user has context, calling child services, and setting headers');

      request.http.headers.set('that-enable-mocks', context.enableMocks);
      if (context.authToken)
        request.http.headers.set('Authorization', context.authToken);
      if (context.correlationId)
        request.http.headers.set('that-correlation-id', context.correlationId);
      if (context.referer)
        request.http.headers.set('X-Forwarded-For', context.referer);
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
  ],

  // for every child service we want to add information to the request header.
  buildService({ name, url }) {
    dlog(`building schema for ${name} : ${url}`);
    return new AuthenticatedDataSource(url);
  },
  debug: config.apollo.debug,
});

const createServer = new ApolloServer({
  gateway: createGateway,
  subscriptions: false,
  engine: false,
  introspection: config.apollo.introspection,
  playground: {
    settings: {
      'schema.polling.enable': false,
      'schema.disableComments': false,
    },
  },
  context: ({ req: { userContext } }) => userContext,

  plugins: [
    {
      requestDidStart(req) {
        return {
          executionDidStart(requestContext) {
            dlog('incoming query \r\n %s', requestContext.source);

            lifecycle.emit('executionDidStart', {
              service: 'that:api:gateway',
              requestContext,
            });
          },
        };
      },
    },
  ],
});

export default createServer;
