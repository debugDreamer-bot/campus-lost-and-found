// Entry point for running the backend locally
// server.js
const app = require('./app');
const connectDB = require('./config/db');

// Connect to MongoDB up front; the app can't run without it
connectDB().catch(err => {
  console.error('❌ MongoDB connection error:', err.message);
  process.exit(1);
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
