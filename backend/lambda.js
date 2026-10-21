// Netlify Function entry point: runs the Express app through serverless-http
const serverless = require('serverless-http');
const { connectLambda } = require('@netlify/blobs');
const app = require('./app');

// Images are sent back base64-encoded
const handle = serverless(app, { binary: ['image/*'] });

// netlify.toml rewrites /api/* and /uploads/* to this function; strip the
// function prefix so Express sees the original path
const PREFIX = '/.netlify/functions/api';

exports.handler = async (event, context) => {
  // Gives Netlify Blobs (image storage) this invocation's credentials
  if (event.blobs) connectLambda(event);
  if (event.path && event.path.startsWith(PREFIX)) {
    event.path = event.path.slice(PREFIX.length) || '/';
  }
  // Keep the MongoDB connection open between invocations
  context.callbackWaitsForEmptyEventLoop = false;
  return handle(event, context);
};
