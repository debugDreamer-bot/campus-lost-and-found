const LostItem = require('../models/LostItem');
const FoundItem = require('../models/FoundItem');
const { MAX_SCORE, normalizeKeywords, autoMatchLost, unlinkMatch, findNewMatches } = require('../utils/matchHelper');
const { notifyAdmins } = require('../utils/notify');
const { removeUpload } = require('../middleware/upload');

exports.addLostItem = async (req, res) => {
  try {
    const { itemName, category, description, keywords, dateLost, location } = req.body;

    const newItem = new LostItem({
      user: req.user.id, // comes from JWT middleware
      itemName,
      category,
      description,
      keywords: normalizeKeywords(keywords),
      dateLost,
      location,
      image: req.file ? req.file.filename : null
    });

    await newItem.save();

    // A matching found item may already be waiting
    const match = await autoMatchLost(newItem);

    res.status(201).json({
      message: 'Lost item submitted successfully',
      autoMatched: Boolean(match),
      data: match ? match.lost : newItem
    });

  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// GET /api/lost/:id/match — the found item linked to one of my lost items
exports.getMyMatch = async (req, res) => {
  try {
    const lost = await LostItem.findOne({ _id: req.params.id, user: req.user.id });
    if (!lost) return res.status(404).json({ message: 'Lost item not found' });

    // The finder's identity stays private; the admin handles the handover
    const found = await FoundItem.findOne({ matchedWith: lost._id, status: { $in: ['matched', 'returned'] } })
      .select('itemName category description keywords location dateFound image matchScore claim status returnedAt');
    if (!found) return res.status(404).json({ message: 'No match for this item yet' });

    res.json({ lost, found, maxScore: MAX_SCORE });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// POST /api/lost/:id/claim — owner confirms the match with proof of ownership
exports.claimMatch = async (req, res) => {
  try {
    const proof = String(req.body.proof || '').trim();
    if (proof.length < 10) {
      return res.status(400).json({ message: 'Describe something only the owner would know (at least 10 characters)' });
    }

    const lost = await LostItem.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id, status: 'matched' },
      { status: 'claimed' },
      { new: true }
    );
    if (!lost) return res.status(409).json({ message: 'This item has no open match to claim' });

    await FoundItem.updateOne(
      { matchedWith: lost._id, status: 'matched' },
      { claim: { proof, submittedAt: new Date() } }
    );

    await notifyAdmins({
      title: 'New ownership claim',
      message: `A student claimed the match for "${lost.itemName}". Review their proof and approve the return.`,
      link: 'admin.html'
    });

    res.json({ message: 'Claim submitted. An admin will verify it and arrange the return.', data: lost });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// POST /api/lost/:id/reject-match — owner says the suggested item isn't theirs
exports.rejectMyMatch = async (req, res) => {
  try {
    const lost = await LostItem.findOne({ _id: req.params.id, user: req.user.id, status: { $in: ['matched', 'claimed'] } });
    if (!lost) return res.status(409).json({ message: 'This item has no open match' });

    const found = await FoundItem.findOne({ matchedWith: lost._id, status: 'matched' });
    const unlinked = found && await unlinkMatch(found._id);
    if (unlinked) await findNewMatches(unlinked);

    const updated = await LostItem.findById(lost._id);
    res.json({
      message: updated.status === 'pending'
        ? "Got it. We'll keep looking for your item."
        : 'Another possible match was found!',
      data: updated
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// DELETE /api/lost/:id — withdraw a report that is still searching
// (e.g. the owner found it themselves)
exports.deleteLostItem = async (req, res) => {
  try {
    const lost = await LostItem.findOneAndDelete({ _id: req.params.id, user: req.user.id, status: 'pending' });
    if (!lost) {
      return res.status(409).json({ message: 'Only reports that are still searching can be withdrawn' });
    }

    // Forget it in any "not a match" lists
    await FoundItem.updateMany({ rejectedMatches: lost._id }, { $pull: { rejectedMatches: lost._id } });
    removeUpload(lost.image);

    res.json({ message: 'Report withdrawn' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
