const mongoose = require('mongoose');

const StopSchema = new mongoose.Schema({
  donationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Donation',
    required: true
  },
  donorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Donor',
    required: true
  },
  order: {
    type: Number,
    required: true
  },
  plannedQty: {
    type: Number,
    required: true
  },
  collectedQty: {
    type: Number,
    default: 0
  },
  eta: {
    type: Date
  },
  distanceFromPrevKm: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['PENDING', 'COLLECTED', 'SKIPPED'],
    default: 'PENDING'
  },
  skipReason: {
    type: String,
    default: ''
  }
}, { _id: true });

const MetricsSchema = new mongoose.Schema({
  distanceKm: { type: Number, default: 0 },
  cost: { type: Number, default: 0 },
  meals: { type: Number, default: 0 },
  costPerMeal: { type: Number, default: 0 },
  durationMin: { type: Number, default: 0 }
}, { _id: false });

const ExcludedItemSchema = new mongoose.Schema({
  donationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Donation'
  },
  reason: {
    type: String,
    required: true
  }
}, { _id: false });

const TripSchema = new mongoose.Schema({
  ngoId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Ngo',
    required: true
  },
  status: {
    type: String,
    enum: ['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
    default: 'PLANNED'
  },
  stops: [StopSchema],
  plannedMetrics: {
    type: MetricsSchema,
    default: () => ({})
  },
  baselineMetrics: {
    type: MetricsSchema,
    default: () => ({})
  },
  actualMetrics: {
    type: MetricsSchema,
    default: () => ({})
  },
  excluded: [ExcludedItemSchema],
  deliveredQty: {
    type: Number,
    default: 0
  },
  startedAt: {
    type: Date,
    default: null
  },
  completedAt: {
    type: Date,
    default: null
  },
  ngoConfirmed: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Trip', TripSchema);
