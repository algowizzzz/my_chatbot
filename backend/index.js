// Import required packages
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { ChatOpenAI } = require('@langchain/openai');
const { SystemMessage, HumanMessage, AIMessage } = require('@langchain/core/messages');
const mongoose = require('mongoose');
const Chat = require('./models/Chat');
const bcrypt = require('bcrypt');
const User = require('./models/User');
const { initVectorStore } = require('./utils/vectorStore');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const Document = require('./models/Document');
const PDFParser = require('pdf-parse');

// Initialize dotenv
dotenv.config();

// Create Express app
const app = express();

// Use CORS to allow requests from your frontend
app.use(cors());

// Use express.json() to parse JSON bodies in requests
app.use(express.json());

// Initialize ChatOpenAI instead of regular OpenAI
const model = new ChatOpenAI({
  modelName: 'gpt-3.5-turbo',
  temperature: 0,
  verbose: true
});

// Add MongoDB connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => {
  console.log('Connected to MongoDB successfully');
}).catch((error) => {
  console.error('MongoDB connection error:', error);
});

// Define a simple route (endpoint)
app.get('/', (req, res) => {
  res.send('Hello from the backend!');
});

// Update the test route to try OpenAI
app.get('/test', async (req, res, next) => {
  try {
    const completion = await model.invoke([
      new SystemMessage("Say hello!"),
      new HumanMessage("Hello!")
    ]);

    console.log('OpenAI test response:', completion);
    res.json({ 
      message: 'OpenAI is connected!', 
      aiResponse: completion.content 
    });
  } catch (error) {
    console.error('Error testing OpenAI:', error);
    next(error);
  }
});

// Update the chat endpoint to properly handle documents
app.post('/chat', async (req, res) => {
  try {
    const { message, chatHistory = [] } = req.body;
    
    // Initialize vector store
    const vectorStore = await initVectorStore();
    
    // Search for relevant documents
    const searchResults = await vectorStore.similaritySearch(message, 3);
    
    // Create context from relevant documents
    const documentContext = searchResults.map(doc => 
      `Content from ${doc.metadata.source}:\n${doc.pageContent}\n---\n`
    ).join('\n');

    // Convert chat history to LangChain message format
    const messages = [
      new SystemMessage(`You are a helpful AI assistant. Use ONLY the following documents as context:

${documentContext}

Instructions:
1. ONLY use information from the documents above
2. If you find relevant information, quote it and specify which document it's from
3. If you don't find relevant information, say "I cannot find this information in the provided documents"
4. Stay factual and only reference what is explicitly stated in the documents`),
      ...chatHistory.map(msg => 
        msg.role === 'user' 
          ? new HumanMessage(msg.content)
          : new AIMessage(msg.content)
      ),
      new HumanMessage(message)
    ];

    const response = await model.invoke(messages);
    
    res.json({ 
      message: response.content,
      sourceDocs: searchResults.map(doc => ({
        title: doc.metadata.source,
        preview: doc.pageContent.substring(0, 100)
      }))
    });

  } catch (error) {
    console.error('Error in chat route:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: 'Failed to process your message'
    });
  }
});

// Create new chat
app.post('/chats', async (req, res) => {
  try {
    const { userId = 'default' } = req.body; // Provide a default or require userId
    const chat = new Chat({
      userId,  // Include userId in creation
      title: "New Chat",
      messages: []
    });
    await chat.save();
    res.json(chat);
  } catch (error) {
    console.error('Error details:', error);
    res.status(500).json({ error: 'Failed to create chat', details: error.message });
  }
});

// Get all chats
app.get('/chats', async (req, res) => {
  try {
    const chats = await Chat.find().sort({ updatedAt: -1 });
    res.json(chats);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch chats' });
  }
});

// Get single chat
app.get('/chats/:id', async (req, res) => {
  try {
    const chat = await Chat.findById(req.params.id);
    if (!chat) return res.status(404).json({ error: 'Chat not found' });
    res.json(chat);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch chat' });
  }
});

// Update the chat messages endpoint to include document search
app.post('/chats/:id/messages', async (req, res) => {
  try {
    const { message } = req.body;
    const chat = await Chat.findById(req.params.id);
    if (!chat) return res.status(404).json({ error: 'Chat not found' });

    // Search relevant documents
    const vectorStore = await initVectorStore();
    const searchResults = await vectorStore.similaritySearch(message, 3);
    
    const documentContext = searchResults.map(doc => `
      Document: ${doc.metadata.source}
      Content: ${doc.pageContent}
      ---
    `).join('\n');

    // Add user message
    chat.messages.push({
      role: 'user',
      content: message
    });

    // Get AI response using LangChain with document context
    const messages = [
      new SystemMessage(`I am a helpful AI assistant. I will use the following documents as context:
        ${documentContext}
        
        When answering:
        1. Only use information from these documents
        2. If you find relevant information, cite the source document
        3. If you can't find relevant information, say so clearly`),
      ...chat.messages.map(msg => 
        msg.role === 'user' 
          ? new HumanMessage(msg.content)
          : new AIMessage(msg.content)
      )
    ];

    const response = await model.invoke(messages);

    // Add AI response
    chat.messages.push({
      role: 'assistant',
      content: response.content
    });

    chat.updatedAt = Date.now();
    await chat.save();

    res.json({ 
      message: response.content,
      sourceDocs: searchResults.map(doc => doc.metadata.source)
    });
  } catch (error) {
    console.error('Error in chat message:', error);
    res.status(500).json({ error: 'Failed to process message' });
  }
});

// Add this new route
app.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create new user
    const user = new User({
      email,
      password: hashedPassword,
      name
    });

    await user.save();

    res.status(201).json({ message: 'User registered successfully' });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Improve error handling middleware
app.use((err, req, res, next) => {
  console.error('Error details:', err);
  res.status(err.status || 500).json({ 
    error: err.message || 'Internal server error',
    path: req.path
  });
});

// Define a port to listen on
const PORT = process.env.PORT || 5004;

// Start the server and keep it running
app.listen(PORT, () => {
  console.log('=================================');
  console.log(`Server running at http://localhost:${PORT}`);
  console.log('Try accessing http://localhost:5004/test in your browser');
  console.log('=================================');
});

// (Optional) A log to indicate the script has started executing
console.log('Server setup complete.');

// Get all chats for a specific user
app.get('/user/:userId/chats', async (req, res) => {
  try {
    const { userId } = req.params;
    const chats = await Chat.find({ userId }).sort({ updatedAt: -1 });
    res.json(chats);
  } catch (error) {
    console.error('Error fetching chats:', error);
    res.status(500).json({ error: 'Failed to fetch chats' });
  }
});

// Create a new chat for a user
app.post('/user/:userId/chats', async (req, res) => {
  try {
    const { userId } = req.params;
    const chat = new Chat({
      userId,
      title: "New Chat",
      messages: []
    });
    await chat.save();
    res.status(201).json(chat);
  } catch (error) {
    console.error('Error creating chat:', error);
    res.status(500).json({ error: 'Failed to create chat' });
  }
});

// Add message to specific chat
app.post('/user/:userId/chats/:chatId/messages', async (req, res) => {
  try {
    const { userId, chatId } = req.params;
    const { message } = req.body;

    // Find chat and verify it belongs to user
    const chat = await Chat.findOne({ _id: chatId, userId });
    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    // If this is the first message, update the chat title
    if (chat.messages.length === 0) {
      // Take first ~30 characters of message as title
      chat.title = message.length > 30 ? `${message.substring(0, 30)}...` : message;
    }

    // Add user message
    chat.messages.push({
      role: 'user',
      content: message
    });

    // Get AI response
    const response = await model.call([
      ...chat.messages.map(m => ({
        role: m.role,
        content: m.content
      }))
    ]);

    // Add AI response to chat
    chat.messages.push({
      role: 'assistant',
      content: response.content
    });

    await chat.save();
    res.json({ 
      message: response.content,
      title: chat.title // Send back updated title
    });
  } catch (error) {
    console.error('Error adding message:', error);
    res.status(500).json({ error: 'Failed to add message' });
  }
});

// Add this test route
app.post('/test-vector', async (req, res) => {
  try {
    const vectorStore = await initVectorStore();
    
    // Test embedding a simple text
    const result = await vectorStore.addDocuments([{
      pageContent: "This is a test document",
      metadata: { source: "test" }
    }]);

    res.json({ message: "Vector store initialized and test document added successfully" });
  } catch (error) {
    console.error('Vector store test error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add route to get all documents for a user
app.get('/documents/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const documents = await Document.find({ userId })
      .sort({ createdAt: -1 })
      .select('title createdAt');
    res.json(documents);
  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

// Add this helper function at the top
function logDocumentDetails(doc) {
  console.log('\n=== Document Details ===');
  console.log('Title:', doc.title);
  console.log('ID:', doc._id);
  console.log('Content Preview:', doc.content.substring(0, 200) + '...');
  console.log('Content Length:', doc.content.length);
  console.log('======================\n');
}

// Update the upload route
app.post('/upload-document', upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Extract content
    let fileContent;
    if (req.file.mimetype === 'application/pdf') {
      const pdfData = await PDFParser(req.file.buffer);
      fileContent = pdfData.text;
    } else {
      fileContent = req.file.buffer.toString('utf-8');
    }

    // Initialize vector store and add document
    const vectorStore = await initVectorStore();
    const vectorIds = await vectorStore.addDocuments([
      {
        pageContent: fileContent,
        metadata: { 
          source: req.file.originalname,
          type: req.file.mimetype,
          uploadedAt: new Date().toISOString()
        }
      }
    ]);

    const document = new Document({
      userId: req.body.userId || 'default-user',
      title: req.file.originalname,
      content: fileContent,
      fileType: req.file.mimetype,
      vectorId: vectorIds[0]
    });

    await document.save();
    
    res.status(201).json({
      _id: document._id,
      title: document.title,
      createdAt: document.createdAt
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

// Add document querying route
app.post('/query-document/:documentId', async (req, res) => {
  try {
    const { documentId } = req.params;
    const { message } = req.body;

    const document = await Document.findById(documentId);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const prompt = `
      Document content (exactly as written):
      "${document.content}"

      User question: "${message}"
      
      Instructions:
      1. Only use information from the document content shown above
      2. For questions about content, provide the relevant information
      3. For summary requests, summarize the entire content
      4. For specific questions (like names, dates, facts), quote the relevant parts
      5. If asked about something not in the document, clearly state it's not present
      6. Always stay factual and only use what's explicitly stated
    `;

    const response = await model.call([
      { 
        role: 'system', 
        content: 'You are a precise document assistant. Analyze the document content comprehensively and answer questions accurately based only on the provided content.' 
      },
      { role: 'user', content: prompt }
    ]);

    res.json({ message: response.content });

  } catch (error) {
    console.error('Query error:', error);
    res.status(500).json({ error: 'Failed to query document' });
  }
});

// Add document deletion route
app.delete('/documents/:documentId', async (req, res) => {
  try {
    const { documentId } = req.params;
    
    // Get document to get vectorId
    const document = await Document.findById(documentId);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Delete from MongoDB
    await Document.findByIdAndDelete(documentId);

    // Initialize vector store
    const vectorStore = await initVectorStore();
    
    // Delete from vector store (if supported)
    try {
      await vectorStore.delete([document.vectorId]);
    } catch (error) {
      console.log('Note: Vector deletion not supported or failed:', error);
    }

    res.json({ message: 'Document deleted successfully' });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

// Update the query route with detailed logging
app.post('/query-multiple', async (req, res) => {
  try {
    const { message } = req.body;
    
    // Log the incoming query
    console.log('\n=== QUERY START ===');
    console.log('Query:', message);

    // Get documents and log them
    const documents = await Document.find({});
    console.log('\n=== DOCUMENTS FOUND ===');
    console.log('Number of documents:', documents.length);
    documents.forEach((doc, i) => {
      console.log(`\nDocument ${i + 1}:`);
      console.log('Title:', doc.title);
      console.log('Content preview:', doc.content.substring(0, 100));
    });

    // Create context and log it
    const context = documents.map(doc => `
DOCUMENT: ${doc.title}
CONTENT:
${doc.content}
---END DOCUMENT---
`).join('\n\n');

    console.log('\n=== CONTEXT CREATED ===');
    console.log('Context length:', context.length);
    console.log('Context preview:', context.substring(0, 200));

    // Create messages and log them
    const messages = [
      {
        role: 'system',
        content: 'You are a document search assistant. Only use information from the documents provided.'
      },
      {
        role: 'user',
        content: `
Here are the documents to search:

${context}

User Question: "${message}"

Instructions:
1. Only use information from the documents above
2. If you find relevant information, quote it and specify which document it's from
3. If you don't find the information, say "I cannot find this information in the documents"
`
      }
    ];

    console.log('\n=== SENDING TO AI ===');
    console.log('Messages structure:', JSON.stringify(messages.map(m => ({
      role: m.role,
      contentLength: m.content.length
    })), null, 2));

    // Make the API call
    const response = await model.call(messages);

    console.log('\n=== AI RESPONSE ===');
    console.log(response.content);

    res.json({
      message: response.content,
      searchedDocs: documents.map(doc => doc.title)
    });

  } catch (error) {
    console.error('\n=== ERROR ===');
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to query documents' });
  }
});

// Add this simple test route
app.get('/test-documents', async (req, res) => {
  try {
    const documents = await Document.find({});
    console.log('\n=== DOCUMENTS IN DATABASE ===');
    documents.forEach((doc, i) => {
      console.log(`\nDocument ${i + 1}:`);
      console.log('Title:', doc.title);
      console.log('Content:', doc.content);
    });
    
    res.json({
      count: documents.length,
      documents: documents.map(doc => ({
        title: doc.title,
        contentPreview: doc.content.substring(0, 100)
      }))
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});
