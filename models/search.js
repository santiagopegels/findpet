const mongoose = require('mongoose');

const searchSchema = new mongoose.Schema({
  city: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  gpsLocation: {
    type: {
      latitude: {
        type: Number,
        required: true
      },
      longitude: {
        type: Number,
        required: true
      }
    },
    required: true
  },
  filename: {
    type: String,
    required: false
  },
  phone: {
    type: String,
    required: true
  },
  type: {
    type: String,
    required: true,
    enum: ['FIND', 'LOST']
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const Search = mongoose.model('Search', searchSchema);

module.exports = Search;