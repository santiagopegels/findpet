const mongoose = require('mongoose');

const searchSchema = new mongoose.Schema({
  city: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Ciudad',
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
  imageVersions: {
    type: {
      thumbnail: String,
      medium: String,
      large: String
    },
    required: false,
    default: null
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