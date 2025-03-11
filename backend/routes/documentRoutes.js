require('dotenv').config();
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { PDFExtract } = require('pdf.js-extract');
const pdfExtract = new PDFExtract();
const Document = require('../models/Document');
const vectorStore = require('../utils/vectorStore');
const documentProcessor = require('../utils/textSplitter');
const { ChatOpenAI } = require('langchain/chat_models/openai');
const { HumanMessage, SystemMessage } = require('langchain/schema');
const { OpenAI } = require('langchain/llms/openai');
const { analyzeEntities } = require('../utils/textAnalysis');

// Initialize LLM for metadata processing
const llm = new OpenAI({
  temperature: 0,
  modelName: 'gpt-4',
  openAIApiKey: process.env.OPENAI_API_KEY
});

// Import the shared citation configuration
const { CITATION_CONFIG } = require('../config/citation');

// Get all documents with pagination and filtering
router.get('/', async (req, res) => {
  try {
    const { 
      userId = 'test-user',
      page = 1,
      limit = 10,
      type,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build query
    const query = { userId };
    if (type) query.type = type;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { 'metadata.sections.title': { $regex: search, $options: 'i' } }
      ];
    }

    // Build sort
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // Execute query with pagination
    const [documents, total] = await Promise.all([
      Document.find(query)
        .select('name type createdAt metadata.pageCount metadata.sections _id')
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit),
      Document.countDocuments(query)
    ]);

    res.json({
      documents,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json({
      error: 'Failed to fetch documents',
      details: error.message
    });
  }
});

// Additional endpoint to match frontend requests for document list by user ID
router.get('/list/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { 
      page = 1,
      limit = 10,
      type,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build query
    const query = { userId };
    if (type) query.type = type;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { 'metadata.sections.title': { $regex: search, $options: 'i' } }
      ];
    }

    // Build sort
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // Execute query with pagination
    const [documents, total] = await Promise.all([
      Document.find(query)
        .select('name type createdAt metadata.pageCount metadata.sections _id')
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit),
      Document.countDocuments(query)
    ]);

    res.json(documents);
  } catch (error) {
    console.error('Error fetching documents for user:', error);
    res.status(500).json({
      error: 'Failed to fetch documents',
      details: error.message
    });
  }
});

// Get document chunks
router.get('/:documentId/chunks', async (req, res) => {
  try {
    const { documentId } = req.params;
    
    // Verify document exists
    const document = await Document.findOne({
      _id: documentId,
      userId: req.query.userId || 'test-user'
    });

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Get chunks from vector store
    const chunks = await vectorStore.getDocumentChunks(documentId);
    
    // Enhance chunks with additional metadata
    const enhancedChunks = chunks.map(chunk => ({
      ...chunk,
      metadata: {
        ...chunk.metadata,
        documentTitle: document.name,
        totalPages: document.metadata?.pageCount || 1,
        sections: document.metadata?.sections || [],
        citation: {
          displayText: `[Source: ${document.name}, Page ${chunk.metadata.pageNumber}/${document.metadata?.pageCount || 1}]`,
          blockQuote: `---
Document: ${document.name}
Page: ${chunk.metadata.pageNumber}/${document.metadata?.pageCount || 1}
Section: ${chunk.metadata.section || 'Main Content'}
Relevance Score: 95.0%
---`
        }
      }
    }));

    res.json({
      documentId,
      documentTitle: document.name,
      chunks: enhancedChunks,
      totalChunks: enhancedChunks.length
    });
  } catch (error) {
    console.error('Error fetching document chunks:', error);
    res.status(500).json({
      error: 'Failed to fetch document chunks',
      details: error.message
    });
  }
});

// Delete document
router.delete('/:documentId', async (req, res) => {
  try {
    const { documentId } = req.params;
    
    // Get document to check ownership
    const document = await Document.findOne({
      _id: documentId,
      userId: req.query.userId || 'test-user'
    });

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Delete document chunks from vector store
    await vectorStore.deleteDocument(documentId);

    // Delete document from MongoDB
    await Document.deleteOne({ _id: documentId });

    res.json({
      success: true,
      message: 'Document and associated chunks deleted successfully',
      documentId
    });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({
      error: 'Failed to delete document',
      details: error.message
    });
  }
});

// Configure multer for memory storage with enhanced validation
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
    files: 1 // Only allow one file at a time
  },
  fileFilter: (req, file, cb) => {
    // Enhanced file type validation
    const allowedTypes = {
      'text/plain': ['.txt'],
      'application/pdf': ['.pdf'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx']
    };

    const fileType = allowedTypes[file.mimetype];
    if (!fileType) {
      return cb(new Error('Unsupported file type. Allowed types: .txt, .pdf, .doc, .docx'));
    }

    // Validate file extension
    const ext = path.extname(file.originalname).toLowerCase();
    if (!fileType.includes(ext)) {
      return cb(new Error(`Invalid file extension ${ext}. Expected ${fileType.join(' or ')} for ${file.mimetype}`));
    }

    cb(null, true);
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
      .map(page => page.content ? page.content.map(item => item.str).join(' ') : '')
      .join('\n\n');
    
    console.log('Extracted text length:', text.length);
    
    // Return both the text and the original data
    return {
      text: text,
      pages: data.pages,
      info: data.info || {}
    };
  } catch (error) {
    console.error('PDF extraction error:', error);
    throw error;
  }
}

// 1. Document Upload Route with Enhanced Metadata
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log('Processing file:', req.file.originalname, 'type:', req.file.mimetype);

    let text;
    let metadata = {
      title: req.file.originalname,
      uploadDate: new Date(),
      type: req.file.mimetype,
      sections: [],
      processingStats: {
        processedAt: new Date(),
        totalChunks: 0,
        averageChunkSize: 0
      }
    };

    try {
      if (req.file.mimetype === 'application/pdf') {
        const pdfData = await extractTextFromPDF(req.file.buffer);
        text = pdfData.text || '';
        
        // Ensure pages array exists and has content
        const pages = pdfData.pages || [];
        
        metadata = {
          ...metadata,
          pageCount: pages.length || 1,
          title: pdfData.info?.Title || metadata.title,
          author: pdfData.info?.Author,
          creationDate: pdfData.info?.CreationDate,
          sections: pages.map((page, index) => ({
            title: `Page ${index + 1}`,
            startPage: index + 1,
            endPage: index + 1,
            summary: page.content && typeof page.content === 'string' ? 
              page.content.slice(0, 200) + '...' : 
              `Content for page ${index + 1}`
          }))
        };
      } else {
        text = req.file.buffer.toString('utf-8');
        // For text files, try to detect sections based on content
        const lines = text.split('\n');
        let currentSection = { title: 'Introduction', content: [] };
        const sections = [currentSection];

        lines.forEach(line => {
          if (line.match(/^(chapter|section|\d+\.)/i)) {
            currentSection = { title: line.trim(), content: [] };
            sections.push(currentSection);
          } else {
            currentSection.content.push(line);
          }
        });

        metadata.sections = sections.map((section, index) => ({
          title: section.title,
          startPage: Math.floor((index * lines.length) / sections.length) + 1,
          endPage: Math.floor(((index + 1) * lines.length) / sections.length),
          summary: section.content.slice(0, 3).join('\n')
        }));

        metadata.pageCount = Math.ceil(lines.length / 40); // Rough estimate for text files
      }
      console.log('Text and metadata extracted successfully');
    } catch (extractError) {
      console.error('Text extraction failed:', extractError);
      return res.status(500).json({ 
        error: 'Failed to extract text from document',
        details: extractError.message 
      });
    }

    // Create document with enhanced metadata
    const document = new Document({
      name: metadata.title,
      originalName: req.file.originalname,
      userId: req.body.userId || 'test-user',
      type: req.file.mimetype,
      uploadDate: metadata.uploadDate,
      metadata: {
        title: metadata.title,
        author: metadata.author,
        pageCount: metadata.pageCount,
        sections: metadata.sections,
        creationDate: metadata.creationDate,
        keywords: [], // Will be populated during processing
        documentStructure: {
          chapters: metadata.sections.map((section, index) => ({
            title: section.title,
            startChunk: index * 10, // Rough estimate, will be updated during processing
            endChunk: (index + 1) * 10,
            pageRange: {
              start: section.startPage,
              end: section.endPage
            }
          }))
        }
      }
    });

    await document.save();

    // Process document with enhanced metadata and citations
    const processed = await documentProcessor.processDocument(text, {
      ...metadata,
      documentId: document._id,
      citationFormat: {
        displayText: `[Source: ${metadata.title}, Page {pageNumber}/{totalPages}]`,
        blockQuote: `---
Document: ${metadata.title}
Page: {pageNumber}/{totalPages}
Section: {section}
Relevance Score: {relevanceScore}%
---`
      }
    });
    
    // Update document with processed metadata
    document.metadata.documentStructure = processed.metadata.documentStructure;
    document.metadata.processingStats = {
      totalChunks: processed.metadata.totalChunks,
      averageChunkSize: processed.metadata.averageChunkSize,
      processedAt: processed.metadata.processedAt,
      citationStats: {
        totalCitations: processed.metadata.totalCitations,
        averageRelevanceScore: processed.metadata.averageRelevanceScore
      }
    };
    await document.save();

    // Store chunks with enhanced citations and metadata
    const enhancedChunks = processed.chunks.map(chunk => ({
      ...chunk,
      metadata: {
        ...chunk.metadata,
        title: metadata.title,
        documentId: document._id,
        totalPages: metadata.pageCount,
        uploadDate: metadata.uploadDate,
        citationDisplayText: chunk.metadata.citationDisplayText,
        citationBlockQuote: chunk.metadata.citationBlockQuote,
        contextPrevious: chunk.metadata.previousContext || '',
        contextNext: chunk.metadata.nextContext || ''
      }
    }));
    
    await vectorStore.addDocumentChunks(document._id, enhancedChunks);

    res.json({
      message: 'Document processed successfully',
      document: {
        id: document._id,
        name: document.name,
        type: document.type,
        pageCount: document.metadata.pageCount,
        sections: document.metadata.sections.map(s => s.title),
        uploadDate: document.uploadDate
      },
      stats: document.metadata.processingStats
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
      maxResults: 5
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

// Add route for Graph RAG queries
// Simple document query endpoint to match frontend expectations
router.post('/query', async (req, res) => {
  try {
    const { query, documentId } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    if (!documentId) {
      return res.status(400).json({ error: 'Document ID is required' });
    }

    // Verify document exists
    const document = await Document.findById(documentId);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Get chunks from vector store with the query
    const results = await vectorStore.searchDocument(documentId, query, 5);
    
    if (!results || results.length === 0) {
      return res.json({
        answer: "I couldn't find relevant information in the document.",
        query,
        documentId,
        relevantChunks: []
      });
    }

    // Process results with enhanced metadata
    const relevantChunks = results.map(chunk => ({
      ...chunk,
      metadata: {
        ...chunk.metadata,
        title: document.name,
        section: chunk.metadata.section || 'Main Content',
        pageNumber: chunk.metadata.pageNumber || 1,
        totalPages: document.metadata?.pageCount || 1,
        relevanceScore: chunk.score,
        uploadDate: document.createdAt || new Date().toISOString(),
        context: { previous: '', next: '' },
        citation: {
          displayText: `[Source: ${document.name}, Page ${chunk.metadata.pageNumber || 1}/${document.metadata?.pageCount || 1}]`,
          blockQuote: `---
Document: ${document.name}
Page: ${chunk.metadata.pageNumber || 1}/${document.metadata?.pageCount || 1}
Section: ${chunk.metadata.section || 'Main Content'}
Relevance Score: ${(chunk.score * 100).toFixed(1)}%
---`
        }
      }
    }));

    // Get response from AI
    let answer = `Based on the document "${document.name}", I found the following information:\n\n`;
    
    // Add content from the most relevant chunks
    relevantChunks.forEach((chunk, index) => {
      const relevancePercentage = (chunk.score * 100).toFixed(1);
      answer += `${index + 1}. From ${chunk.metadata.section || 'content'} (${relevancePercentage}% relevant):\n`;
      answer += chunk.content.substring(0, 300);
      if (chunk.content.length > 300) answer += '...';
      answer += '\n\n';
    });
    
    // Return the response
    res.json({
      answer,
      query,
      documentId,
      relevantChunks
    });
  } catch (error) {
    console.error('Error processing document query:', error);
    res.status(500).json({
      error: 'Failed to process query',
      details: error.message
    });
  }
});

router.post('/query/graph', async (req, res) => {
  try {
    const { query, documentId } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    // Search for relevant chunks in the primary document
    console.log('Searching primary document:', documentId);
    const primaryResults = await vectorStore.semanticSearch(query, {
      filterDocumentId: documentId,
      maxResults: 3
    });

    if (!primaryResults || primaryResults.length === 0) {
      return res.status(404).json({ 
        error: 'No relevant content found',
        query,
        documentId 
      });
    }

    // Get related chunks from other documents based on the top result
    const topChunkId = primaryResults[0]?.metadata?.chunkId;
    let relatedChunks = [];
    
    if (topChunkId) {
      relatedChunks = await vectorStore.getRelatedChunks(
        topChunkId,
        2 // Get 2 related chunks
      );
    }

    // Combine primary and related results
    const allResults = [
      ...primaryResults,
      ...relatedChunks
    ];

    // Extract entities and relationships
    const entityAnalysis = await analyzeEntities(allResults);
    
    // Format context for ChatGPT with chain of thought
    const context = allResults
      .map(result => result.content)
      .join('\n\n');

    // Generate response using ChatGPT with proper message objects
    const messages = [
      new SystemMessage(`You are a knowledgeable and precise assistant. Your goal is to provide clear, structured answers using the provided context.

      RESPONSE STRUCTURE:
      1. 💡 ANSWER
         - Start with a concise, direct answer to the question
         - Use bullet points for clarity when listing multiple points
         - Bold key terms using **asterisks**

      2. 📚 SOURCES & ANALYSIS
         For each key point, include a citation in this format:
         > [Document: {document_name}, Page: {page_number}]

         When citing from uploaded documents, use their actual filenames:
         According to research on neural networks...
         > [Document: ML_Fundamentals.pdf, Page: 12]

         For information from the current conversation or query context:
         Based on the analysis...
         > [Document: Current Conversation]

         For information from uploaded documents without page numbers:
         The data shows...
         > [Document: research_paper.txt, Section: Introduction]

         - Start each major point with a clear citation
         - Compare and contrast different sources when relevant
         - Use bullet points for complex information
         - Highlight any discrepancies between sources
         - Include page numbers for all important claims

      3. 🔗 SYNTHESIS (if applicable)
         - Connect information from different sources
         - Explain how different pieces of information relate
         - Identify patterns or themes
         - Note when sources complement or contradict each other
         - Include document references for connected information

      4. ⚠️ IMPORTANT NOTES
         - Mention any limitations or caveats
         - Highlight assumptions made
         - Note any missing information that would be helpful

      GUIDELINES:
      - Be concise but thorough
      - Use markdown formatting for readability
      - Break long paragraphs into digestible chunks
      - Use lists and bullet points for complex information
      - Include source references naturally in the text
      - Maintain a professional yet approachable tone

      Remember: Quality over quantity. Focus on providing accurate, well-structured information rather than lengthy explanations.`),
      new HumanMessage(`Context:\n${context}\n\nQuestion: ${query}`)
    ];

    const response = await model.invoke(messages);

    // Prepare chunk analysis
    const chunkAnalysis = {
      totalChunks: allResults.length,
      primaryChunks: primaryResults.length,
      relatedChunks: relatedChunks.length,
      averageRelevanceScore: allResults.reduce((acc, chunk) => acc + chunk.score, 0) / allResults.length,
      pageRanges: [...new Set(allResults.map(chunk => chunk.metadata.pageNumber))].sort((a, b) => a - b),
      entityAnalysis
    };

    res.json({
      answer: response.content,
      relevantChunks: allResults,
      analysis: chunkAnalysis
    });

  } catch (error) {
    console.error('Graph RAG query error:', error);
    res.status(500).json({ 
      error: 'Failed to process graph query',
      details: error.message
    });
  }
});

// Add new route for direct document queries with enhanced citations
router.post('/query/direct', async (req, res) => {
  try {
    const { query, documentIds, maxResults = 5, minScore = 0.6 } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    console.log('Direct query received:', { query, documentIds, maxResults, minScore });

    // Search for relevant chunks with enhanced metadata
    const searchResults = await vectorStore.semanticSearch(query, {
      maxResults,
      minScore,
      filterDocumentIds: documentIds
    });

    // Format results with enhanced citations
    const formattedResults = searchResults.map(result => {
      const metadata = result.metadata;
      const relevanceScore = result.score;
      
      // Format citation block with metadata
      const citationBlock = `---
Document: ${metadata.title}
Page: ${metadata.pageNumber}/${metadata.totalPages}
Section: ${metadata.section}
Relevance Score: ${(relevanceScore * 100).toFixed(1)}%
---`;
      
      return {
        content: result.content,
        score: relevanceScore,
        metadata: {
          ...metadata,
          relevanceScore,
          citation: {
            displayText: `[Source: ${metadata.title}, Page ${metadata.pageNumber}/${metadata.totalPages}]`,
            blockQuote: citationBlock
          }
        },
        context: metadata.context || {
          previous: '',
          next: ''
        }
      };
    });

    // Sort by relevance score
    formattedResults.sort((a, b) => b.score - a.score);

    // Prepare context with citations for the model
    const context = formattedResults
      .map(result => `${result.metadata.citation.blockQuote}\n${result.content}`)
      .join('\n\n');

    // Generate response using ChatGPT with citation guidelines
    const messages = [
      new SystemMessage(`You are a knowledgeable and precise assistant. Your goal is to provide clear, structured answers using the provided context.

      RESPONSE STRUCTURE:
      1. 💡 ANSWER
         - Start with a concise, direct answer to the question
         - Use bullet points for clarity when listing multiple points
         - Bold key terms using **asterisks**

      2. 📚 SOURCES & ANALYSIS
         For each key point, include a citation in this format:
         > [Document: {document_name}, Page: {page_number}]

         When citing from uploaded documents, use their actual filenames:
         According to research on neural networks...
         > [Document: ML_Fundamentals.pdf, Page: 12]

         For information from uploaded documents without page numbers:
         The data shows...
         > [Document: research_paper.txt, Section: Introduction]

         - Start each major point with a clear citation
         - Compare and contrast different sources when relevant
         - Use bullet points for complex information
         - Highlight any discrepancies between sources
         - Include page numbers for all important claims

      3. 🔗 SYNTHESIS (if applicable)
         - Connect information from different sources
         - Explain how different pieces of information relate
         - Identify patterns or themes
         - Note when sources complement or contradict each other
         - Include document references for connected information

      GUIDELINES:
      - Be concise but thorough
      - Use markdown formatting for readability
      - Break long paragraphs into digestible chunks
      - Use lists and bullet points for complex information
      - Include source references naturally in the text
      - Maintain a professional yet approachable tone

      Remember: Quality over quantity. Focus on providing accurate, well-structured information rather than lengthy explanations.`),
      new HumanMessage(`Context:\n${context}\n\nQuestion: ${query}`)
    ];

    const response = await model.invoke(messages);

    // Return enhanced response with citations and analysis
    res.json({
      answer: response.content,
      relevantChunks: formattedResults,
      stats: {
        totalResults: formattedResults.length,
        averageScore: formattedResults.reduce((acc, r) => acc + r.score, 0) / formattedResults.length,
        queryTime: new Date().toISOString(),
        pageRanges: [...new Set(formattedResults.map(r => r.metadata.pageNumber))].sort((a, b) => a - b)
      }
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