const axios = require('axios');

// Process the test.txt file to build the graph
async function processTestFile() {
  try {
    console.log('Processing test.txt file to build the graph...');
    
    const response = await axios.post('http://localhost:5005/api/graph/process-test', {});
    
    console.log('Response status:', response.status);
    console.log('Response data:', JSON.stringify(response.data, null, 2));
    
    return response.data;
  } catch (error) {
    console.error('Error processing test file:', error.response ? error.response.data : error.message);
    throw error;
  }
}

// Run the process
processTestFile()
  .then(result => {
    console.log('Processing completed successfully');
  })
  .catch(error => {
    console.error('Processing failed:', error);
  });
