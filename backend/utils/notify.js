const Notification = require('../models/Notification');
const User = require('../models/User');
const { sendEmail, frontendUrl } = require('./mailer');

// Creates an in-app notification, and also emails it when `email` is true.
// Failures are logged, never thrown.
async function notifyUser(userId, { title, message, link, email = false }) {
  try {
    await Notification.create({ user: userId, title, message, link });

    if (email) {
      const user = await User.findById(userId).select('email');
      if (user) {
        await sendEmail({
          to: user.email,
          subject: title,
          text: link ? `${message}\n\nOpen: ${frontendUrl()}/${link}` : message
        });
      }
    }
  } catch (error) {
    console.error('❌ Notification failed:', error.message);
  }
}

async function notifyAdmins({ title, message, link }) {
  const admins = await User.find({ role: 'admin' }).select('_id');
  await Promise.all(admins.map(admin => notifyUser(admin._id, { title, message, link })));
}

module.exports = { notifyUser, notifyAdmins };
