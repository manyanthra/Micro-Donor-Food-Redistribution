const mongoose = require('mongoose');
const { FOOD_CATEGORIES } = require('../config/foodRules');

const StatusHistoryItemSchema = new mongoose.Schema({
  status: {
    type: String,
    required: true,
    enum: ['AVAILABLE', 'ASSIGNED', 'COLLECTED', 'DELIVERED', 'CANCELLED', 'REJECTED', 'SKIPPED']
  },
  at: {
    type: Date,
    default: Date.now
  },
  note: {
    type: String,
    default: ''
  }
}, { _id: false });

const DonationSchema = new mongoose.Schema({
  donorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Donor',
    required: true
  },
  mealsOffered: {
    type: Number,
    required: true,
    min: 1
  },
  category: {
    type: String,
    required: true,
    enum: Object.keys(FOOD_CATEGORIES)
  },
  readyAt: {
    type: Date,
    required: true
  },
  collectBy: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    required: true,
    enum: ['AVAILABLE', 'ASSIGNED', 'COLLECTED', 'DELIVERED', 'CANCELLED', 'REJECTED'],
    default: 'AVAILABLE'
  },
  statusHistory: {
    type: [StatusHistoryItemSchema],
    default: () => [{
      status: 'AVAILABLE',
      at: new Date(),
      note: 'Donation created'
    }]
  },
  exclusionReason: {
    type: String,
    default: null
  },
  plannedQty: {
    type: Number,
    default: 0
  },
  collectedQty: {
    type: Number,
    default: 0
  },
  deliveredQty: {
    type: Number,
    default: 0
  },
  tripId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Trip',
    default: null
  },
  notes: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

// Helper static to compute max allowed collectBy date
DonationSchema.statics.computeMaxCollectBy = function(category, readyAt) {
  const catConfig = FOOD_CATEGORIES[category];
  const safeMinutes = catConfig ? catConfig.safeWindowMinutes : 120;
  return new Date(new Date(readyAt).getTime() + safeMinutes * 60 * 1000);
};

// Ensure collectBy doesn't exceed safe window
DonationSchema.pre('validate', function() {
  if (this.category && this.readyAt) {
    const maxCollectBy = this.constructor.computeMaxCollectBy(this.category, this.readyAt);
    if (!this.collectBy) {
      this.collectBy = maxCollectBy;
    } else if (new Date(this.collectBy) > maxCollectBy) {
      // Optional override cannot exceed the safe window
      this.collectBy = maxCollectBy;
    }
  }
});

module.exports = mongoose.model('Donation', DonationSchema);
