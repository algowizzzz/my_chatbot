const mongoose = require('mongoose');

// Schema for chunk metadata
const chunkMetadataSchema = new mongoose.Schema({
  documentName: String,
  documentId: String,
  pageNumber: String,
  section: String,
  relevanceScore: Number,
  createdAt: Date,
  entities: [String]
}, { _id: false });

// Schema for chunks
const chunkSchema = new mongoose.Schema({
  chunkId: {
    type: String,
    required: true
  },
  text: {
    type: String,
    required: true
  },
  metadata: chunkMetadataSchema,
  embedding: [Number]
}, { _id: false });

// Schema for entity nodes
const nodeSchema = new mongoose.Schema({
  entity: {
    type: String,
    required: true
  },
  type: String,
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  },
  connectedChunks: [String],
  relationships: [String]
}, { _id: false });

// Schema for relationships
const relationshipSchema = new mongoose.Schema({
  relationKey: {
    type: String,
    required: true
  },
  source: {
    type: String,
    required: true
  },
  target: {
    type: String,
    required: true
  },
  type: String,
  chunkId: String
}, { _id: false });

// Main GraphData schema
const graphDataSchema = new mongoose.Schema({
  documentId: {
    type: String,
    required: true,
    index: true
  },
  chunks: [chunkSchema],
  nodes: [nodeSchema],
  relationships: [relationshipSchema],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Create a compound index for faster document-specific queries
graphDataSchema.index({ documentId: 1 });

const GraphData = mongoose.model('GraphData', graphDataSchema);

module.exports = GraphData;
