// The Express app. server.js runs it locally; lambda.js runs it on Netlify.
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const connectDB = require('./config/db');
const { readImage } = require('./utils/storage');

// Load env variables from backend/.env, wherever the process was started
// (on Netlify they come from the site's environment settings instead)
dotenv.config({ path: path.join(__dirname, '.env'), quiet: true });

const app = express();

// Global middleware
app.use(cors({ exposedHeaders: ['Content-Disposition'] }));  // allow frontend to call backend (and read download names)
app.use(express.json());         // parse JSON bodies

// Serves uploaded images via /uploads/<filename>
app.get('/uploads/:name', async (req, res, next) => {
  try {
    const image = await readImage(req.params.name);
    if (!image) return res.status(404).end();
    if (image.contentType) res.type(image.contentType);
    else res.type(path.extname(req.params.name));
    res.set({ 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' });
    res.send(image.body);
  } catch (error) {
    next(error);
  }
});

// Serves the frontend too, so the whole app runs at http://localhost:5000.
// no-cache makes browsers re-check files, so edits always show up.
// (On Netlify the frontend is served as static files instead.)
app.use(express.static(path.join(__dirname, '..', 'frontend'), {
  setHeaders: res => res.setHeader('Cache-Control', 'no-cache')
}));

// Every API request needs the database
app.use('/api', async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    res.status(503).json({ message: 'The database is unavailable right now. Please try again in a moment.' });
  }
});

// Health check route (good for testing)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/lost', require('./routes/lostItemRoutes'));
app.use('/api/found', require('./routes/foundItemRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));
app.use('/api/stats', require('./routes/statsRoutes'));

// Errors thrown by middleware (e.g. a rejected upload) come back as JSON
app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ message: 'Image must be 4 MB or smaller' });
  }
  if (err.status) return res.status(err.status).json({ message: err.message });
  console.error(err);
  res.status(500).json({ message: 'Server error' });
});

module.exports = app;
