const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

// Test the entire Graph RAG workflow
async function testGraphRagWorkflow() {
  try {
    console.log('1. Processing test.txt file to build the graph...');
    
    const processResponse = await axios.post('http://localhost:5005/api/graph/process-test', {});
    
    console.log('Process response status:', processResponse.status);
    console.log('Process response data:', JSON.stringify(processResponse.data, null, 2));
    
    // Check if graph.json was created
    const graphDataPath = path.join(__dirname, 'data', 'graph.json');
    let graphExists = false;
    
    try {
      await fs.access(graphDataPath);
      graphExists = true;
      console.log('2. Graph data file exists at:', graphDataPath);
    } catch (error) {
      console.log('2. Graph data file does not exist at:', graphDataPath);
    }
    
    // If graph exists, try to query it
    if (graphExists) {
      console.log('3. Testing Graph RAG query with existing graph data...');
      
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
    }
    
    // Try to use the knowledge graph visualization endpoint
    console.log('4. Testing knowledge graph visualization endpoint...');
    
    try {
      const visualizationResponse = await axios.get('http://localhost:5005/api/graph/knowledge-graph');
      console.log('Visualization response status:', visualizationResponse.status);
      console.log('Visualization response contains HTML:', visualizationResponse.data.includes('<!DOCTYPE html>'));
    } catch (error) {
      console.error('Error accessing knowledge graph visualization:', error.response ? error.response.data : error.message);
    }
    
    return 'Graph RAG workflow test completed';
  } catch (error) {
    console.error('Error in Graph RAG workflow test:', error.response ? error.response.data : error.message);
    throw error;
  }
}

// Run the test
testGraphRagWorkflow()
  .then(result => {
    console.log('Test completed successfully:', result);
  })
  .catch(error => {
    console.error('Test failed:', error);
  });
