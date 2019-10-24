const functions = require('firebase-functions');
const { graphEndpoint } = require('../src');

exports.graphGateway = functions.https.onRequest(graphEndpoint);
