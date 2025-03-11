const mongoose = require('mongoose');

const graphDocumentSchema = new mongoose.Schema({
  documentId: {
    type: String,
    required: true,
    unique: true
  },
  documentName: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['processing', 'completed', 'error'],
    default: 'processing'
  },
  pageCount: {
    type: Number,
    default: 0
  },
  sections: [String],
  type: {
    type: String,
    default: 'pdf'
  },
  uploadDate: {
    type: Date,
    default: Date.now
  },
  error: String,
  processingStats: {
    entityCount: Number,
    relationshipCount: Number,
    chunkCount: Number,
    processingTime: Number
  }
});

const GraphDocument = mongoose.model('GraphDocument', graphDocumentSchema);

module.exports = GraphDocument;
