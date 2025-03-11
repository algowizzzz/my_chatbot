const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

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

// Function to save graph data to a file
async function saveGraphToFile() {
  try {
    // First, ensure the data directory exists
    await ensureDataDirectoryExists();
    
    // Process the test.txt file to build the graph
    console.log('1. Processing test.txt file to build the graph...');
    const processResponse = await axios.post('http://localhost:5005/api/graph/process-test', {});
    console.log('Process response status:', processResponse.status);
    console.log('Process response data:', JSON.stringify(processResponse.data, null, 2));
    
    // Get the knowledge graph data
    console.log('2. Fetching knowledge graph data...');
    const graphResponse = await axios.get('http://localhost:5005/api/graph/knowledge-graph');
    
    // Extract graph data from the HTML response
    const htmlResponse = graphResponse.data;
    const graphDataMatch = htmlResponse.match(/const graphData = (\{[\s\S]*?\});/);
    
    if (!graphDataMatch || !graphDataMatch[1]) {
      throw new Error('Could not extract graph data from HTML response');
    }
    
    // Clean up the graph data
    let graphDataStr = graphDataMatch[1];
    // Replace any non-JSON compatible JavaScript with proper JSON
    graphDataStr = graphDataStr.replace(/Array\.from\((.*?)\)/g, '$1');
    
    // Try to parse the graph data
    let graphData;
    try {
      // Create a temporary function to evaluate the JavaScript expression
      const tempFunc = new Function(`return ${graphDataStr}`);
      graphData = tempFunc();
      
      // Convert the graph data to a format compatible with the test-query endpoint
      const formattedData = {
        chunks: []
      };
      
      // Extract nodes and links
      if (graphData.nodes && Array.isArray(graphData.nodes)) {
        console.log(`Found ${graphData.nodes.length} nodes in the graph data`);
      }
      
      if (graphData.links && Array.isArray(graphData.links)) {
        console.log(`Found ${graphData.links.length} links in the graph data`);
      }
      
      // Save the graph data to a file
      const graphDataPath = path.join(__dirname, 'data', 'graph.json');
      await fs.writeFile(graphDataPath, JSON.stringify(graphData, null, 2));
      console.log(`3. Graph data saved to ${graphDataPath}`);
      
      // Create a simple chunks array for testing
      const chunks = [];
      const text = await fs.readFile(path.join(__dirname, 'test.txt'), 'utf8');
      
      // Split the text into chunks of roughly 200 characters
      const chunkSize = 200;
      for (let i = 0; i < text.length; i += chunkSize) {
        const chunk = text.substring(i, i + chunkSize);
        chunks.push({
          text: chunk,
          embedding: new Array(1536).fill(0).map(() => Math.random() * 2 - 1), // Random embedding
          entities: []
        });
      }
      
      // Add the chunks to the graph data
      graphData.chunks = chunks;
      
      // Save the updated graph data to the file
      await fs.writeFile(graphDataPath, JSON.stringify(graphData, null, 2));
      console.log(`4. Updated graph data with ${chunks.length} chunks`);
      
      // Test the query endpoint
      console.log('5. Testing the query endpoint...');
      try {
        const queryResponse = await axios.post('http://localhost:5005/api/graph/test-query', {
          query: 'What is artificial intelligence?',
          config: {
            chunkSelection: {
              maxChunks: {
                value: 3
              },
              scoreWeights: {
                semantic: {
                  value: 0.7
                },
                entity: {
                  value: 0.3
                }
              }
            }
          }
        });
        
        console.log('Query response status:', queryResponse.status);
        console.log('Query response data:', JSON.stringify(queryResponse.data, null, 2));
      } catch (error) {
        console.error('Error querying graph:', error.response ? error.response.data : error.message);
      }
      
      return graphData;
    } catch (error) {
      console.error('Error parsing graph data:', error);
      throw error;
    }
  } catch (error) {
    console.error('Error saving graph to file:', error.response ? error.response.data : error.message);
    throw error;
  }
}

// Run the script
saveGraphToFile()
  .then(() => {
    console.log('Script completed successfully');
  })
  .catch(error => {
    console.error('Script failed:', error);
  });
