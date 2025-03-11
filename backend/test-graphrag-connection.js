// Test GraphRAG MongoDB connection
require('dotenv').config();
const express = require('express');
const router = express.Router();
const { MongoClient } = require('mongodb');

// Import the same MongoDB connection logic from graphRag.js
const url = process.env.MONGODB_URI;
// For MongoDB Atlas URIs, use a default database name since the extraction might not work
const isAtlasUri = url && (url.includes('mongodb+srv://') || url.includes('mongodb.net'));
const dbName = isAtlasUri ? 'chatbot' : (url.includes('/') ? url.split('/').pop().split('?')[0] || 'graphrag' : 'graphrag');

console.log('Testing GraphRAG MongoDB connection with:');
console.log('- MongoDB URI:', url ? 'Set (hidden for security)' : 'Not set');
console.log('- Is Atlas URI:', isAtlasUri ? 'Yes' : 'No');
console.log('- Database name:', dbName);

async function testGraphRagConnection() {
  console.log('\nAttempting to connect to MongoDB for GraphRAG...');
  const client = new MongoClient(url);
  
  try {
    await client.connect();
    console.log('✅ Successfully connected to MongoDB for GraphRAG!');
    
    // Test database access
    const db = client.db(dbName);
    console.log(`Connected to database: ${dbName}`);
    
    // Try to access or create the graphrag collection
    const graphCollection = db.collection('graphrag');
    console.log('Successfully accessed graphrag collection');
    
    // Count documents in the collection
    const count = await graphCollection.countDocuments();
    console.log(`The graphrag collection contains ${count} documents`);
    
    return true;
  } catch (error) {
    console.error('❌ Failed to connect to MongoDB for GraphRAG:', error.message);
    return false;
  } finally {
    await client.close();
    console.log('Connection closed.');
  }
}

testGraphRagConnection()
  .then(success => {
    if (!success) {
      process.exit(1);
    }
  })
  .catch(err => {
    console.error('Unhandled error during test:', err);
    process.exit(1);
  });
