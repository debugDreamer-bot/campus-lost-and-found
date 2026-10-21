const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/authMiddleware');
const {
  getStats,
  getMatches,
  getItems,
  getCandidates,
  manualMatch,
  rejectMatch,
  approveReturn,
  getAnalytics,
  exportCsv
} = require('../controllers/adminController');

// Only admin can access
function isAdmin(req, res, next) {
  if (req.user.role !== 'admin')
    return res.status(403).json({ message: 'Access denied' });
  next();
}

router.use(verifyToken, isAdmin);

router.get('/stats', getStats);
router.get('/analytics', getAnalytics);
router.get('/export', exportCsv);
router.get('/matches', getMatches);
router.get('/items', getItems);
router.get('/found/:foundId/candidates', getCandidates);
router.post('/match', manualMatch);
router.put('/reject/:foundId', rejectMatch);
router.put('/approve/:foundId', approveReturn);

module.exports = router;
