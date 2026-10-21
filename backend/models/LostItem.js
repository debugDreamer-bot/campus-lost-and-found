const mongoose = require('mongoose');

const lostItemSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  itemName: {
    type: String,
    required: true
  },
  category: {
    type: String,
    required: true
  },
  description: String,
  keywords: [String],
  dateLost: Date,
  location: String,
  image: String, // file path of uploaded image
  // pending  → no match yet
  // matched  → a found item was linked, waiting for the owner to claim it
  // claimed  → owner submitted proof, waiting for admin approval
  // returned → admin handed it back
  status: {
    type: String,
    enum: ['pending', 'matched', 'claimed', 'returned'],
    default: 'pending'
  },
  returnedAt: Date,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('LostItem', lostItemSchema);
