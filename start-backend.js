const { spawn, exec } = require('child_process');
require('dotenv').config();

// Log environment variables (without sensitive values)
console.log('Environment variables loaded:');
console.log('- PORT:', process.env.PORT);
console.log('- MONGODB_URI:', process.env.MONGODB_URI ? 'Set ' : 'Not set ');
console.log('- OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? 'Set ' : 'Not set ');
console.log('- PINECONE_API_KEY:', process.env.PINECONE_API_KEY ? 'Set ' : 'Not set ');
console.log('- PINECONE_ENVIRONMENT:', process.env.PINECONE_ENVIRONMENT);
console.log('- PINECONE_INDEX:', process.env.PINECONE_INDEX);

// Start the backend server
const server = spawn('node', ['index.js'], {
  cwd: '/Users/saadahmed/Desktop/my_chatbot/backend',
  stdio: 'inherit'
});

server.on('error', (err) => {
  console.error('Failed to start server:', err);
});

// Start the frontend server
const frontendProcess = exec('cd /Users/saadahmed/Desktop/my_chatbot/frontend && npm start', (error, stdout, stderr) => {
  if (error) {
    console.error(`Frontend execution error: ${error}`);
    return;
  }
  console.log(`Frontend stdout: ${stdout}`);
  if (stderr) {
    console.error(`Frontend stderr: ${stderr}`);
  }
});

// Handle process exits
server.on('exit', (code, signal) => {
  console.log(`Backend process exited with code ${code} and signal ${signal}`);
});

frontendProcess.on('exit', (code, signal) => {
  console.log(`Frontend process exited with code ${code} and signal ${signal}`);
});
