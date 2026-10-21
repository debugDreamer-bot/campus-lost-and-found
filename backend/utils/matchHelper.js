const LostItem = require('../models/LostItem');
const FoundItem = require('../models/FoundItem');
const { notifyUser } = require('./notify');

// Category alone (40) is never enough: a match also needs shared words,
// a nearby location, or a close date.
const MATCH_THRESHOLD = 60;
const MAX_SCORE = 125;

const STOP_WORDS = new Set([
  'the', 'and', 'with', 'for', 'has', 'have', 'had', 'its', 'was', 'are', 'this',
  'that', 'from', 'near', 'some', 'one', 'not', 'very', 'found', 'lost', 'item'
]);

// "Black, Leather ,wallet" or ['Black'] → ['black', 'leather', 'wallet']
function normalizeKeywords(input) {
  const list = Array.isArray(input) ? input : String(input || '').split(',');
  return [...new Set(list.map(word => String(word).trim().toLowerCase()).filter(Boolean))];
}

function significantWords(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(word => word.length >= 3 && !STOP_WORDS.has(word));
}

// Keywords plus meaningful words from the item name and description
function itemTerms(item) {
  return new Set([
    ...normalizeKeywords(item.keywords),
    ...significantWords(item.itemName),
    ...significantWords(item.description)
  ]);
}

function normalizeLocation(location) {
  return String(location || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function calculateMatchScore(lost, found) {
  let score = 0;

  // 1) Category match
  if (lost.category === found.category) score += 40;

  // 2) Shared keywords / words (10 points each, up to 40)
  const foundTerms = itemTerms(found);
  const common = [...itemTerms(lost)].filter(term => foundTerms.has(term)).length;
  score += Math.min(common, 4) * 10;

  // 3) Location: exact gives 30, one containing the other
  //    ("library" vs "library 2nd floor") gives 15
  const lostLocation = normalizeLocation(lost.location);
  const foundLocation = normalizeLocation(found.location);
  if (lostLocation && foundLocation) {
    if (lostLocation === foundLocation) score += 30;
    else if (lostLocation.includes(foundLocation) || foundLocation.includes(lostLocation)) score += 15;
  }

  // 4) Found within a week after it was lost (1 day of grace) → +15
  if (lost.dateLost && found.dateFound) {
    const diffDays = (new Date(found.dateFound) - new Date(lost.dateLost)) / (1000 * 3600 * 24);
    if (diffDays >= -1 && diffDays <= 7) score += 15;
  }

  return score;
}

// Links a found item to a lost item. Both updates are conditional, so two
// requests can never grab the same item. Returns null if either side was
// no longer available.
async function linkMatch(foundId, lostId, score) {
  const lost = await LostItem.findOneAndUpdate(
    { _id: lostId, status: 'pending' },
    { status: 'matched' },
    { new: true }
  );
  if (!lost) return null;

  const found = await FoundItem.findOneAndUpdate(
    { _id: foundId, status: 'unmatched' },
    { status: 'matched', matchedWith: lostId, matchScore: score, $unset: { claim: 1 } },
    { new: true }
  );
  if (!found) {
    await LostItem.updateOne({ _id: lostId }, { status: 'pending' });
    return null;
  }

  return { lost, found };
}

async function announceMatch(lost, found) {
  const what = found.itemName || found.category.toLowerCase();

  await notifyUser(lost.user, {
    title: `Possible match for your ${lost.itemName}`,
    message: `Someone reported finding a ${what} at ${found.location || 'campus'} that matches your report. Review it and claim it if it's yours.`,
    link: 'history.html',
    email: true
  });
  await notifyUser(found.user, {
    title: 'The item you found was matched',
    message: `The ${what} you reported matches a lost item. An admin will coordinate the return.`,
    link: 'history.html'
  });
}

// Links the best pair above the threshold, falling back to the next one if
// a concurrent request took it first.
async function linkBest(pairs) {
  const ranked = pairs
    .filter(pair => pair.score >= MATCH_THRESHOLD)
    .sort((a, b) => b.score - a.score);

  for (const { lost, found, score } of ranked) {
    const linked = await linkMatch(found._id, lost._id, score);
    if (linked) {
      await announceMatch(linked.lost, linked.found);
      return linked;
    }
  }
  return null;
}

// Someone's own reports never match each other
async function autoMatchFound(found) {
  const candidates = await LostItem.find({
    category: found.category,
    status: 'pending',
    user: { $ne: found.user },
    _id: { $nin: found.rejectedMatches || [] }
  });
  return linkBest(candidates.map(lost => ({ lost, found, score: calculateMatchScore(lost, found) })));
}

async function autoMatchLost(lost) {
  const candidates = await FoundItem.find({
    category: lost.category,
    status: 'unmatched',
    user: { $ne: lost.user },
    rejectedMatches: { $ne: lost._id }
  });
  return linkBest(candidates.map(found => ({ lost, found, score: calculateMatchScore(lost, found) })));
}

// Undoes a match (owner said "not mine" or an admin rejected it) and
// remembers the pair so it is never suggested again.
async function unlinkMatch(foundId) {
  const current = await FoundItem.findOne({ _id: foundId, status: 'matched' });
  if (!current) return null;

  const lostId = current.matchedWith;
  const found = await FoundItem.findOneAndUpdate(
    { _id: foundId, status: 'matched', matchedWith: lostId },
    {
      $set: { status: 'unmatched', matchedWith: null },
      $unset: { matchScore: 1, claim: 1 },
      $addToSet: { rejectedMatches: lostId }
    },
    { new: true }
  );
  if (!found) return null;

  const lost = await LostItem.findOneAndUpdate(
    { _id: lostId, status: { $in: ['matched', 'claimed'] } },
    { status: 'pending' },
    { new: true }
  );

  return { found, lost };
}

// After an unlink, both items go back into the pool
async function findNewMatches({ found, lost }) {
  await autoMatchFound(found);
  if (lost) await autoMatchLost(lost);
}

// Pending lost items ranked by how well they fit a found item (admin manual matching)
async function rankLostCandidates(found, limit = 10) {
  const lostItems = await LostItem.find({
    status: 'pending',
    user: { $ne: found.user },
    _id: { $nin: found.rejectedMatches || [] }
  }).populate('user', 'name email');

  return lostItems
    .map(lost => ({ lost, score: calculateMatchScore(lost, found) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

module.exports = {
  MATCH_THRESHOLD,
  MAX_SCORE,
  normalizeKeywords,
  calculateMatchScore,
  linkMatch,
  announceMatch,
  autoMatchFound,
  autoMatchLost,
  unlinkMatch,
  findNewMatches,
  rankLostCandidates
};
