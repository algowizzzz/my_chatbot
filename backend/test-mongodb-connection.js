// Test MongoDB connection to MongoDB Atlas
require('dotenv').config();
const { MongoClient } = require('mongodb');

// Use the specific MongoDB Atlas URI
const url = "mongodb+srv://sahme29:Gzt2AZw6NJqj95Dn@cluster0.k1x8c.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
console.log('Using specific MongoDB Atlas URI for testing');

// Check if the URI is for MongoDB Atlas
const isAtlasUri = url && (url.includes('mongodb+srv://') || url.includes('mongodb.net'));
console.log('Is this a MongoDB Atlas URI?', isAtlasUri ? 'Yes' : 'No');

if (!url) {
  console.error('MONGODB_URI environment variable is not set!');
  process.exit(1);
}

// Extract database name from connection string or use default
const dbName = url.includes('/') ? url.split('/').pop().split('?')[0] : 'chatbot';
console.log(`Will connect to database: ${dbName}`);

async function testConnection() {
  console.log('Attempting to connect to MongoDB...');
  const client = new MongoClient(url);
  
  try {
    await client.connect();
    console.log('✅ Successfully connected to MongoDB Atlas!');
    
    // Test database access
    const db = client.db(dbName);
    const collections = await db.listCollections().toArray();
    console.log(`Found ${collections.length} collections in database ${dbName}:`);
    collections.forEach(collection => {
      console.log(`- ${collection.name}`);
    });
    
    return true;
  } catch (error) {
    console.error('❌ Failed to connect to MongoDB:', error.message);
    return false;
  } finally {
    await client.close();
    console.log('Connection closed.');
  }
}

testConnection()
  .then(success => {
    if (!success) {
      process.exit(1);
    }
  })
  .catch(err => {
    console.error('Unhandled error during test:', err);
    process.exit(1);
  });
