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
const { ApiError } = require('../middleware/errorHandler');

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

    // Log request details for debugging
    console.log('Document upload request:', {
      fileName: req.file.originalname,
      fileType: req.file.mimetype,
      fileSize: req.file.size,
      userId: req.body.userId || 'not provided'
    });

    // Process document and store in MongoDB
    // Use a default 'test-user' if userId is not provided
    const userId = req.body.userId || 'test-user';
    console.log('Using userId for document:', userId);
    
    const document = new Document({
      name: req.file.originalname,
      userId: userId,
      type: req.file.mimetype
    });
    
    try {
      await document.save();
      console.log('Document metadata saved to MongoDB with ID:', document._id);
    } catch (dbError) {
      console.error('MongoDB save error:', dbError);
      return res.status(500).json({
        error: 'Failed to save document metadata',
        details: dbError.message,
        code: 'DB_SAVE_ERROR'
      });
    }

    // Process and store vectors
    try {
      const processed = await documentProcessor.processDocument(text);
      await vectorStore.addDocumentChunks(document._id, processed.chunks);
      console.log('Document vectors stored in Pinecone, chunks:', processed.chunks.length);
      
      res.json({
        message: 'Document processed successfully',
        documentId: document._id,
        userId: userId,
        name: document.name,
        ...processed.metadata
      });
    } catch (vectorError) {
      console.error('Vector processing error:', vectorError);
      // Document metadata was saved but vector processing failed
      // We should clean up the document from MongoDB
      try {
        await Document.findByIdAndDelete(document._id);
        console.log('Cleaned up document metadata after vector processing failure');
      } catch (cleanupError) {
        console.error('Failed to clean up document after vector error:', cleanupError);
      }
      
      return res.status(500).json({
        error: 'Failed to process document vectors',
        details: vectorError.message,
        code: 'VECTOR_PROCESSING_ERROR'
      });
    }

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ 
      error: 'Failed to process document',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      code: 'GENERAL_ERROR'
    });
  }
});

// Get all documents for a user
router.get('/', async (req, res, next) => {
  try {
    // Get userId from authenticated user or request parameter
    // In a production app, this would come from the authenticated user
    const userId = req.query.userId || 'test-user';
    
    const documents = await Document.find({ userId })
      .select('name type createdAt _id')
      .sort('-createdAt');
    
    res.json(documents);
  } catch (error) {
    next(new ApiError('Failed to fetch documents', 500, error.message));
  }
});

// Rename a document
router.put('/:documentId', async (req, res, next) => {
  try {
    const { name } = req.body;
    
    if (!name) {
      return next(new ApiError('Document name is required', 400));
    }
    
    const document = await Document.findByIdAndUpdate(
      req.params.documentId,
      { name },
      { new: true }
    );
    
    if (!document) {
      return next(new ApiError('Document not found', 404));
    }
    
    res.json(document);
  } catch (error) {
    next(new ApiError('Failed to update document', 500, error.message));
  }
});

// 2. Document Query Route
router.post('/query', async (req, res, next) => {
  try {
    console.log('Query received:', req.body);
    
    const { query, documentId } = req.body;
    
    if (!query) {
      return next(new ApiError('Query is required', 400));
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

// Direct ChatGPT queries (non-RAG)
router.post('/query/direct', async (req, res, next) => {
  try {
    const { query } = req.body;
    
    if (!query) {
      return next(new ApiError('Query is required', 400));
    }

    console.log('Direct query received:', query);

    const messages = [
      new SystemMessage('You are Algowizz, a BusinessGPT designed to assist businesses with in-depth business analysis and day-to-day operational tasks. Leverage your extensive business expertise to provide clear, actionable insights and solutions. When necessary, you have access to retrieval augmented generation (RAG) capabilities, including internal documents, to enrich your responses with accurate and contextual data. Ensure that all your answers are professional, analytical, and tailored to the needs of a business audience.'),
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

// Delete a document
router.delete('/:documentId', async (req, res, next) => {
  try {
    const document = await Document.findByIdAndDelete(req.params.documentId);
    
    if (!document) {
      return next(new ApiError('Document not found', 404));
    }
    
    // Also delete associated vector embeddings
    await vectorStore.deleteDocument(req.params.documentId);
    
    res.json({ 
      success: true, 
      message: 'Document deleted successfully',
      documentId: req.params.documentId
    });
  } catch (error) {
    next(new ApiError('Failed to delete document', 500, error.message));
  }
});

module.exports = router;