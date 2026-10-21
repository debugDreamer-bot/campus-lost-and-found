const nodemailer = require('nodemailer');

let transporter = null;

// Base URL of the frontend, used for links inside emails
function frontendUrl() {
  // URL is set by Netlify to the site's address
  return process.env.FRONTEND_URL || process.env.URL || 'http://localhost:5000';
}

// Sends an email, or only logs it when EMAIL_USER / EMAIL_PASS are not set
// (handy in development). Never throws: a mail problem must not break the
// request that triggered it.
async function sendEmail({ to, subject, text }) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.log(`📧 [email disabled] To: ${to} | ${subject}\n${text}\n`);
    return false;
  }

  // .local addresses (demo accounts) can never receive mail; don't send bounces
  if (/\.local$/i.test(String(to).trim())) {
    console.log(`📧 [skipped .local address] To: ${to} | ${subject}`);
    return false;
  }

  try {
    if (!transporter) {
      transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS
        }
      });
    }

    await transporter.sendMail({ from: process.env.EMAIL_USER, to, subject, text });
    return true;
  } catch (error) {
    console.error('❌ Email failed:', error.message);
    return false;
  }
}

module.exports = { sendEmail, frontendUrl };
