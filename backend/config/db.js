// MongoDB connection file
// config/db.js
const mongoose = require('mongoose');

let connecting = null;

// Connects once and reuses the connection. Serverless functions call this on
// every request, so it must be cheap after the first call.
function connectDB(uri = process.env.MONGODB_URI) {
  if (!connecting) {
    connecting = mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 })
      .then(() => {
        console.log('✅ MongoDB connected');
        return mongoose.connection;
      })
      .catch(err => {
        connecting = null; // let the next request try again
        throw err;
      });
  }
  return connecting;
}

module.exports = connectDB;
