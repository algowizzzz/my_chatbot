require('dotenv').config();
const express = require('express');
const router = express.Router();
const multer = require('multer');
const { PDFExtract } = require('pdf.js-extract');
const pdfExtract = new PDFExtract();
const Document = require('../models/Document');
const vectorStore = require('../utils/vectorStore');
const documentProcessor = require('../utils/textSplitter');
const { ChatOpenAI } = require('@langchain/openai');
const { HumanMessage, SystemMessage } = require('@langchain/core/messages');

// Configure multer for memory storage
const upload = multer({ 
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    // Accept .txt and .pdf files
    if (file.mimetype === 'text/plain' || file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only .txt and .pdf files are allowed'));
    }
  }
});

// Initialize ChatGPT model
const model = new ChatOpenAI({
  openAIApiKey: process.env.OPENAI_API_KEY,
  modelName: 'gpt-3.5-turbo',
  temperature: 0
});

// Helper function to extract text from PDF
async function extractTextFromPDF(buffer) {
  try {
    console.log('Starting PDF extraction...');
    const options = {};
    const data = await pdfExtract.extractBuffer(buffer, options);
    console.log('PDF pages extracted:', data.pages.length);
    
    // Combine all pages text
    const text = data.pages
      .map(page => page.content.map(item => item.str).join(' '))
      .join('\n\n');
    
    console.log('Extracted text length:', text.length);
    return text;
  } catch (error) {
    console.error('PDF extraction error:', error);
    throw error;
  }
}

// 1. Document Upload Route
router.post('/upload', upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log('Processing file:', req.file.originalname, 'type:', req.file.mimetype);

    let text;
    try {
      if (req.file.mimetype === 'application/pdf') {
        text = await extractTextFromPDF(req.file.buffer);
      } else {
        text = req.file.buffer.toString('utf-8');
      }
      console.log('Text extracted successfully');
    } catch (extractError) {
      console.error('Text extraction failed:', extractError);
      return res.status(500).json({ 
        error: 'Failed to extract text from document',
        details: extractError.message 
      });
    }

    // Process document and store in MongoDB
    const document = new Document({
      name: req.file.originalname,
      userId: req.body.userId,
      type: req.file.mimetype
    });
    await document.save();

    // Process and store vectors
    const processed = await documentProcessor.processDocument(text);
    await vectorStore.addDocumentChunks(document._id, processed.chunks);

    res.json({
      message: 'Document processed successfully',
      documentId: document._id,
      ...processed.metadata
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ 
      error: 'Failed to process document',
      details: error.message 
    });
  }
});

// Add route to get user's documents
router.get('/list/:userId', async (req, res) => {
  try {
    const documents = await Document.find({ userId: req.params.userId })
      .select('name type createdAt _id')
      .sort('-createdAt');
    res.json(documents);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

// Add route to rename document
router.put('/rename/:documentId', async (req, res) => {
  try {
    const { name } = req.body;
    const document = await Document.findByIdAndUpdate(
      req.params.documentId,
      { name },
      { new: true }
    );
    res.json(document);
  } catch (error) {
    res.status(500).json({ error: 'Failed to rename document' });
  }
});

// 2. Document Query Route
router.post('/query', async (req, res) => {
  try {
    console.log('Query received:', req.body);
    
    const { query, documentId } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    // Search for relevant chunks
    console.log('Searching for:', query, 'in document:', documentId);
    const searchResults = await vectorStore.semanticSearch(query, {
      filterDocumentId: documentId,
      maxResults: 3
    });

    console.log('Search results:', JSON.stringify(searchResults, null, 2));

    if (!searchResults || searchResults.length === 0) {
      return res.status(404).json({ 
        error: 'No relevant content found',
        query,
        documentId 
      });
    }

    // Format context for ChatGPT
    const context = searchResults
      .map(result => result.content)
      .join('\n\n');

    // Generate response using ChatGPT with proper message objects
    const messages = [
      new SystemMessage('You are a helpful assistant. Use the provided context to answer questions accurately. Only use information from the context provided.'),
      new HumanMessage(`Context:\n${context}\n\nQuestion: ${query}`)
    ];

    const response = await model.invoke(messages);

    res.json({
      answer: response.content,
      relevantChunks: searchResults
    });

  } catch (error) {
    console.error('Query error details:', error);
    res.status(500).json({ 
      error: 'Failed to process query',
      details: error.message,
      stack: error.stack
    });
  }
});

// Add new route for direct ChatGPT queries (non-RAG)
router.post('/query/direct', async (req, res) => {
  try {
    const { query } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    console.log('Direct query received:', query);

    const messages = [
      new SystemMessage('You are a helpful assistant. Answer questions based on your general knowledge.'),
      new HumanMessage(query)
    ];

    const response = await model.invoke(messages);

    res.json({
      answer: response.content,
      isRAG: false
    });

  } catch (error) {
    console.error('Direct query error:', error);
    res.status(500).json({ 
      error: 'Failed to process direct query',
      details: error.message
    });
  }
});

module.exports = router; 