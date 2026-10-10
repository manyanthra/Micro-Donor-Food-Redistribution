const mongoose = require('mongoose');

const DonorSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    required: true,
    enum: ['bakery', 'restaurant', 'hostel_mess']
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
  phone: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Donor', DonorSchema);
