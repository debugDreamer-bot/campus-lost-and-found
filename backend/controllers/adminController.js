const LostItem = require('../models/LostItem');
const FoundItem = require('../models/FoundItem');
const {
  MAX_SCORE,
  calculateMatchScore,
  linkMatch,
  announceMatch,
  unlinkMatch,
  findNewMatches,
  rankLostCandidates
} = require('../utils/matchHelper');
const { notifyUser } = require('../utils/notify');
const { averageHoursToReturn, topHelpers } = require('./statsController');

const escapeRegex = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Case-insensitive text search over the fields admins look things up by
function searchFilter(q) {
  if (!q || !String(q).trim()) return {};
  const pattern = new RegExp(escapeRegex(String(q).trim()), 'i');
  return {
    $or: [
      { itemName: pattern },
      { description: pattern },
      { location: pattern },
      { category: pattern },
      { keywords: pattern }
    ]
  };
}

exports.getStats = async (req, res) => {
  try {
    const [pendingLost, unmatchedFound, awaitingClaim, claimed, returned] = await Promise.all([
      LostItem.countDocuments({ status: 'pending' }),
      FoundItem.countDocuments({ status: 'unmatched' }),
      LostItem.countDocuments({ status: 'matched' }),
      LostItem.countDocuments({ status: 'claimed' }),
      LostItem.countDocuments({ status: 'returned' })
    ]);

    res.json({ pendingLost, unmatchedFound, awaitingClaim, claimed, returned });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Open matches, claimed ones first. ?q= searches both sides of the pair.
exports.getMatches = async (req, res) => {
  try {
    const matches = await FoundItem.find({ status: 'matched' })
      .populate({
        path: 'matchedWith',
        populate: { path: 'user', select: 'name email' }
      })
      .populate('user', 'name email')
      .sort({ 'claim.submittedAt': -1, createdAt: -1 });

    const q = String(req.query.q || '').trim().toLowerCase();
    const filtered = !q ? matches : matches.filter(found => {
      const lost = found.matchedWith || {};
      return [
        found.itemName, found.description, found.location, found.category,
        lost.itemName, lost.description, lost.location, lost.user?.name, lost.user?.email
      ].some(value => value && value.toLowerCase().includes(q));
    });

    res.json({ matches: filtered, maxScore: MAX_SCORE });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// GET /api/admin/items?type=lost|found&status=&category=&q=&page=&limit=
exports.getItems = async (req, res) => {
  try {
    const Model = req.query.type === 'found' ? FoundItem : LostItem;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);

    const filter = searchFilter(req.query.q);
    if (req.query.status) filter.status = String(req.query.status);
    if (req.query.category) filter.category = String(req.query.category);

    let query = Model.find(filter)
      .populate('user', 'name email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);
    if (Model === FoundItem) {
      query = query.populate({ path: 'matchedWith', populate: { path: 'user', select: 'name email' } });
    }

    const [items, total] = await Promise.all([query, Model.countDocuments(filter)]);
    res.json({ items, total, page, pages: Math.max(Math.ceil(total / limit), 1), maxScore: MAX_SCORE });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Best pending lost items for a found item, for manual matching
exports.getCandidates = async (req, res) => {
  try {
    const found = await FoundItem.findById(req.params.foundId);
    if (!found) return res.status(404).json({ message: 'Found item not found' });

    const candidates = await rankLostCandidates(found);
    res.json({ found, candidates, maxScore: MAX_SCORE });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.manualMatch = async (req, res) => {
  try {
    const { foundId, lostId } = req.body;
    const [found, lost] = await Promise.all([FoundItem.findById(foundId), LostItem.findById(lostId)]);
    if (!found || !lost) return res.status(404).json({ message: 'Item not found' });

    const linked = await linkMatch(found._id, lost._id, calculateMatchScore(lost, found));
    if (!linked) return res.status(409).json({ message: 'One of these items is already matched or returned' });

    await announceMatch(linked.lost, linked.found);
    res.json({ message: 'Items matched. The owner has been notified.', data: linked.found });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.rejectMatch = async (req, res) => {
  try {
    const unlinked = await unlinkMatch(req.params.foundId);
    if (!unlinked) return res.status(404).json({ message: 'No open match found for this item' });

    if (unlinked.lost) {
      await notifyUser(unlinked.lost.user, {
        title: `Match ruled out for your ${unlinked.lost.itemName}`,
        message: "An admin checked the suggested item and it isn't yours. We'll keep looking.",
        link: 'history.html'
      });
    }
    await findNewMatches(unlinked);

    res.json({ message: 'Match rejected. Both items are back in the pool.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Marks both items returned (kept for history) and tells both people
exports.approveReturn = async (req, res) => {
  try {
    const returnedAt = new Date();

    const found = await FoundItem.findOneAndUpdate(
      { _id: req.params.foundId, status: 'matched' },
      { status: 'returned', returnedAt },
      { new: true }
    );
    if (!found) {
      return res.status(404).json({ message: 'No open match found for this item' });
    }

    const lost = await LostItem.findByIdAndUpdate(
      found.matchedWith,
      { status: 'returned', returnedAt },
      { new: true }
    );

    if (lost) {
      await notifyUser(lost.user, {
        title: `Your ${lost.itemName} has been returned`,
        message: `An admin handed your ${lost.itemName} back to you. Glad you got it back!`,
        link: 'history.html',
        email: true
      });
    }
    await notifyUser(found.user, {
      title: 'Thank you for helping!',
      message: `The ${found.itemName || found.category.toLowerCase()} you found is back with its owner.`,
      link: 'history.html'
    });

    return res.json({ message: 'Item returned successfully. The owner has been notified.', data: { lost, found } });

  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Local calendar day, e.g. "2026-10-21"
const dayKey = date => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// GET /api/admin/analytics — charts for the admin overview
exports.getAnalytics = async (req, res) => {
  try {
    const DAYS = 14;
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (DAYS - 1));

    const [recentLost, recentFound, lostByCategory, foundByCategory, totalLost, returned, avgHours, helpers, locations] =
      await Promise.all([
        LostItem.find({ createdAt: { $gte: since } }).select('createdAt'),
        FoundItem.find({ createdAt: { $gte: since } }).select('createdAt'),
        LostItem.aggregate([{ $group: { _id: '$category', count: { $sum: 1 } } }]),
        FoundItem.aggregate([{ $group: { _id: '$category', count: { $sum: 1 } } }]),
        LostItem.countDocuments(),
        LostItem.countDocuments({ status: 'returned' }),
        averageHoursToReturn(),
        topHelpers(),
        LostItem.aggregate([
          { $match: { location: { $nin: [null, ''] } } },
          { $group: { _id: { $toLower: { $trim: { input: '$location' } } }, label: { $first: '$location' }, count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 5 }
        ])
      ]);

    const days = [];
    for (let i = 0; i < DAYS; i++) {
      const d = new Date(since);
      d.setDate(since.getDate() + i);
      days.push({ date: dayKey(d), lost: 0, found: 0 });
    }
    const byDay = Object.fromEntries(days.map(day => [day.date, day]));
    recentLost.forEach(item => { if (byDay[dayKey(item.createdAt)]) byDay[dayKey(item.createdAt)].lost++; });
    recentFound.forEach(item => { if (byDay[dayKey(item.createdAt)]) byDay[dayKey(item.createdAt)].found++; });

    const categories = {};
    lostByCategory.forEach(row => { categories[row._id] = { category: row._id, lost: row.count, found: 0 }; });
    foundByCategory.forEach(row => {
      categories[row._id] = categories[row._id] || { category: row._id, lost: 0, found: 0 };
      categories[row._id].found = row.count;
    });

    res.json({
      days,
      categories: Object.values(categories).sort((a, b) => (b.lost + b.found) - (a.lost + a.found)),
      returnRate: totalLost ? Math.round((returned / totalLost) * 100) : 0,
      avgHoursToReturn: avgHours,
      helpers,
      locations: locations.map(row => ({ location: row.label, count: row.count }))
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Quotes a CSV cell. Cells starting with = + - @ are prefixed with ' so a
// spreadsheet never runs them as formulas.
function csvCell(value) {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

// GET /api/admin/export?type=lost|found — every report as a CSV download
exports.exportCsv = async (req, res) => {
  try {
    const isFound = req.query.type === 'found';
    const Model = isFound ? FoundItem : LostItem;
    const items = await Model.find().populate('user', 'name email prn').sort({ createdAt: -1 });

    const date = item => (item ? new Date(item).toISOString().slice(0, 10) : '');
    const header = ['Item', 'Category', 'Location', isFound ? 'Date found' : 'Date lost', 'Status',
      'Reported by', 'Email', 'PRN', 'Keywords', 'Description', 'Reported on', 'Returned on'];
    const rows = items.map(item => [
      item.itemName, item.category, item.location, date(isFound ? item.dateFound : item.dateLost), item.status,
      item.user?.name, item.user?.email, item.user?.prn, (item.keywords || []).join(', '), item.description,
      date(item.createdAt), date(item.returnedAt)
    ]);

    const csv = [header, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${isFound ? 'found' : 'lost'}-reports-${date(new Date())}.csv"`);
    res.send('\ufeff' + csv);   // BOM so Excel reads UTF-8
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
