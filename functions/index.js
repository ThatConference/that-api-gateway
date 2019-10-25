const functions = require('firebase-functions');
const { graphEndpoint } = require('./gateway');

exports.graphGateway = functions.https.onRequest(graphEndpoint);
