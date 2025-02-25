const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    default: 'default-user'
  },
  title: {
    type: String,
    required: true
  },
  content: {
    type: String,
    required: true
  },
  vectorId: {
    type: String,
    required: true,
    default: 'default-vector-id'
  },
  fileType: {
    type: String,
    required: true,
    default: 'text/plain'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Document', documentSchema); 