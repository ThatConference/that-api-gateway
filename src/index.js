// ensures google tracing is first thing loaded.

require('@google-cloud/trace-agent').start({
  logLevel: 3,
  enhancedDatabaseReporting: true,
  flushDelaySeconds: 20,
});
require('./indexMain');
