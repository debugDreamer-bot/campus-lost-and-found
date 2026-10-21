// controllers/authController.js
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { sendEmail, frontendUrl } = require('../utils/mailer');

// Only a hash of the reset token is stored, like a password
const hashToken = token => crypto.createHash('sha256').update(token).digest('hex');

// Admin accounts are created with `npm run create-admin`, never through signup
const SELF_SERVICE_ROLES = ['student', 'teacher'];

exports.registerUser = async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim();
    const prn = String(req.body.prn || '').trim();
    const password = String(req.body.password || '');
    const role = SELF_SERVICE_ROLES.includes(req.body.role) ? req.body.role : 'student';

    if (!name || !email || !prn) {
      return res.status(400).json({ message: 'Name, email and PRN are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ $or: [{ email }, { prn }] });
    if (existingUser) {
      return res.status(400).json({
        message: existingUser.email === email ? 'An account with this email already exists' : 'This PRN is already registered'
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user
    const newUser = new User({
      name,
      email,
      prn,
      password: hashedPassword,
      role
    });

    await newUser.save();

    res.status(201).json({ message: 'User registered successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.loginUser = async (req, res) => {
  try {
    const email = String(req.body.email || '').trim();
    const password = String(req.body.password || '');

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(401).json({ message: 'Invalid credentials' });

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const email = String(req.body.email || '').trim();
    if (!email) return res.status(400).json({ message: 'Email is required' });

    // Same answer whether or not the account exists
    const reply = { message: 'If an account exists for that email, a reset link has been sent.' };

    const user = await User.findOne({ email });
    if (!user) return res.json(reply);

    const token = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = hashToken(token);
    user.resetPasswordExpires = Date.now() + 30 * 60 * 1000; // 30 minutes
    await user.save();

    await sendEmail({
      to: user.email,
      subject: 'Reset your Lost & Found password',
      text: `Hi ${user.name},\n\nUse this link to set a new password (valid for 30 minutes):\n${frontendUrl()}/reset.html?token=${token}\n\nIf you didn't ask for this, you can ignore this email.`
    });

    res.json(reply);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password || String(password).length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const user = await User.findOne({
      resetPasswordToken: hashToken(String(token)),
      resetPasswordExpires: { $gt: Date.now() }
    });
    if (!user) return res.status(400).json({ message: 'This reset link is invalid or has expired' });

    user.password = await bcrypt.hash(String(password), 10);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({ message: 'Password updated. You can now log in.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// GET /api/auth/me
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('name email prn role createdAt');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// PUT /api/auth/me — only the display name is editable; email and PRN identify the student
exports.updateMe = async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    if (name.length < 2 || name.length > 60) {
      return res.status(400).json({ message: 'Name must be 2 to 60 characters' });
    }

    const user = await User.findByIdAndUpdate(req.user.id, { name }, { new: true })
      .select('name email prn role createdAt');
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json({ message: 'Profile updated', data: user });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// PUT /api/auth/password
exports.changePassword = async (req, res) => {
  try {
    const currentPassword = String(req.body.currentPassword || '');
    const newPassword = String(req.body.newPassword || '');
    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters' });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Current password is incorrect' });

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    res.json({ message: 'Password changed' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
