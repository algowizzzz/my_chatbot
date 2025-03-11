const axios = require('axios');

// Test the Graph RAG endpoint
async function testGraphRag() {
  try {
    console.log('Testing Graph RAG endpoint...');
    
    const response = await axios.post('http://localhost:5005/api/graph/test-query', {
      query: 'What is the purpose of LCH Clearnet?',
      config: {
        useEntities: true,
        useChunks: true,
        maxResults: 5,
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
    
    console.log('Response status:', response.status);
    console.log('Response data:', JSON.stringify(response.data, null, 2));
    
    return response.data;
  } catch (error) {
    console.error('Error testing Graph RAG:', error.response ? error.response.data : error.message);
    throw error;
  }
}

// Run the test
testGraphRag()
  .then(result => {
    console.log('Test completed successfully');
  })
  .catch(error => {
    console.error('Test failed:', error);
  });
