// Creates an admin account, or promotes an existing user to admin.
// Usage: npm run create-admin -- <email> <password> [name]
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

dotenv.config({ quiet: true });

async function main() {
  const [email, password, name = 'Admin'] = process.argv.slice(2);
  if (!email || !password) {
    console.log('Usage: npm run create-admin -- <email> <password> [name]');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);

  const existing = await User.findOne({ email });
  if (existing) {
    existing.role = 'admin';
    await existing.save();
    console.log(`✅ ${email} is now an admin (password unchanged)`);
  } else {
    await User.create({
      name,
      email,
      prn: `ADMIN-${Date.now()}`,
      password: await bcrypt.hash(password, 10),
      role: 'admin'
    });
    console.log(`✅ Admin account created for ${email}`);
  }

  await mongoose.disconnect();
}

main().catch(error => {
  console.error('❌', error.message);
  process.exit(1);
});
