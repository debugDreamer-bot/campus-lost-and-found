const mongoose = require('mongoose');

const foundItemSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  itemName: String,
  category: {
    type: String,
    required: true
  },
  description: String,
  keywords: [String],
  dateFound: Date,
  location: String,
  image: String,              // uploaded file name
  status: {
    type: String,
    enum: ['unmatched', 'matched', 'returned'],
    default: 'unmatched'
  },
  matchedWith: {              // reference to LostItem if matched
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LostItem',
    default: null
  },
  matchScore: Number,         // how well it matches
  claim: {                    // owner's proof of ownership for the current match
    proof: String,
    submittedAt: Date
  },
  rejectedMatches: [{         // lost items already ruled out, never re-suggested
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LostItem'
  }],
  returnedAt: Date,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('FoundItem', foundItemSchema);
