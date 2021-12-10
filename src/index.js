// ensures google tracing is first thing loaded.

require('@google-cloud/trace-agent').start({
  logLevel: 2,
  enhancedDatabaseReporting: true,
  flushDelaySeconds: 15,
  serviceContext: {
    service: 'that-api-gateway',
  },
});
require('./indexMain');
