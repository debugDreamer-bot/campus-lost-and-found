// Netlify Function that serves /api/* and /uploads/* (see netlify.toml)
exports.handler = require('../../backend/lambda').handler;
