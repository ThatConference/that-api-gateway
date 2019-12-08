import { ApolloServer } from 'apollo-server-cloud-functions';
import { ApolloGateway, RemoteGraphQLDataSource } from '@apollo/gateway';
import _ from 'lodash';

class AuthenticatedDataSource extends RemoteGraphQLDataSource {
  constructor(url) {
    super({ url });
  }

  // eslint-disable-next-line class-methods-use-this
  willSendRequest({ request, context }) {
    if (!_.isUndefined(context) && !_.isEmpty(context)) {
      context.logger.info('calling child service, setting headers');

      request.http.headers.set('Authorization', context.authToken);
      request.http.headers.set('locale', context.locale);
      request.http.headers.set('that-correlation-id', context.correlationId);
      request.http.headers.set('that-enable-mocks', context.enableMocks);
    }
  }
}

/**
 * will create you a configured instance of an apollo gateway
 * @param {object} userContext - user context that w
 * @return {object} a configured instance of an apollo gateway.
 *
 * @example
 *
 *     createGateway(userContext)
 */
const createGateway = logger =>
  new ApolloGateway({
    serviceList: [
      {
        name: 'Events',
        url: process.env.THAT_API_EVENTS,
      }, // port: 8001
      {
        name: 'Partners',
        url: process.env.THAT_API_PARTNERS,
      }, // port: 8002
      {
        name: 'Sessions',
        url: process.env.THAT_API_SESSIONS,
      }, // port: 8003
      {
        name: 'Members',
        url: process.env.THAT_API_MEMBERS,
      }, // port: 8004
    ],

    // for every child service we want to add information to the request header.
    buildService({ name, url }) {
      logger.info(`building schema for ${name} : ${url}`);
      return new AuthenticatedDataSource(url);
    },
    debug: JSON.parse(process.env.ENABLE_GRAPH_GATEWAY_DEBUG_MODE || false),
  });

const createServer = logger =>
  new ApolloServer({
    gateway: createGateway(logger),
    subscriptions: false,
    introspection: JSON.parse(process.env.ENABLE_GRAPH_INTROSPECTION || false),
    playground: JSON.parse(process.env.ENABLE_GRAPH_PLAYGROUND)
      ? { endpoint: '/' }
      : false,

    context: async ({ req: { userContext } }) => userContext,

    formatError: err => {
      logger.warn(err);
      return err;
    },
  });
export default createServer;
