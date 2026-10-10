const mongoose = require('mongoose');
const { ROUTING_CONFIG } = require('../config/foodRules');

const NgoSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  address: {
    type: String,
    required: true,
    trim: true
  },
  location: {
    lat: {
      type: Number,
      required: true
    },
    lng: {
      type: Number,
      required: true
    }
  },
  nightlyCapacity: {
    type: Number,
    default: ROUTING_CONFIG.NGO_NIGHTLY_CAPACITY_MEALS || 100
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Ngo', NgoSchema);
