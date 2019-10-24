const functions = require('firebase-functions');
const { graphEndpoint } = require('../src');

exports.graphEndpoint = functions.https.onRequest(graphEndpoint);
