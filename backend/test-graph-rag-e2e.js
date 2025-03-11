const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

// Configuration
const API_BASE_URL = 'http://localhost:5005'; // Using port 5005 which is the actual running port
const TEST_QUERY = 'What is artificial intelligence?';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m'
};

/**
 * Comprehensive end-to-end test for Graph RAG functionality
 */
async function testGraphRAG() {
  console.log(`${colors.bright}${colors.cyan}=== GRAPH RAG END-TO-END TEST ===${colors.reset}\n`);
  
  try {
    // Step 1: Check if the backend server is running
    console.log(`${colors.bright}Step 1: Checking if backend server is running...${colors.reset}`);
    try {
      await axios.get(`${API_BASE_URL}/api/health`);
      console.log(`${colors.green}✓ Backend server is running${colors.reset}`);
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        console.error(`${colors.red}✗ Backend server is not running. Please start the server on port 5004.${colors.reset}`);
        return;
      } else {
        // Health endpoint might not exist, but server could be running
        console.log(`${colors.yellow}? Backend server might be running, but health endpoint not found. Continuing...${colors.reset}`);
      }
    }

    // Step 2: Process the test.txt file to build the graph
    console.log(`\n${colors.bright}Step 2: Processing test.txt file to build the graph...${colors.reset}`);
    let processResponse;
    try {
      processResponse = await axios.post(`${API_BASE_URL}/api/graph/process-test`);
      console.log(`${colors.green}✓ Process response status: ${processResponse.status}${colors.reset}`);
      console.log(`${colors.green}✓ Process response data: ${JSON.stringify(processResponse.data, null, 2)}${colors.reset}`);
    } catch (error) {
      console.error(`${colors.red}✗ Error processing test.txt: ${error.message}${colors.reset}`);
      if (error.response) {
        console.error(`${colors.red}Response data: ${JSON.stringify(error.response.data, null, 2)}${colors.reset}`);
      }
      return;
    }

    // Step 3: Check if the graph data file exists
    console.log(`\n${colors.bright}Step 3: Checking if graph data file exists...${colors.reset}`);
    const graphDataPath = path.join(__dirname, 'data', 'graph.json');
    try {
      await fs.access(graphDataPath);
      const stats = await fs.stat(graphDataPath);
      console.log(`${colors.green}✓ Graph data file exists at: ${graphDataPath}${colors.reset}`);
      console.log(`${colors.green}✓ File size: ${(stats.size / 1024).toFixed(2)} KB${colors.reset}`);
    } catch (error) {
      console.error(`${colors.red}✗ Graph data file does not exist at: ${graphDataPath}${colors.reset}`);
      console.error(`${colors.red}Error: ${error.message}${colors.reset}`);
    }

    // Step 4: Test the query endpoint
    console.log(`\n${colors.bright}Step 4: Testing the query endpoint...${colors.reset}`);
    try {
      const queryResponse = await axios.post(`${API_BASE_URL}/api/graph/test-query`, {
        query: TEST_QUERY,
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
      
      console.log(`${colors.green}✓ Query response status: ${queryResponse.status}${colors.reset}`);
      console.log(`${colors.green}✓ Answer: ${queryResponse.data.answer}${colors.reset}`);
      console.log(`${colors.green}✓ Relevant chunks: ${queryResponse.data.relevantChunks.length}${colors.reset}`);
      
      // Display the first relevant chunk
      if (queryResponse.data.relevantChunks.length > 0) {
        const firstChunk = queryResponse.data.relevantChunks[0];
        console.log(`\n${colors.cyan}Top chunk (score: ${firstChunk.score.toFixed(4)}):\n${firstChunk.text}${colors.reset}`);
      }
    } catch (error) {
      console.error(`${colors.red}✗ Error querying graph: ${error.message}${colors.reset}`);
      if (error.response) {
        console.error(`${colors.red}Response data: ${JSON.stringify(error.response.data, null, 2)}${colors.reset}`);
      }
      return;
    }

    // Step 5: Test the knowledge graph visualization endpoint
    console.log(`\n${colors.bright}Step 5: Testing knowledge graph visualization endpoint...${colors.reset}`);
    try {
      const visualizationResponse = await axios.get(`${API_BASE_URL}/api/graph/knowledge-graph`);
      const containsHTML = visualizationResponse.data.includes('<!DOCTYPE html>') || 
                           visualizationResponse.data.includes('<html>');
      
      console.log(`${colors.green}✓ Visualization response status: ${visualizationResponse.status}${colors.reset}`);
      console.log(`${colors.green}✓ Visualization response contains HTML: ${containsHTML}${colors.reset}`);
    } catch (error) {
      console.error(`${colors.red}✗ Error getting visualization: ${error.message}${colors.reset}`);
      if (error.response) {
        console.error(`${colors.red}Response data: ${JSON.stringify(error.response.data, null, 2)}${colors.reset}`);
      }
    }

    console.log(`\n${colors.bright}${colors.green}Test completed successfully: Graph RAG workflow test completed${colors.reset}`);
    
  } catch (error) {
    console.error(`${colors.red}Unexpected error during test: ${error.message}${colors.reset}`);
    if (error.stack) {
      console.error(`${colors.red}Stack trace: ${error.stack}${colors.reset}`);
    }
  }
}

// Run the test
testGraphRAG();
