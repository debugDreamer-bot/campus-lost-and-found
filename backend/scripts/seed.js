// Fills the database with demo users and reports so every page has something
// to show. Demo accounts use @demo.local emails and are safe to remove.
//
//   npm run seed           add demo data (replaces any previous demo data)
//   npm run seed -- --clear  remove demo data only
//
// Demo logins (password for all: demo1234)
//   aarav@demo.local  student with lost items     admin@demo.local  admin
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const LostItem = require('../models/LostItem');
const FoundItem = require('../models/FoundItem');
const Notification = require('../models/Notification');
const { calculateMatchScore } = require('../utils/matchHelper');

dotenv.config({ quiet: true });

const DEMO_EMAIL = /@demo\.local$/;

const daysAgo = (days, hour = 11) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, (days * 17) % 60, 0, 0);
  return d;
};

async function clearDemoData() {
  const users = await User.find({ email: DEMO_EMAIL }).select('_id');
  const ids = users.map(u => u._id);
  const [lost, found, notes, removed] = await Promise.all([
    LostItem.deleteMany({ user: { $in: ids } }),
    FoundItem.deleteMany({ user: { $in: ids } }),
    Notification.deleteMany({ user: { $in: ids } }),
    User.deleteMany({ _id: { $in: ids } })
  ]);
  return { users: removed.deletedCount, lost: lost.deletedCount, found: found.deletedCount, notifications: notes.deletedCount };
}

async function seed() {
  const password = await bcrypt.hash('demo1234', 10);
  const people = [
    ['Aarav Sharma', 'aarav', 'student'],
    ['Priya Nair', 'priya', 'student'],
    ['Rohan Mehta', 'rohan', 'student'],
    ['Sneha Kulkarni', 'sneha', 'student'],
    ['Dr. Kavita Rao', 'kavita', 'teacher'],
    ['Ishaan Verma', 'ishaan', 'student'],
    ['Demo Admin', 'admin', 'admin']
  ];
  const users = {};
  for (const [i, [name, handle, role]] of people.entries()) {
    users[handle] = await User.create({
      name, role, password,
      email: `${handle}@demo.local`,
      prn: `DEMO${String(1001 + i)}`,
      createdAt: daysAgo(30)
    });
  }

  const lost = async (owner, fields, created) => LostItem.create({
    user: users[owner]._id, status: 'pending', createdAt: daysAgo(created), dateLost: daysAgo(created + 1), ...fields
  });
  const found = async (finder, fields, created) => FoundItem.create({
    user: users[finder]._id, status: 'unmatched', createdAt: daysAgo(created, 15), dateFound: daysAgo(created, 14), ...fields
  });

  // Links a pair. stage: 'matched' | 'claimed' | 'returned'
  async function pair(lostItem, foundItem, stage, returnedDaysAgo) {
    const score = calculateMatchScore(lostItem, foundItem);
    const returnedAt = stage === 'returned' ? daysAgo(returnedDaysAgo, 16) : undefined;
    await LostItem.updateOne({ _id: lostItem._id }, { status: stage, returnedAt });
    await FoundItem.updateOne({ _id: foundItem._id }, {
      status: stage === 'returned' ? 'returned' : 'matched',
      matchedWith: lostItem._id,
      matchScore: score,
      returnedAt,
      ...(stage !== 'matched' && {
        claim: { proof: 'My name is written inside, and there is a sticker on the back.', submittedAt: daysAgo(returnedDaysAgo ?? 1, 10) }
      })
    });
  }

  // --- Returned (feeds the leaderboard and return-time stats) ---
  await pair(
    await lost('sneha', { itemName: 'Black leather wallet', category: 'Wallet', location: 'Central Library', keywords: ['black', 'leather', 'wallet'], description: 'Black leather wallet with college ID and metro card' }, 12),
    await found('priya', { itemName: 'Black wallet', category: 'Wallet', location: 'Central Library', keywords: ['black', 'leather'] }, 12),
    'returned', 11);
  await pair(
    await lost('ishaan', { itemName: 'AirPods Pro case', category: 'Electronics', location: 'Seminar Hall 2', keywords: ['airpods', 'white'] }, 10),
    await found('priya', { itemName: 'White AirPods case', category: 'Electronics', location: 'Seminar Hall', keywords: ['airpods', 'white', 'case'] }, 9),
    'returned', 8);
  await pair(
    await lost('kavita', { itemName: 'Car keys with red keychain', category: 'Keys', location: 'Staff parking', keywords: ['keys', 'red', 'honda'] }, 8),
    await found('rohan', { itemName: 'Honda car key', category: 'Keys', location: 'Staff parking', keywords: ['keys', 'honda'] }, 8),
    'returned', 7);
  await pair(
    await lost('rohan', { itemName: 'Engineering Mathematics III', category: 'Books', location: 'Room 204', keywords: ['maths', 'textbook'] }, 6),
    await found('priya', { itemName: 'Maths textbook', category: 'Books', location: 'Room 204', keywords: ['maths', 'textbook'] }, 5),
    'returned', 4);
  await pair(
    await lost('priya', { itemName: 'Steel water bottle', category: 'Water bottle', location: 'Gym', keywords: ['steel', 'milton'] }, 5),
    await found('sneha', { itemName: 'Milton steel bottle', category: 'Water bottle', location: 'Gym', keywords: ['steel', 'milton'] }, 4),
    'returned', 3);

  // --- Aarav: one match to review, one claim in review, one still searching ---
  const aaravPhone = await lost('aarav', {
    itemName: 'iPhone 13 in a blue case', category: 'Phone', location: 'Canteen',
    keywords: ['iphone', 'blue', 'case'], description: 'Blue silicone case, cracked screen protector, lock screen shows a dog'
  }, 2);
  const phoneFound = await found('rohan', {
    itemName: 'Blue iPhone', category: 'Phone', location: 'Canteen', keywords: ['iphone', 'blue'],
    description: 'Found on a canteen table near the window'
  }, 1);
  await pair(aaravPhone, phoneFound, 'matched');

  const aaravBag = await lost('aarav', {
    itemName: 'Grey Wildcraft backpack', category: 'Bag', location: 'Main auditorium',
    keywords: ['grey', 'wildcraft', 'backpack'], description: 'Laptop sleeve inside, keychain shaped like a guitar'
  }, 4);
  const bagFound = await found('sneha', { itemName: 'Grey backpack', category: 'Bag', location: 'Main auditorium', keywords: ['grey', 'backpack'] }, 3);
  await pair(aaravBag, bagFound, 'claimed', 1);

  await lost('aarav', { itemName: 'Casio fx-991ES calculator', category: 'Others', location: 'Exam hall B', keywords: ['casio', 'calculator'] }, 1);

  // --- Still searching / waiting for an owner ---
  await lost('sneha', { itemName: 'Student ID card', category: 'ID Card', location: 'Bus stop', keywords: ['id', 'card'] }, 3);
  await lost('ishaan', { itemName: 'Dell Inspiron charger', category: 'Electronics', location: 'Computer lab 3', keywords: ['charger', 'dell'] }, 2);
  await lost('kavita', { itemName: 'Navy blue umbrella', category: 'Others', location: 'Admin block', keywords: ['umbrella', 'navy'] }, 0);

  await found('priya', { itemName: 'Black hoodie', category: 'Clothing', location: 'Basketball court', keywords: ['hoodie', 'black'] }, 6);
  await found('ishaan', { itemName: 'SanDisk 32GB pen drive', category: 'USB Drive', location: 'Computer lab 1', keywords: ['sandisk', 'usb'] }, 4);
  await found('rohan', { itemName: 'Silver wristwatch', category: 'Others', location: 'Sports ground', keywords: ['watch', 'silver'] }, 3);
  await found('kavita', { itemName: 'Lab coat', category: 'Clothing', location: 'Chemistry lab', keywords: ['lab', 'coat'] }, 2);
  await found('sneha', { itemName: 'Brown leather wallet', category: 'Wallet', location: 'Parking lot', keywords: ['brown', 'wallet'] }, 1);
  await found('priya', { itemName: 'HP laptop charger', category: 'Electronics', location: 'Library reading room', keywords: ['hp', 'charger'] }, 0);
  await found('rohan', { itemName: 'Set of hostel keys', category: 'Keys', location: 'Hostel gate', keywords: ['keys', 'hostel'] }, 0);

  // --- Notifications for Aarav ---
  await Notification.create([
    { user: users.aarav._id, title: 'Possible match for your iPhone 13 in a blue case', message: 'Someone reported finding a blue iPhone at Canteen that matches your report. Review it and claim it if it\'s yours.', link: 'history.html', createdAt: daysAgo(1, 15) },
    { user: users.aarav._id, title: 'Claim received', message: 'Your claim for the grey backpack is with an admin for verification.', link: 'history.html', read: true, createdAt: daysAgo(1, 10) },
    { user: users.aarav._id, title: 'Welcome to Lost & Found', message: 'Report lost items, browse what others found, and get notified the moment something matches.', link: 'dashboard.html', read: true, createdAt: daysAgo(30) }
  ]);
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const removed = await clearDemoData();
  if (process.argv.includes('--clear')) {
    console.log('🧹 Removed demo data:', removed);
  } else {
    await seed();
    console.log('🌱 Demo data added. Log in as aarav@demo.local or admin@demo.local (password: demo1234)');
  }
  await mongoose.disconnect();
}

main().catch(error => {
  console.error('❌', error.message);
  process.exit(1);
});
