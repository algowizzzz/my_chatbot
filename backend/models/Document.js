const mongoose = require('mongoose');

// Schema for individual chunks
const chunkSchema = new mongoose.Schema({
  content: {
    type: String,
    required: true
  },
  index: Number,
  vectorId: String,
  metadata: {
    pageNumber: Number,
    section: String,
    previousChunkSummary: String,
    nextChunkSummary: String
  }
});

// Enhanced document schema
const documentSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  userId: {
    type: String,
    required: true
  },
  type: {
    type: String,
    required: true,
    enum: ['text/plain', 'application/pdf']
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  // Make these optional since we're handling content differently now
  title: {
    type: String,
    required: false
  },
  originalContent: {
    type: String,
    required: false
  },
  chunks: [chunkSchema],
  metadata: {
    author: String,
    createdDate: Date,
    lastModified: Date,
    fileType: {
      type: String,
      required: true,
      default: 'text/plain'
    },
    totalPages: Number,
    summary: String,
    documentStructure: {
      chapters: [{
        title: String,
        startChunk: Number,
        endChunk: Number
      }]
    }
  }
});

module.exports = mongoose.model('Document', documentSchema); 