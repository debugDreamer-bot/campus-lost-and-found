const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const verifyToken = require('../middleware/authMiddleware');
const { addFoundItem, browseFound, claimFoundItem, deleteFoundItem } = require('../controllers/foundItemController');
const FoundItem = require('../models/FoundItem');

router.get('/my', verifyToken, async (req, res) => {
  try {
    const items = await FoundItem.find({ user: req.user.id }).sort({ createdAt: -1 });
    res.json(items);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

router.get('/browse', verifyToken, browseFound);

router.post('/', verifyToken, upload.single('image'), addFoundItem);
router.post('/:id/claim', verifyToken, claimFoundItem);
router.delete('/:id', verifyToken, deleteFoundItem);

module.exports = router;
