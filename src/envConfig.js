import debug from 'debug';

// import { version } from '../package.json';
let version;
(async () => {
  let p;
  try {
    p = await import('./package.json');
  } catch {
    p = await import('../package.json');
  }
  version = p.version;
})();

const defaultVersion = `that-api-gateway@${version}`;
const dlog = debug('that:api:gateway:config');

function missingConfig(configKey) {
  throw new Error(`missing required .env setting for ${configKey}`);
}

const requiredConfig = () => {
  const config = {
    servicesList: {
      events: process.env.THAT_API_EVENTS || missingConfig('THAT_API_EVENTS'),
      partners:
        process.env.THAT_API_PARTNERS || missingConfig('THAT_API_PARTNERS'),
      sessions:
        process.env.THAT_API_SESSIONS || missingConfig('THAT_API_SESSIONS'),
      members:
        process.env.THAT_API_MEMBERS || missingConfig('THAT_API_MEMBERS'),
      garage: process.env.THAT_API_GARAGE || missingConfig('THAT_API_GARAGE'),
      communications:
        process.env.THAT_API_COMMUNICATIONS ||
        missingConfig('THAT_API_COMMUNICATIONS'),
    },

    apollo: {
      debug: JSON.parse(process.env.ENABLE_GRAPH_GATEWAY_DEBUG_MODE || false),
      introspection: JSON.parse(
        process.env.ENABLE_GRAPH_INTROSPECTION || false,
      ),
      playground: JSON.parse(process.env.ENABLE_GRAPH_PLAYGROUND)
        ? { endpoint: '/' }
        : false,
    },

    sentry: {
      dsn: process.env.SENTRY_DSN || missingConfig('SENTRY_DSN'),
      environment:
        process.env.THAT_ENVIRONMENT || missingConfig('THAT_ENVIRONMENT'),
      release: process.env.SENTRY_VERSION || defaultVersion,
      debug: process.env.NODE_ENV === 'development',
    },
  };

  dlog('created config %O', config);

  return config;
};

export default requiredConfig();
