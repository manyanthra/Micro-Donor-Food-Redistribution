const mongoose = require('mongoose');

const BlockedDispatchSchema = new mongoose.Schema({
  reason: {
    type: String,
    required: true
  },
  shortfall: {
    type: Number,
    default: 0
  },
  at: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('BlockedDispatch', BlockedDispatchSchema);
