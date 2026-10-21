const LostItem = require('../models/LostItem');
const FoundItem = require('../models/FoundItem');

// "Priya Nair" → "Priya N." so the leaderboard never shows full names
function shortName(name) {
  const [first, ...rest] = String(name || 'Someone').trim().split(/\s+/);
  const last = rest.pop();
  return last ? `${first} ${last[0].toUpperCase()}.` : first;
}

// Average hours from a lost report being filed to the item being returned
async function averageHoursToReturn() {
  const [result] = await LostItem.aggregate([
    { $match: { status: 'returned', returnedAt: { $ne: null } } },
    { $group: { _id: null, avgMs: { $avg: { $subtract: ['$returnedAt', '$createdAt'] } } } }
  ]);
  return result ? Math.round(result.avgMs / 36e5) : null;
}

// Top finders by items returned to their owners
async function topHelpers(limit = 5) {
  const rows = await FoundItem.aggregate([
    { $match: { status: 'returned' } },
    { $group: { _id: '$user', returned: { $sum: 1 } } },
    { $sort: { returned: -1 } },
    { $limit: limit },
    { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
    { $unwind: '$user' }
  ]);
  return rows.map(row => ({ name: shortName(row.user.name), returned: row.returned }));
}

// GET /api/stats/public — aggregate numbers for the landing page (no personal data)
exports.getPublicStats = async (req, res) => {
  try {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [totalLost, returned, activeLost, foundThisMonth, avgHoursToReturn] = await Promise.all([
      LostItem.countDocuments(),
      LostItem.countDocuments({ status: 'returned' }),
      LostItem.countDocuments({ status: { $in: ['pending', 'matched', 'claimed'] } }),
      FoundItem.countDocuments({ createdAt: { $gte: monthStart } }),
      averageHoursToReturn()
    ]);

    res.json({
      returned,
      activeLost,
      foundThisMonth,
      returnRate: totalLost ? Math.round((returned / totalLost) * 100) : 0,
      avgHoursToReturn
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// GET /api/stats/leaderboard — signed-in users only
exports.getLeaderboard = async (req, res) => {
  try {
    res.json({ helpers: await topHelpers() });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.averageHoursToReturn = averageHoursToReturn;
exports.topHelpers = topHelpers;
