const fs = require('fs').promises;
const path = require('path');
const { MongoClient } = require('mongodb');
require('dotenv').config();

// MongoDB connection info from environment variables
const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const dbName = process.env.MONGODB_DB_NAME || 'chatbot';

async function createAndSaveGraphData() {
  console.log('=== CREATING AND SAVING GRAPH DATA DIRECTLY ===');
  
  try {
    // 1. Create sample graph data
    console.log('Creating sample graph data...');
    const sampleGraphData = {
      nodes: [
        { id: 'Toronto', type: 'LOCATION', chunks: [0] },
        { id: 'Canada', type: 'LOCATION', chunks: [0] },
        { id: 'CN Tower', type: 'LANDMARK', chunks: [0] },
        { id: 'population', type: 'ATTRIBUTE', chunks: [0] }
      ],
      relationships: [
        { id: 'Toronto-LOCATED_IN-Canada', source: 'Toronto', type: 'LOCATED_IN', target: 'Canada', chunks: [0] },
        { id: 'CN Tower-LOCATED_IN-Toronto', source: 'CN Tower', type: 'LOCATED_IN', target: 'Toronto', chunks: [0] }
      ],
      chunks: [
        {
          id: 0,
          text: "Toronto is the largest city in Canada. It has a population of over 2.7 million people. The CN Tower is located in Toronto.",
          embedding: new Array(1536).fill(0).map(() => Math.random() * 2 - 1),
          entities: ['Toronto', 'Canada', 'CN Tower', 'population']
        }
      ]
    };
    
    // 2. Ensure data directory exists
    const dataDir = path.join(__dirname, 'data');
    console.log(`Ensuring data directory exists at: ${dataDir}`);
    try {
      await fs.access(dataDir);
      console.log('✓ Data directory exists');
    } catch (error) {
      console.log(`Creating data directory: ${error.message}`);
      await fs.mkdir(dataDir, { recursive: true });
      console.log('✓ Data directory created');
    }
    
    // 3. Save graph data to file
    const graphDataPath = path.join(dataDir, 'graph.json');
    console.log(`Saving graph data to file: ${graphDataPath}`);
    await fs.writeFile(graphDataPath, JSON.stringify(sampleGraphData, null, 2));
    
    // 4. Verify file was created
    const stats = await fs.stat(graphDataPath);
    console.log(`✓ Graph data file created: ${stats.size} bytes`);
    
    // 5. Save to MongoDB
    console.log('\nSaving graph data to MongoDB...');
    const client = new MongoClient(mongoUri);
    await client.connect();
    console.log('✓ Connected to MongoDB');
    
    const db = client.db(dbName);
    const collection = db.collection('graphData');
    
    // Clear existing data
    await collection.deleteMany({});
    console.log('✓ Cleared existing graph data');
    
    // Insert new data
    await collection.insertOne({
      _id: 'graph',
      data: sampleGraphData,
      createdAt: new Date()
    });
    console.log('✓ Inserted new graph data');
    
    await client.close();
    console.log('✓ MongoDB connection closed');
    
    // 6. Set global variable
    global.graphData = sampleGraphData;
    console.log('✓ Set global.graphData variable');
    
    console.log('\n=== GRAPH DATA CREATION COMPLETE ===');
    console.log('You can now test the /api/graph/test-query endpoint');
    
  } catch (error) {
    console.error('Error creating and saving graph data:', error);
  }
}

// Run the function
createAndSaveGraphData();
