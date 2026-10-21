const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const verifyToken = require('../middleware/authMiddleware');
const { addLostItem, getMyMatch, claimMatch, rejectMyMatch, deleteLostItem } = require('../controllers/lostItemController');
const LostItem = require('../models/LostItem');

router.get('/my', verifyToken, async (req, res) => {
  try {
    const items = await LostItem.find({ user: req.user.id }).sort({ createdAt: -1 });
    res.json(items);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});
// POST /api/lost — add lost item
router.post('/', verifyToken, upload.single('image'), addLostItem);

// Matching flow for the owner of a lost item
router.get('/:id/match', verifyToken, getMyMatch);
router.post('/:id/claim', verifyToken, claimMatch);
router.post('/:id/reject-match', verifyToken, rejectMyMatch);
router.delete('/:id', verifyToken, deleteLostItem);

module.exports = router;
