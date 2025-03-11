const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();  // Load environment variables

// Function to ensure the data directory exists
async function ensureDataDirectoryExists() {
  const dataDir = path.join(__dirname, 'data');
  try {
    await fs.access(dataDir);
    console.log('Data directory exists');
  } catch (error) {
    console.log('Creating data directory...');
    await fs.mkdir(dataDir, { recursive: true });
  }
}

// Function to create a random embedding of the specified dimension
function createRandomEmbedding(dimension = 1536) {
  return Array.from({ length: dimension }, () => Math.random() * 2 - 1);
}

// Function to create graph data and save it to a file
async function createGraphData() {
  try {
    // First, ensure the data directory exists
    await ensureDataDirectoryExists();
    
    // Read the test.txt file
    console.log('1. Reading test.txt file...');
    const text = await fs.readFile(path.join(__dirname, 'test.txt'), 'utf8');
    
    // Split the text into chunks
    console.log('2. Splitting text into chunks...');
    const chunkSize = 200;
    const chunks = [];
    
    for (let i = 0; i < text.length; i += chunkSize) {
      const chunkText = text.substring(i, i + chunkSize);
      chunks.push(chunkText);
    }
    
    console.log(`Created ${chunks.length} chunks`);
    
    // Create embeddings for each chunk
    console.log('3. Creating random embeddings for chunks...');
    const embeddedChunks = [];
    
    for (let i = 0; i < chunks.length; i++) {
      console.log(`Processing chunk ${i + 1}/${chunks.length}`);
      const embedding = createRandomEmbedding();
      
      embeddedChunks.push({
        text: chunks[i],
        embedding: embedding,
        entities: ['artificial intelligence', 'machine learning', 'deep learning']
      });
    }
    
    // Create a simple graph data structure
    const graphData = {
      chunks: embeddedChunks,
      nodes: [
        { id: 'artificial intelligence', type: 'concept' },
        { id: 'machine learning', type: 'concept' },
        { id: 'deep learning', type: 'concept' },
        { id: 'healthcare', type: 'domain' },
        { id: 'finance', type: 'domain' },
        { id: 'transportation', type: 'domain' }
      ],
      links: [
        { source: 'machine learning', target: 'artificial intelligence', relationship: 'subset_of' },
        { source: 'deep learning', target: 'machine learning', relationship: 'subset_of' },
        { source: 'artificial intelligence', target: 'healthcare', relationship: 'applied_in' },
        { source: 'artificial intelligence', target: 'finance', relationship: 'applied_in' },
        { source: 'artificial intelligence', target: 'transportation', relationship: 'applied_in' }
      ]
    };
    
    // Save the graph data to a file
    const graphDataPath = path.join(__dirname, 'data', 'graph.json');
    await fs.writeFile(graphDataPath, JSON.stringify(graphData, null, 2));
    console.log(`4. Graph data saved to ${graphDataPath}`);
    
    return graphData;
  } catch (error) {
    console.error('Error creating graph data:', error);
    throw error;
  }
}

// Run the script
createGraphData()
  .then(() => {
    console.log('Script completed successfully');
  })
  .catch(error => {
    console.error('Script failed:', error);
  });
