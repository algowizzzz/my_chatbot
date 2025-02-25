const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,  // No duplicate emails allowed
    lowercase: true // Convert email to lowercase
  },
  password: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('User', userSchema); 