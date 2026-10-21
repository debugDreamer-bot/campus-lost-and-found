// backend/controllers/foundItemController.js
const FoundItem = require('../models/FoundItem');
const LostItem = require('../models/LostItem');
const User = require('../models/User');
const { normalizeKeywords, autoMatchFound, calculateMatchScore, linkMatch } = require('../utils/matchHelper');
const { notifyUser, notifyAdmins } = require('../utils/notify');
const { removeUpload } = require('../middleware/upload');

const escapeRegex = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

exports.addFoundItem = async (req, res) => {
  try {
    const { itemName, category, description, keywords, dateFound, location } = req.body;

    const newItem = new FoundItem({
      user: req.user.id,
      itemName,
      category,
      description,
      keywords: normalizeKeywords(keywords),
      dateFound,
      location,
      image: req.file ? req.file.filename : null
    });

    await newItem.save();

    // Link it to the best pending lost item (notifies the owner)
    const match = await autoMatchFound(newItem);

    res.status(201).json({
      message: 'Found item submitted',
      autoMatched: Boolean(match),
      matchScore: match ? match.found.matchScore : null,
      data: match ? match.found : newItem
    });

  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// GET /api/found/browse?q=&category=&page=
// Unclaimed found items anyone can look through. Description and keywords
// stay hidden so only the real owner can describe those details in a claim.
exports.browseFound = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 12, 1), 48);

    const filter = { status: 'unmatched', user: { $ne: req.user.id } };
    if (req.query.category) filter.category = String(req.query.category);
    const q = String(req.query.q || '').trim();
    if (q) {
      const pattern = new RegExp(escapeRegex(q), 'i');
      filter.$or = [{ itemName: pattern }, { location: pattern }, { category: pattern }];
    }

    const [items, total] = await Promise.all([
      FoundItem.find(filter)
        .select('itemName category location dateFound image createdAt')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      FoundItem.countDocuments(filter)
    ]);

    res.json({ items, total, page, pages: Math.max(Math.ceil(total / limit), 1) });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// POST /api/found/:id/claim { lostId, proof }
// "This is mine" from the browse page: links the found item to one of the
// user's open lost reports and submits the claim in one step.
exports.claimFoundItem = async (req, res) => {
  try {
    const proof = String(req.body.proof || '').trim();
    if (proof.length < 10) {
      return res.status(400).json({ message: 'Describe something only the owner would know (at least 10 characters)' });
    }

    const lost = await LostItem.findOne({ _id: req.body.lostId, user: req.user.id, status: 'pending' });
    if (!lost) return res.status(409).json({ message: 'Pick one of your lost reports that is still searching' });

    const found = await FoundItem.findOne({ _id: req.params.id, status: 'unmatched' });
    if (!found) return res.status(409).json({ message: 'This item has already been matched with someone' });
    if (String(found.user) === String(req.user.id)) {
      return res.status(400).json({ message: 'You reported finding this item' });
    }
    if (found.rejectedMatches.some(id => String(id) === String(lost._id))) {
      return res.status(409).json({ message: 'An admin already ruled this item out for that report' });
    }

    const linked = await linkMatch(found._id, lost._id, calculateMatchScore(lost, found));
    if (!linked) return res.status(409).json({ message: 'This item has already been matched with someone' });

    await LostItem.updateOne({ _id: lost._id, status: 'matched' }, { status: 'claimed' });
    await FoundItem.updateOne(
      { _id: found._id, status: 'matched' },
      { claim: { proof, submittedAt: new Date() } }
    );

    const claimant = await User.findById(req.user.id).select('name');
    const what = found.itemName || found.category.toLowerCase();
    await notifyAdmins({
      title: 'New ownership claim',
      message: `${claimant ? claimant.name : 'A student'} says the ${what} found at ${found.location || 'campus'} is theirs. Review their proof.`,
      link: 'admin.html'
    });
    await notifyUser(found.user, {
      title: 'Someone claimed the item you found',
      message: `The owner of the ${what} came forward. An admin will verify the claim and arrange the return.`,
      link: 'history.html'
    });

    res.json({ message: 'Claim submitted. An admin will verify it and arrange the return.', data: { lostId: lost._id } });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// DELETE /api/found/:id — withdraw a found report nobody has matched yet
exports.deleteFoundItem = async (req, res) => {
  try {
    const found = await FoundItem.findOneAndDelete({ _id: req.params.id, user: req.user.id, status: 'unmatched' });
    if (!found) {
      return res.status(409).json({ message: 'Only unmatched reports can be withdrawn' });
    }
    removeUpload(found.image);
    res.json({ message: 'Report withdrawn' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
