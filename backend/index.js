require('dotenv').config();  // Must be first line
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const documentRoutes = require('./routes/documentRoutes');
const chatRoutes = require('./routes/chatRoutes');
const graphRagRouter = require('./routes/graphRag');

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
app.use(express.json());

// Routes
app.use('/api/documents', documentRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/graph', graphRagRouter);

// Initialize vector store
const vectorStore = require('./utils/vectorStore');
vectorStore.initialize().then(() => {
  console.log('Vector store initialized');
}).catch(err => {
  console.error('Vector store initialization failed:', err);
});

const PORT = process.env.PORT || 5004;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
