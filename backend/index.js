require('dotenv').config();  // Must be first line
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');
const { errorHandler } = require('./middleware/errorHandler');
const documentRoutes = require('./routes/documentRoutes');
const graphRagRouter = require('./routes/graphRag');
const chatRoutes = require('./routes/chatRoutes');
const chatMessageRoutes = require('./routes/chatMessageRoutes');
const authRoutes = require('./routes/authRoutes');

// Verify environment variables are loaded
console.log('Environment Check:', {
  hasOpenAI: !!process.env.OPENAI_API_KEY,
  hasPinecone: !!process.env.PINECONE_API_KEY,
  hasMongoURI: !!process.env.MONGODB_URI
});

const app = express();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Middleware
app.use(cors());

// Increase request size limits for document uploads
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Routes
app.use('/api/documents', documentRoutes);
app.use('/api/graph', graphRagRouter);
app.use('/api/chats', chatRoutes);
app.use('/api/messages', chatMessageRoutes); // Renamed from /api/chat for consistency
app.use('/api/auth', authRoutes);

// Error handling middleware (must be after routes)
app.use(errorHandler);

// Initialize vector store
const vectorStore = require('./utils/vectorStore');
vectorStore.initialize().then(() => {
  console.log('Vector store initialized');
}).catch(err => {
  console.error('Vector store initialization failed:', err);
});

// Serve static files from the React app in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../frontend/build')));

  // Handle any requests that don't match the ones above
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/build/index.html'));
  });
}

// Parse command line arguments for port
const args = process.argv.slice(2);
let portArg;
args.forEach(arg => {
  if (arg.startsWith('--port=')) {
    portArg = arg.split('=')[1];
  }
});

const PORT = portArg || process.env.PORT || 5005;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
