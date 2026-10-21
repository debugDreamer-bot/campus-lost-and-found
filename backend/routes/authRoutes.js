const express = require('express');
const verifyToken = require('../middleware/authMiddleware');
const {
  registerUser,
  loginUser,
  forgotPassword,
  resetPassword,
  getMe,
  updateMe,
  changePassword
} = require('../controllers/authController');
const router = express.Router();

router.post('/register', registerUser);
router.post('/login', loginUser);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

router.get('/me', verifyToken, getMe);
router.put('/me', verifyToken, updateMe);
router.put('/password', verifyToken, changePassword);

module.exports = router;
