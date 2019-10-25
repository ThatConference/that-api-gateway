import { ApolloServer } from 'apollo-server-cloud-functions';
import { ApolloGateway, RemoteGraphQLDataSource } from '@apollo/gateway';

class AuthenticatedDataSource extends RemoteGraphQLDataSource {
  constructor(url, userContext) {
    super({ url });
    this.userContext = userContext;
  }

  // eslint-disable-next-line class-methods-use-this
  willSendRequest({ request, context }) {
    request.http.headers.set('Authorization', this.userContext.authToken);
    request.http.headers.set('locale', this.userContext.locale);
    request.http.headers.set('correlation-id', this.userContext.correlationId);
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
const createGateway = userContext =>
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
      userContext.sentry.addBreadcrumb({
        category: 'api',
        message: `building schema for ${name} : ${url}`,
        level: userContext.sentry.Severity.Info,
      });

      return new AuthenticatedDataSource(url, userContext);
    },
    debug: JSON.parse(process.env.ENABLE_GRAPH_GATEWAY_DEBUG_MODE || false),
  });

const createServer = userContext =>
  new ApolloServer({
    gateway: createGateway(userContext),
    subscriptions: false,
    playground: JSON.parse(process.env.ENABLE_GRAPH_PLAYGROUND)
      ? { endpoint: '/' }
      : false,

    formatError: err => {
      console.log('in format error');
      userContext.sentry.captureException(err);
      return err;
    },
  });

export default createServer;
