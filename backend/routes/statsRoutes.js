const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/authMiddleware');
const { getPublicStats, getLeaderboard } = require('../controllers/statsController');

router.get('/public', getPublicStats);
router.get('/leaderboard', verifyToken, getLeaderboard);

module.exports = router;
