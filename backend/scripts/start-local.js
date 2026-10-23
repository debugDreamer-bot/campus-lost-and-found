// Runs the whole app with a built-in MongoDB, so nothing else has to be
// installed or configured. Used by START.bat (Windows) and `npm run local`.
//
// The first run downloads MongoDB (about 100 MB) and adds the demo data.
// Data is kept in backend/.local-db between runs; delete that folder to start fresh.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { exec } = require('child_process');
const { MongoMemoryServer } = require('mongodb-memory-server');

const DB_DIR = path.join(__dirname, '..', '.local-db');
const DATA_DIR = path.join(DB_DIR, 'data');
const SECRET_FILE = path.join(DB_DIR, 'jwt-secret');
const PORT = process.env.PORT || 5000;
const URL = `http://localhost:${PORT}`;

// Same secret every run, so logins survive a restart
function jwtSecret() {
  try {
    return fs.readFileSync(SECRET_FILE, 'utf8').trim();
  } catch {
    const secret = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(SECRET_FILE, secret);
    return secret;
  }
}

function openBrowser() {
  const command = process.platform === 'win32' ? `start "" ${URL}`
    : process.platform === 'darwin' ? `open ${URL}`
    : `xdg-open ${URL}`;
  exec(command, () => {}); // not opening is fine; the address is printed
}

async function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  console.log('⏳ Starting the database (the first time, this downloads MongoDB and can take a few minutes)...');
  const mongo = await MongoMemoryServer.create({
    instance: { dbPath: DATA_DIR, storageEngine: 'wiredTiger', dbName: 'lostfound' }
  });

  // Set before app.js loads backend/.env, so these win over it
  process.env.MONGODB_URI = mongo.getUri('lostfound');
  process.env.JWT_SECRET = jwtSecret();
  process.env.FRONTEND_URL = URL;

  const app = require('../app');
  const connectDB = require('../config/db');
  const User = require('../models/User');
  const { seed } = require('./seed');

  await connectDB();
  if (await User.countDocuments() === 0) {
    await seed();
    console.log('🌱 Demo data added');
  }

  // Only this computer can open the site (and Windows Firewall doesn't ask)
  const server = app.listen(PORT, '127.0.0.1', () => {
    console.log(`\n🚀 Lost & Found is running at ${URL}`);
    console.log('   Demo logins: aarav@demo.local or admin@demo.local, password demo1234');
    console.log('   Keep this window open while using the site. Close it to stop.\n');
    openBrowser();
  });

  server.on('error', async error => {
    console.error(error.code === 'EADDRINUSE'
      ? `❌ Port ${PORT} is already in use. Lost & Found may already be running: open ${URL}`
      : `❌ ${error.message}`);
    await mongo.stop();
    process.exit(1);
  });

  // Ctrl+C: shut MongoDB down cleanly so its data is saved
  process.on('SIGINT', async () => {
    console.log('\nStopping...');
    server.close();
    await mongo.stop({ doCleanup: false });
    process.exit(0);
  });
}

main().catch(error => {
  console.error('❌ Could not start:', error.message);
  process.exit(1);
});
