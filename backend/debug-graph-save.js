const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');

async function debugGraphSave() {
  console.log('=== DEBUGGING GRAPH SAVE PROCESS ===');
  
  // 1. Check if data directory exists
  const dataDir = path.join(__dirname, 'data');
  console.log(`Checking if data directory exists: ${dataDir}`);
  
  try {
    await fs.access(dataDir);
    console.log(`✓ Data directory exists`);
  } catch (error) {
    console.log(`✗ Data directory does not exist: ${error.message}`);
    console.log('Creating data directory...');
    await fs.mkdir(dataDir, { recursive: true });
    console.log(`✓ Data directory created`);
  }
  
  // 2. Create a test file in the data directory
  const testFilePath = path.join(dataDir, 'test-file.json');
  console.log(`Creating test file: ${testFilePath}`);
  
  try {
    const testData = {
      test: true,
      timestamp: new Date().toISOString()
    };
    
    await fs.writeFile(testFilePath, JSON.stringify(testData, null, 2));
    console.log(`✓ Test file created successfully`);
    
    // Verify file was created
    const stats = await fs.stat(testFilePath);
    console.log(`✓ Test file size: ${stats.size} bytes`);
  } catch (error) {
    console.log(`✗ Failed to create test file: ${error.message}`);
  }
  
  // 3. Process test document
  console.log('\nTesting process-test endpoint...');
  try {
    const response = await axios.post('http://localhost:5005/api/graph/process-test');
    console.log(`✓ Process response status: ${response.status}`);
    console.log(`✓ Process response data:`, response.data);
  } catch (error) {
    console.log(`✗ Error processing test.txt:`, error.message);
    if (error.response) {
      console.log(`Response data:`, error.response.data);
    }
  }
  
  // 4. Check if graph.json was created
  console.log('\nChecking if graph.json was created...');
  const graphFilePath = path.join(dataDir, 'graph.json');
  
  try {
    await fs.access(graphFilePath);
    const stats = await fs.stat(graphFilePath);
    console.log(`✓ Graph file exists: ${graphFilePath}`);
    console.log(`✓ Graph file size: ${stats.size} bytes`);
    
    // Read first 500 characters to verify content
    const content = await fs.readFile(graphFilePath, 'utf8');
    console.log(`✓ Graph file content preview: ${content.substring(0, 500)}...`);
  } catch (error) {
    console.log(`✗ Graph file does not exist or cannot be accessed: ${error.message}`);
  }
}

// Run the debug function
debugGraphSave().catch(console.error);
