const express = require('express');
const router = express.Router();
const natural = require('natural');  // We'll use this for basic NLP
const { OpenAI } = require('openai');
const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');
const mongoose = require('mongoose');
const { MongoClient } = require('mongodb');
const chunkSelection = require('../utils/chunkSelection');
const winston = require('winston');
const fsPromises = require('fs').promises;
const { extractEntitiesAndRelations } = require('../utils/entityExtraction');
const multer = require('multer');

// Import models
const GraphDocument = require('../models/GraphDocument');
const GraphData = require('../models/GraphData');

// Initialize OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Configure logger
const logger = winston.createLogger({
    level: 'debug',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        // Console logging
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        }),
        // File logging
        new winston.transports.File({ 
            filename: 'logs/graph-rag-error.log', 
            level: 'error' 
        }),
        new winston.transports.File({ 
            filename: 'logs/graph-rag-debug.log'
        })
    ]
});

// Add logging middleware
router.use((req, res, next) => {
    logger.info('Incoming request', {
        path: req.path,
        method: req.method,
        query: req.query,
        body: req.body
    });
    next();
});

// Add a test function
async function testOpenAIConnection() {
    try {
        const test = await openai.embeddings.create({
            model: "text-embedding-ada-002",
            input: "test"
        });
        console.log("OpenAI connection successful");
        return true;
    } catch (error) {
        console.error("OpenAI connection failed:", error);
        return false;
    }
}

// Test on startup
testOpenAIConnection();

// Enhanced graph structure with MongoDB integration
class KnowledgeGraph {
    constructor(documentId = null) {
        this.documentId = documentId;
        this.nodes = new Map();  // Store entities
        this.edges = new Map();  // Store relationships
        this.chunks = new Map(); // Store chunk_id -> text mapping
        this.relationships = new Map();
        this.chunkMetadata = new Map(); // Store metadata for chunks
        this.isLoaded = false;
        
        // Initialize temporary in-memory state for current session
        this.tempState = {
            chunks: [],
            nodes: new Map(),
            relationships: new Map(),
            metadata: new Map()  // Store metadata for chunks
        };
    }
    
    // Load graph data for a specific document
    async loadForDocument(documentId) {
        try {
            this.documentId = documentId;
            this.clear(); // Clear existing data
            
            // Load from MongoDB
            const graphData = await GraphData.findOne({ documentId });
            
            if (!graphData) {
                logger.warn(`No graph data found for document ${documentId}`);
                return false;
            }
            
            // Load chunks
            graphData.chunks.forEach(chunk => {
                if (chunk.chunkId && chunk.text) {
                    this.chunks.set(chunk.chunkId, chunk.text);
                    if (chunk.metadata) {
                        this.chunkMetadata.set(chunk.chunkId, {
                            ...chunk.metadata,
                            metadataBlock: `---
Document: ${chunk.metadata.documentName || 'Unknown'}
Page: ${chunk.metadata.pageNumber || '1/1'}
Section: ${chunk.metadata.section || 'General'}
Relevance Score: ${(chunk.metadata.relevanceScore || 0.8) * 100}%
---`,
                            formattedCitation: `[Source: ${chunk.metadata.documentName || 'Unknown'}, Page ${chunk.metadata.pageNumber || '1/1'}]`
                        });
                    }
                }
            });
            
            // Load nodes
            graphData.nodes.forEach(node => {
                this.nodes.set(node.entity, {
                    type: node.type,
                    metadata: node.metadata || {},
                    connectedChunks: new Set(node.connectedChunks || []),
                    relationships: new Set(node.relationships || [])
                });
            });
            
            // Load relationships
            graphData.relationships.forEach(rel => {
                this.relationships.set(rel.relationKey, {
                    source: rel.source,
                    target: rel.target,
                    type: rel.type,
                    chunkId: rel.chunkId
                });
            });
            
            this.isLoaded = true;
            logger.info(`Successfully loaded graph data for document ${documentId}`);
            return true;
        } catch (error) {
            logger.error(`Error loading graph data for document ${documentId}:`, error);
            return false;
        }
    }

    addNode(entity, type, metadata = {}) {
        if (!this.nodes.has(entity)) {
            this.nodes.set(entity, {
                type,
                metadata,
                connectedChunks: new Set(),
                relationships: new Set()
            });
        }
    }

    addChunkConnection(entity, chunkId) {
        if (this.nodes.has(entity)) {
            this.nodes.get(entity).connectedChunks.add(chunkId);
        }
    }

    addRelationship(entity1, relationship, entity2, chunkId) {
        const relationKey = `${entity1}|${relationship}|${entity2}`;
        this.relationships.set(relationKey, {
            source: entity1,
            target: entity2,
            type: relationship,
            chunkId
        });

        // Add to entities' relationship sets
        if (this.nodes.has(entity1)) {
            this.nodes.get(entity1).relationships.add(relationKey);
        }
        if (this.nodes.has(entity2)) {
            this.nodes.get(entity2).relationships.add(relationKey);
        }
    }

    getEntityRelationships(entity) {
        if (!this.nodes.has(entity)) return [];
        
        const relationships = [];
        this.nodes.get(entity).relationships.forEach(relKey => {
            relationships.push(this.relationships.get(relKey));
        });
        return relationships;
    }

    getRelevantChunks(entities) {
        const relevantChunks = new Set();
        entities.forEach(entity => {
            if (this.nodes.has(entity)) {
                const chunks = this.nodes.get(entity).connectedChunks;
                chunks.forEach(chunk => relevantChunks.add(chunk));
            }
        });

        // Assuming you have a way to get scores for the chunks
        const scoredChunks = Array.from(relevantChunks).map(chunkId => ({
            chunkId,
            score: this.chunkMetadata.get(chunkId).relevanceScore // Example of getting the score
        }));

        // Sort and select top 2 chunks
        return scoredChunks.sort((a, b) => b.score - a.score).slice(0, 2);
    }
    
    // Save current graph data to MongoDB
    async saveToDb() {
        try {
            if (!this.documentId) {
                logger.error('Cannot save graph data: No document ID specified');
                return false;
            }
            
            // Convert Map structures to arrays for MongoDB storage
            const chunksArray = Array.from(this.chunks.entries()).map(([chunkId, text]) => {
                const metadata = this.chunkMetadata.get(chunkId) || {};
                return {
                    chunkId,
                    text,
                    metadata
                };
            });
            
            const nodesArray = Array.from(this.nodes.entries()).map(([entity, data]) => {
                return {
                    entity,
                    type: data.type,
                    metadata: data.metadata,
                    connectedChunks: Array.from(data.connectedChunks),
                    relationships: Array.from(data.relationships)
                };
            });
            
            const relationshipsArray = Array.from(this.relationships.entries()).map(([relationKey, data]) => {
                return {
                    relationKey,
                    source: data.source,
                    target: data.target,
                    type: data.type,
                    chunkId: data.chunkId
                };
            });
            
            // Create or update graph data document
            const graphData = {
                documentId: this.documentId,
                chunks: chunksArray,
                nodes: nodesArray,
                relationships: relationshipsArray,
                updatedAt: new Date()
            };
            
            // Use findOneAndUpdate with upsert to create or update
            await GraphData.findOneAndUpdate(
                { documentId: this.documentId },
                graphData,
                { upsert: true, new: true }
            );
            
            logger.info(`Successfully saved graph data for document ${this.documentId}`);
            return true;
        } catch (error) {
            logger.error(`Error saving graph data for document ${this.documentId}:`, error);
            return false;
        }
    }
    
    // Clear all data in the graph
    clear() {
        this.nodes.clear();
        this.edges.clear();
        this.chunks.clear();
        this.relationships.clear();
        this.chunkMetadata.clear();
        this.isLoaded = false;
    }
    
    // Add a chunk with metadata
    addChunkWithMetadata(chunkId, text, metadata = {}) {
        // Format metadata according to BusinessGPT requirements
        const formattedMetadata = {
            documentName: metadata.documentName || 'Unknown',
            documentId: metadata.documentId || this.documentId || metadata.documentName || 'Unknown',
            pageNumber: `${metadata.pageNumber || 1}/${metadata.totalPages || 1}`,
            section: metadata.section || 'Unknown',
            relevanceScore: metadata.relevanceScore || 0,
            createdAt: metadata.createdAt || new Date().toISOString(),
            entities: metadata.entities || [],
            ...metadata
        };

        // Store in local graph
        this.chunks.set(chunkId, text);
        this.chunkMetadata.set(chunkId, formattedMetadata);

        // Store in temporary state for the current session
        const tempChunk = {
            id: chunkId,
            text: text,
            metadata: formattedMetadata,
            embedding: metadata.embedding || null,
            entities: formattedMetadata.entities
        };

        // Update or add to temporary chunks
        const existingIndex = this.tempState.chunks.findIndex(c => c.id === chunkId);
        if (existingIndex >= 0) {
            this.tempState.chunks[existingIndex] = tempChunk;
        } else {
            this.tempState.chunks.push(tempChunk);
        }

        logger.debug(`Added chunk ${chunkId} with metadata`, { metadata: formattedMetadata });
        return this;
    }

    // Get chunk metadata
    getChunkMetadata(chunkId) {
        return this.chunkMetadata.get(chunkId) || {};
    }

    // Get all chunks with their metadata
    getAllChunksWithMetadata() {
        return Array.from(this.chunks.entries()).map(([chunkId, text]) => ({
            chunkId,
            text,
            metadata: this.getChunkMetadata(chunkId)
        }));
    }
    
    // Add clear method to reset the graph
    clear() {
        logger.info('Clearing knowledge graph data');
        this.nodes.clear();
        this.edges.clear();
        this.chunks.clear();
        this.relationships.clear();
        this.chunkMetadata.clear();
        // Also clear global data if it exists
        if (global.graphData) {
            delete global.graphData;
        }
        logger.info('Knowledge graph data cleared');
        return true;
    }
}

// Create a graph instance without a document ID initially
let graph = new KnowledgeGraph();

// MongoDB connection is handled by the main application
const dbName = process.env.MONGODB_DB_NAME || 'graphrag';
const url = process.env.MONGODB_URI || 'mongodb://localhost:27017';

// Log MongoDB connection details (without sensitive information)
logger.info(`MongoDB connection configured with database: ${dbName}`);

// Add the saveGraphToDb function
async function saveGraphToDb() {
    try {
        logger.info('Connecting to MongoDB...');
        const client = await MongoClient.connect(url);
        const db = client.db(dbName);

        // Convert Map to Array for storage, properly handling Sets
        const nodesArray = Array.from(graph.nodes.entries()).map(([key, value]) => ({
            entity: key,
            type: value.type,
            metadata: value.metadata,
            connectedChunks: Array.from(value.connectedChunks),  // Convert Set to Array
            relationships: Array.from(value.relationships)        // Convert Set to Array
        }));

        const chunksArray = Array.from(graph.chunks.entries()).map(([key, value]) => ({
            chunkId: key,
            text: value
        }));

        const relationshipsArray = Array.from(graph.relationships.entries()).map(([key, value]) => ({
            relationKey: key,
            ...value
        }));

        // Store in MongoDB
        logger.info('Storing data in MongoDB...');
        await db.collection('nodes').deleteMany({});
        await db.collection('chunks').deleteMany({});
        await db.collection('relationships').deleteMany({});

        if (nodesArray.length > 0) {
            await db.collection('nodes').insertMany(nodesArray);
        }
        if (chunksArray.length > 0) {
            await db.collection('chunks').insertMany(chunksArray);
        }
        if (relationshipsArray.length > 0) {
            await db.collection('relationships').insertMany(relationshipsArray);
        }

        // Also save to file for the test-query endpoint
        logger.info('Saving graph data to file...');
        
        // Ensure data directory exists
        const dataDir = path.join(__dirname, '../data');
        logger.info(`Data directory path: ${dataDir}`);
        try {
            await fsPromises.access(dataDir);
            logger.info('Data directory exists');
        } catch (error) {
            logger.info(`Data directory does not exist, creating it: ${error.message}`);
            await fsPromises.mkdir(dataDir, { recursive: true });
            logger.info('Data directory created successfully');
        }
        
        // Prepare data for file storage
        const fileData = {
            nodes: nodesArray,
            chunks: chunksArray.map(chunk => ({
                text: chunk.text,
                // Add dummy embedding if needed for test-query
                embedding: new Array(1536).fill(0).map(() => Math.random() * 2 - 1),
                entities: nodesArray
                    .filter(node => node.connectedChunks.includes(chunk.chunkId))
                    .map(node => node.entity)
            })),
            links: relationshipsArray
        };
        
        // Save to file
        const graphDataPath = path.join(dataDir, 'graph.json');
        logger.info(`Saving graph data to file: ${graphDataPath}`);
        try {
            await fsPromises.writeFile(graphDataPath, JSON.stringify(fileData, null, 2));
            logger.info(`Graph data successfully written to file: ${graphDataPath}`);
            
            // Verify file was created
            const stats = await fsPromises.stat(graphDataPath);
            logger.info(`File size: ${stats.size} bytes`);
        } catch (error) {
            logger.error(`Error writing graph data to file: ${error.message}`);
            throw error; // Re-throw to be caught by the outer try-catch
        }
        
        // Store in global variable for immediate use
        global.graphData = fileData;
        logger.info('Graph data stored in global variable');
        
        logger.info('Graph saved successfully to MongoDB and file');
        await client.close();
        return true;
    } catch (error) {
        logger.error('Error saving to database:', error);
        return false;
    }
}

// Update the loadGraphFromDb function with better error logging
async function loadGraphFromDb() {
    let client;
    try {
        console.log('Connecting to MongoDB...');
        client = await MongoClient.connect(url);
        const db = client.db(dbName);

        console.log('Loading data from collections...');
        // Load from MongoDB
        const nodes = await db.collection('nodes').find({}).toArray();
        console.log(`Found ${nodes.length} nodes`);
        
        const chunks = await db.collection('chunks').find({}).toArray();
        console.log(`Found ${chunks.length} chunks`);
        
        const relationships = await db.collection('relationships').find({}).toArray();
        console.log(`Found ${relationships.length} relationships`);

        // Clear current graph
        console.log('Clearing current graph...');
        graph.nodes.clear();
        graph.chunks.clear();
        graph.relationships.clear();

        console.log('Restoring nodes...');
        // Restore Maps with proper Set objects
        nodes.forEach(node => {
            const { entity, connectedChunks, relationships, ...rest } = node;
            graph.nodes.set(entity, {
                ...rest,
                connectedChunks: new Set(Array.isArray(connectedChunks) ? connectedChunks : []),
                relationships: new Set(Array.isArray(relationships) ? relationships : [])
            });
        });

        console.log('Restoring chunks...');
        chunks.forEach(chunk => {
            graph.chunks.set(chunk.chunkId, chunk.text);
        });

        console.log('Restoring relationships...');
        relationships.forEach(rel => {
            const { relationKey, ...rest } = rel;
            graph.relationships.set(relationKey, rest);
        });

        console.log('Graph loaded successfully');
        console.log(`Restored: ${graph.nodes.size} nodes, ${graph.chunks.size} chunks, ${graph.relationships.size} relationships`);
        
        if (client) {
            await client.close();
        }
        return true;
    } catch (error) {
        console.error('Detailed error loading from database:', error);
        if (client) {
            await client.close();
        }
        return false;
    }
}

async function extractEntitiesWithOpenAI(text) {
    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                {
                    role: "system",
                    content: "You are a precise entity and relationship extraction system. Respond only with the requested JSON format."
                },
                {
                    role: "user",
                    content: `
                        Analyze this text and extract:
                        1. Named entities (people, places, organizations, dates)
                        2. Relationships between entities
                        
                        Text: "${text}"
                        
                        Respond in JSON format:
                        {
                            "entities": [{"text": "entity", "type": "PERSON/PLACE/ORG/DATE"}],
                            "relationships": [{"source": "entity1", "relationship": "action", "target": "entity2"}]
                        }`
                }
            ],
            temperature: 0.3
        });

        return JSON.parse(completion.choices[0].message.content);
    } catch (error) {
        console.error('Error extracting entities:', error);
        return { entities: [], relationships: [] };
    }
}

// Process document and build graph
router.post('/process', async (req, res) => {
    try {
        const { chunks } = req.body;
        
        for (let chunkId = 0; chunkId < chunks.length; chunkId++) {
            const chunk = chunks[chunkId];
            graph.chunks.set(chunkId, chunk);

            const { entities, relationships } = await extractEntitiesWithOpenAI(chunk);

            entities.forEach(entity => {
                graph.addNode(entity.text, entity.type);
                graph.addChunkConnection(entity.text, chunkId);
            });

            relationships.forEach(rel => {
                graph.addRelationship(
                    rel.source,
                    rel.relationship,
                    rel.target,
                    chunkId
                );
            });
        }

        res.json({ 
            message: 'Graph created successfully',
            entityCount: graph.nodes.size,
            relationshipCount: graph.relationships.size
        });
    } catch (error) {
        console.error('Error processing document:', error);
        res.status(500).json({ error: 'Failed to process document' });
    }
});

// Update the query route to properly handle node data
router.post('/query', async (req, res) => {
    try {
        const { query } = req.body;
        console.log('Processing query:', query);
        
        // Use new chunk selection with correct reference
        const relevantChunks = await chunkSelection.selectRelevantChunks(query, graph);
        
        // Generate answer using selected chunks
        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                {
                    role: "system",
                    content: "You are a helpful assistant that answers questions based on the provided context."
                },
                {
                    role: "user",
                    content: `
                        Context: ${relevantChunks.map(c => c.text).join('\n\n')}
                        Question: ${query}
                    `
                }
            ],
            temperature: 0.7,
            max_tokens: 500
        });

        const answer = completion.choices[0].message.content;

        res.json({
            answer,
            relevantChunks: relevantChunks.length,
            chunks: relevantChunks.map(c => ({
                text: c.text,
                scores: c.scores
            }))
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Failed to query', details: error.message });
    }
});

// Add this function to split text into smaller chunks
function splitIntoProcessableChunks(text, maxLength = 4000) {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim());
    const chunks = [];
    let currentChunk = '';

    for (const sentence of sentences) {
        if ((currentChunk + sentence).length > maxLength) {
            if (currentChunk) chunks.push(currentChunk.trim());
            currentChunk = sentence;
        } else {
            currentChunk += ' ' + sentence;
        }
    }
    if (currentChunk) chunks.push(currentChunk.trim());
    return chunks;
}

// Update the process-discover route
router.post('/process-discover', async (req, res) => {
    try {
        // Clear existing graph data
        graph.clear();
        
        // Use consistent document ID and metadata
        const documentId = '1741651980512';
        const documentMetadata = {
            documentName: 'discover.pdf',
            documentId: documentId,
            type: 'application/pdf',
            uploadDate: new Date().toISOString()
        };
        
        logger.info('Starting discover.pdf processing...', { documentId, metadata: documentMetadata });
        const filePath = path.join(__dirname, '..', 'discover.pdf');
        const dataBuffer = await fsPromises.readFile(filePath);
        
        // Parse PDF
        console.log('Parsing PDF...');
        const data = await pdf(dataBuffer);
        const content = data.text;
        
        // Split into manageable chunks
        console.log('Splitting into chunks...');
        const chunks = splitIntoProcessableChunks(content);
        console.log(`Created ${chunks.length} chunks`);
        
        // Clear existing graph
        graph.nodes.clear();
        graph.chunks.clear();
        graph.relationships.clear();
        
        // Process each chunk
        for (let chunkId = 0; chunkId < chunks.length; chunkId++) {
            console.log(`Processing chunk ${chunkId + 1}/${chunks.length}`);
            const chunk = chunks[chunkId];
            
            if (!chunk.trim()) {
                console.log(`Skipping empty chunk ${chunkId}`);
                continue;
            }

            graph.chunks.set(chunkId, chunk);

            try {
                const { entities, relationships } = await extractEntitiesWithOpenAI(chunk);               console.log(`Found ${entities.length} entities and ${relationships.length} relationships in chunk ${chunkId}`);

                entities.forEach(entity => {
                    graph.addNode(entity.text, entity.type);
                    graph.addChunkConnection(entity.text, chunkId);
                });

                relationships.forEach(rel => {
                    graph.addRelationship(
                        rel.source,
                        rel.relationship,
                        rel.target,
                        chunkId
                    );
                });
            } catch (error) {
                console.warn(`Warning: Skipping chunk ${chunkId} due to error:`, error.message);
                continue;
            }
        }

        // Log final stats
        console.log('Processing complete!');
        console.log(`Total entities: ${graph.nodes.size}`);
        console.log(`Total relationships: ${graph.relationships.size}`);
        console.log(`Total chunks: ${graph.chunks.size}`);

        res.json({ 
            message: 'discover.pdf processed successfully',
            entityCount: graph.nodes.size,
            relationshipCount: graph.relationships.size,
            chunks: graph.chunks.size
        });
    } catch (error) {
        console.error('Error processing discover.pdf:', error);
        res.status(500).json({ error: 'Failed to process discover.pdf' });
    }
});

// Update the save endpoint with better error logging
router.post('/save', async (req, res) => {
    try {
        console.log('Starting graph save...');
        console.log(`Saving ${graph.nodes.size} nodes, ${graph.relationships.size} relationships, ${graph.chunks.size} chunks`);
        
        const saved = await saveGraphToDb();
        
        if (saved) {
            console.log('Graph saved successfully to MongoDB');
            res.json({ 
                message: 'Graph saved successfully',
                stats: {
                    nodes: graph.nodes.size,
                    chunks: graph.chunks.size,
                    relationships: graph.relationships.size
                }
            });
        } else {
            console.error('Failed to save graph');
            res.status(500).json({ error: 'Failed to save graph' });
        }
    } catch (error) {
        console.error('Error saving graph:', error);
        res.status(500).json({ error: 'Failed to save graph', details: error.message });
    }
});

// Update the load endpoint with better error handling
router.post('/load', async (req, res) => {
    try {
        console.log('Starting graph load...');
        const loaded = await loadGraphFromDb();
        if (loaded) {
            res.json({ 
                message: 'Graph loaded successfully',
                stats: {
                    nodes: graph.nodes.size,
                    chunks: graph.chunks.size,
                    relationships: graph.relationships.size
                }
            });
        } else {
            res.status(500).json({ error: 'Failed to load graph' });
        }
    } catch (error) {
        console.error('Error in load endpoint:', error);
        res.status(500).json({ error: 'Failed to load graph', details: error.message });
    }
});

// Add this new route for testing with test.txt
router.post('/process-test', async (req, res) => {
    try {
        logger.info('Starting test.txt processing...');
        // Clear existing graph data
        graph.clear();
        
        const filePath = path.join(__dirname, '..', 'test.txt');
        const content = await fsPromises.readFile(filePath, 'utf8');
        
        // Split into chunks
        logger.info('Splitting into chunks...');
        const chunks = content.split('\n\n').filter(chunk => chunk.trim());
        logger.info(`Created ${chunks.length} chunks`);
        
        // Process each chunk through our graph
        for (let chunkId = 0; chunkId < chunks.length; chunkId++) {
            logger.info(`Processing chunk ${chunkId + 1}/${chunks.length}`);
            const chunk = chunks[chunkId];
            
            // Skip empty chunks
            if (!chunk.trim()) {
                logger.info(`Skipping empty chunk ${chunkId}`);
                continue;
            }

            graph.chunks.set(chunkId, chunk);

            try {
                const { entities, relationships } = await extractEntitiesWithOpenAI(chunk);               logger.info(`Found ${entities.length} entities and ${relationships.length} relationships in chunk ${chunkId}`);

                entities.forEach(entity => {
                    graph.addNode(entity.text, entity.type);
                    graph.addChunkConnection(entity.text, chunkId);
                });

                relationships.forEach(rel => {
                    graph.addRelationship(
                        rel.source,
                        rel.relationship,
                        rel.target,
                        chunkId
                    );
                });
            } catch (error) {
                logger.warn(`Warning: Skipping chunk ${chunkId} due to error:`, error.message);
                continue;
            }
        }

        // Log final stats
        logger.info('Processing complete!');
        logger.info(`Total entities: ${graph.nodes.size}`);
        logger.info(`Total relationships: ${graph.relationships.size}`);
        logger.info(`Total chunks: ${graph.chunks.size}`);
        
        // Save graph to database and file
        logger.info('Saving graph to database and file...');
        const saveResult = await saveGraphToDb();
        
        if (!saveResult) {
            logger.error('Failed to save graph to database');
            return res.status(500).json({ error: 'Failed to save graph to database' });
        }
        
        // Create a direct backup of the graph data as a fallback
        try {
            // Ensure data directory exists
            const dataDir = path.join(__dirname, '../data');
            logger.info(`Ensuring data directory exists at: ${dataDir}`);
            try {
                await fsPromises.access(dataDir);
                logger.info('Data directory exists');
            } catch (dirError) {
                logger.info(`Creating data directory: ${dirError.message}`);
                await fsPromises.mkdir(dataDir, { recursive: true });
                logger.info('Data directory created successfully');
            }
            
            // Create a serializable version of the graph for direct file save
            const serializedGraph = {
                nodes: Array.from(graph.nodes.entries()).map(([id, node]) => ({
                    id,
                    type: node.type,
                    chunks: Array.from(node.chunks || [])
                })),
                relationships: Array.from(graph.relationships.entries()).map(([id, rel]) => ({
                    id,
                    source: rel.source,
                    type: rel.type,
                    target: rel.target,
                    chunks: Array.from(rel.chunks || [])
                })),
                chunks: Array.from(graph.chunks.entries()).map(([id, text]) => ({
                    id: parseInt(id),
                    text,
                    embedding: new Array(1536).fill(0).map(() => Math.random() * 2 - 1),
                    entities: []
                }))
            };
            
            // Save directly to file
            const graphDataPath = path.join(dataDir, 'graph.json');
            logger.info(`Directly saving graph data to: ${graphDataPath}`);
            await fsPromises.writeFile(graphDataPath, JSON.stringify(serializedGraph, null, 2));
            
            // Store in global variable for immediate use
            global.graphData = serializedGraph;
            logger.info('Graph data stored in global variable');
            
            // Verify that the graph data file exists
            const stats = await fsPromises.stat(graphDataPath);
            logger.info(`Graph data file created successfully: ${stats.size} bytes`);
        } catch (error) {
            logger.error('Error saving graph data directly to file:', error);
            // Continue despite error - we'll log but not fail the request
        }

        res.json({ 
            message: 'test.txt processed successfully',
            entityCount: graph.nodes.size,
            relationshipCount: graph.relationships.size,
            chunks: graph.chunks.size
        });
    } catch (error) {
        logger.error('Error processing test.txt:', error);
        res.status(500).json({ 
            error: 'Failed to process test.txt',
            details: error.message
        });
    }
});

// Document management endpoints

// Get all documents with graph data status
router.get('/documents', async (req, res) => {
    try {
        logger.info('Fetching graph documents');
        
        // Get all documents from MongoDB using the model
        const documents = await GraphDocument.find({}).sort({ uploadDate: -1 });
        
        // Get document IDs that have graph data
        const graphDataDocs = await GraphData.distinct('documentId');
        
        // Add hasGraphData flag to each document
        const documentsWithStatus = documents.map(doc => {
            const docObj = doc.toObject();
            docObj.hasGraphData = graphDataDocs.includes(doc.documentId);
            return docObj;
        });
        
        res.json({ documents: documentsWithStatus });
    } catch (error) {
        logger.error('Error fetching graph documents:', error);
        res.status(500).json({ 
            error: 'Failed to fetch documents',
            details: error.message
        });
    }
});

// Upload and process a document
// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, '../uploads');
        // Create directory if it doesn't exist
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        // Generate unique filename
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB limit
    fileFilter: function (req, file, cb) {
        // Accept PDF and text files
        if (file.mimetype === 'application/pdf' || file.mimetype === 'text/plain' || file.originalname.endsWith('.txt')) {
            cb(null, true);
        } else {
            cb(new Error('Only PDF and text files are allowed'), false);
        }
    }
});

router.post('/documents', upload.single('file'), async (req, res) => {
    try {
        logger.info('Uploading new document for Graph RAG');
        
        // Create a new graph instance for this document
        graph = new KnowledgeGraph();
        
        // Clear existing graph data
        graph.clear();
        
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        
        // Generate unique document ID
        const documentId = Date.now().toString();
        const fileName = req.file.originalname;
        const filePath = req.file.path;
        
        // Read file content
        const fileBuffer = fs.readFileSync(filePath);
        let textContent = '';
        let pageCount = 0;
        
        // Extract text and metadata from PDF
        if (req.file.mimetype === 'application/pdf') {
            try {
                const pdfData = await pdf(fileBuffer);
                textContent = pdfData.text;
                pageCount = pdfData.numpages;
            } catch (pdfError) {
                logger.error('Error processing PDF:', pdfError);
                return res.status(400).json({ error: 'Invalid PDF file' });
            }
        } else {
            textContent = fileBuffer.toString('utf-8');
            pageCount = Math.ceil(textContent.length / 3000); // Approximate pages
        }
        
        // Process content into chunks
        const chunks = splitIntoProcessableChunks(textContent);
        
        // Parse and validate metadata
        const userMetadata = req.body.metadata ? JSON.parse(req.body.metadata) : {};
        
        // Create structured metadata according to our requirements
        const documentMetadata = {
            documentId,
            documentName: fileName,
            type: req.file.mimetype,
            pageCount,
            sections: userMetadata.sections || ['Introduction', 'Analysis', 'Recommendations'],
            uploadDate: new Date().toISOString(),
            chunkCount: chunks.length,
            status: 'processing'
        };
        
        // Store in MongoDB with structured metadata using the model
        const graphDocument = new GraphDocument({
            documentId,
            documentName: fileName,
            type: req.file.mimetype,
            uploadDate: new Date(),
            status: 'processing',
            pageCount,
            sections: documentMetadata.sections
        });
        
        await graphDocument.save();
        
        // Set the document ID for the graph
        graph.documentId = documentId;
        
        // Process document in background with structured metadata
        processDocumentForGraph(documentId, textContent, documentMetadata)
            .then(async () => {
                // Save the graph data to MongoDB after processing
                await graph.saveToDb();
                
                // Update document status to completed
                await GraphDocument.findOneAndUpdate(
                    { documentId },
                    { 
                        $set: { 
                            status: 'completed',
                            processingStats: {
                                entityCount: graph.nodes.size,
                                relationshipCount: graph.relationships.size,
                                chunkCount: graph.chunks.size,
                                processingTime: Date.now() - new Date(documentMetadata.uploadDate).getTime()
                            }
                        } 
                    }
                );
            })
            .catch(async (err) => {
                logger.error(`Background processing failed for document ${documentId}:`, err);
                
                // Update document status to error
                await GraphDocument.findOneAndUpdate(
                    { documentId },
                    { 
                        $set: { 
                            status: 'error',
                            error: err.message
                        } 
                    }
                );
            });
        
        // Return success with metadata
        res.status(201).json({ 
            success: true, 
            documentId,
            message: 'Document uploaded successfully',
            metadata: {
                documentName: fileName,
                type: req.file.mimetype,
                pageCount,
                sections: documentMetadata.sections
            }
        });
        
    } catch (error) {
        logger.error('Error uploading document:', error);
        res.status(500).json({ 
            error: 'Failed to upload document',
            details: error.message
        });
    }
});

// Delete a document
router.delete('/documents/:documentId', async (req, res) => {
    try {
        const { documentId } = req.params;
        
        // Delete document from GraphDocument collection
        const deletedDoc = await GraphDocument.findOneAndDelete({ documentId });
        
        if (!deletedDoc) {
            return res.status(404).json({ error: `Document ${documentId} not found` });
        }
        
        // Delete associated graph data
        await GraphData.findOneAndDelete({ documentId });
        
        // Clear the current graph if it's the same document
        if (graph.documentId === documentId) {
            graph.clear();
        }
        logger.info(`Deleting document ${documentId}`);
        
        // Connect to MongoDB
        const client = new MongoClient(url);
        await client.connect();
        const db = client.db(dbName);
        const collection = db.collection('graphDocuments');
        
        // Delete the document
        const result = await collection.deleteOne({ documentId });
        
        // Close the connection
        await client.close();
        
        if (result.deletedCount === 0) {
            return res.status(404).json({ error: 'Document not found' });
        }
        
        res.json({ 
            success: true, 
            message: 'Document deleted successfully'
        });
        
    } catch (error) {
        logger.error(`Error deleting document ${req.params.documentId}:`, error);
        res.status(500).json({ 
            error: 'Failed to delete document',
            details: error.message
        });
    }
});

// Reprocess a document
router.post('/documents/:documentId/reprocess', async (req, res) => {
    try {
        const { documentId } = req.params;
        logger.info(`Reprocessing document ${documentId}`);
        
        // Connect to MongoDB
        const client = new MongoClient(url);
        await client.connect();
        const db = client.db(dbName);
        const collection = db.collection('graphDocuments');
        
        // Get the document
        const document = await collection.findOne({ documentId });
        
        if (!document) {
            await client.close();
            return res.status(404).json({ error: 'Document not found' });
        }
        
        // Update status
        await collection.updateOne(
            { documentId },
            { $set: { status: 'processing' } }
        );
        
        // Close the connection
        await client.close();
        
        // Return immediate response
        res.json({ 
            success: true, 
            message: 'Document reprocessing started'
        });
        
        // Process document in the background
        processDocumentForGraph(documentId, document.content, document.metadata).catch(err => {
            logger.error(`Background reprocessing failed for document ${documentId}:`, err);
        });
        
    } catch (error) {
        logger.error(`Error reprocessing document ${req.params.documentId}:`, error);
        res.status(500).json({ 
            error: 'Failed to reprocess document',
            details: error.message
        });
    }
});

// Process status endpoint
router.get('/process-status/:jobId', async (req, res) => {
    try {
        const { jobId } = req.params;
        logger.info(`Checking process status for job ${jobId}`);
        
        // Connect to MongoDB
        const client = new MongoClient(url);
        await client.connect();
        const db = client.db(dbName);
        const collection = db.collection('graphDocuments');
        
        // Get the document
        const document = await collection.findOne({ documentId: jobId });
        
        // Close the connection
        await client.close();
        
        if (!document) {
            return res.status(404).json({ error: 'Job not found' });
        }
        
        res.json({
            jobId,
            status: document.status,
            progress: document.processingProgress || 0,
            error: document.error || null,
            completedAt: document.completedAt || null
        });
        
    } catch (error) {
        logger.error(`Error checking process status for job ${req.params.jobId}:`, error);
        res.status(500).json({ 
            error: 'Failed to check process status',
            details: error.message
        });
    }
});

// Add this new route to check database contents
router.get('/status', async (req, res) => {
    try {
        const client = await MongoClient.connect(url);
        const db = client.db(dbName);

        const nodes = await db.collection('nodes').find({}).toArray();
        const chunks = await db.collection('chunks').find({}).toArray();
        const relationships = await db.collection('relationships').find({}).toArray();

        await client.close();

        res.json({
            database: {
                nodes: nodes.length,
                chunks: chunks.length,
                relationships: relationships.length
            },
            memory: {
                nodes: graph.nodes.size,
                chunks: graph.chunks.size,
                relationships: graph.relationships.size
            }
        });
    } catch (error) {
        console.error('Error checking status:', error);
        res.status(500).json({ error: 'Failed to check status' });
    }
});

// Update the process route for 123.pdf
router.post('/process-123', async (req, res) => {
    try {
        console.log('Starting 123.pdf processing...');
        const filePath = path.join(__dirname, '..', '123.pdf');
        const dataBuffer = await fsPromises.readFile(filePath);

        // Parse PDF
        console.log('Parsing PDF...');
        const data = await pdf(dataBuffer);
        const content = data.text;

        // Split into manageable chunks
        console.log('Splitting into chunks...');
        const chunks = splitIntoProcessableChunks(content);
        console.log(`Created ${chunks.length} chunks`);

        // Clear existing graph
        graph.nodes.clear();
        graph.chunks.clear();
        graph.relationships.clear();

        // Process each chunk
        for (let chunkId = 0; chunkId < chunks.length; chunkId++) {
            console.log(`Processing chunk ${chunkId + 1}/${chunks.length}`);
            const chunk = chunks[chunkId];

            if (!chunk.trim()) {
                console.log(`Skipping empty chunk ${chunkId}`);
                continue;
            }

            graph.chunks.set(chunkId, chunk);

            try {
                const { entities, relationships } = await extractEntitiesWithOpenAI(chunk);               console.log(`Found ${entities.length} entities and ${relationships.length} relationships in chunk ${chunkId}`);

                entities.forEach(entity => {
                    graph.addNode(entity.text, entity.type);
                    graph.addChunkConnection(entity.text, chunkId);
                });

                relationships.forEach(rel => {
                    graph.addRelationship(
                        rel.source,
                        rel.relationship,
                        rel.target,
                        chunkId
                    );
                });
            } catch (error) {
                console.warn(`Warning: Skipping chunk ${chunkId} due to error:`, error.message);
                continue;
            }
        }

        // Log final stats
        console.log('Processing complete!');
        console.log(`Total entities: ${graph.nodes.size}`);
        console.log(`Total relationships: ${graph.relationships.size}`);
        console.log(`Total chunks: ${graph.chunks.size}`);

        res.json({ 
            message: '123.pdf processed successfully',
            entityCount: graph.nodes.size,
            relationshipCount: graph.relationships.size,
            chunks: graph.chunks.size
        });
    } catch (error) {
        console.error('Error processing 123.pdf:', error);
        res.status(500).json({ error: 'Failed to process 123.pdf' });
    }
});

// Update the process route for lch.pdf
router.post('/process-lch', async (req, res) => {
    try {
        console.log('Starting lch.pdf processing...');
        const filePath = path.join(__dirname, '..', 'lch.pdf');
        const dataBuffer = await fsPromises.readFile(filePath);

        // Parse PDF
        console.log('Parsing PDF...');
        const data = await pdf(dataBuffer);
        const content = data.text;

        // Split into manageable chunks
        console.log('Splitting into chunks...');
        const chunks = splitIntoProcessableChunks(content);
        console.log(`Created ${chunks.length} chunks`);

        // Clear existing graph
        graph.nodes.clear();
        graph.chunks.clear();
        graph.relationships.clear();

        // Process each chunk
        for (let chunkId = 0; chunkId < chunks.length; chunkId++) {
            console.log(`Processing chunk ${chunkId + 1}/${chunks.length}`);
            const chunk = chunks[chunkId];

            if (!chunk.trim()) {
                console.log(`Skipping empty chunk ${chunkId}`);
                continue;
            }

            graph.chunks.set(chunkId, chunk);

            try {
                const { entities, relationships } = await extractEntitiesWithOpenAI(chunk);               console.log(`Found ${entities.length} entities and ${relationships.length} relationships in chunk ${chunkId}`);

                entities.forEach(entity => {
                    graph.addNode(entity.text, entity.type);
                    graph.addChunkConnection(entity.text, chunkId);
                });

                relationships.forEach(rel => {
                    graph.addRelationship(
                        rel.source,
                        rel.relationship,
                        rel.target,
                        chunkId
                    );
                });
            } catch (error) {
                console.warn(`Warning: Skipping chunk ${chunkId} due to error:`, error.message);
                continue;
            }
        }

        // Log final stats
        console.log('Processing complete!');
        console.log(`Total entities: ${graph.nodes.size}`);
        console.log(`Total relationships: ${graph.relationships.size}`);
        console.log(`Total chunks: ${graph.chunks.size}`);

        res.json({ 
            message: 'lch.pdf processed successfully',
            entityCount: graph.nodes.size,
            relationshipCount: graph.relationships.size,
            chunks: graph.chunks.size
        });
    } catch (error) {
        console.error('Error processing lch.pdf:', error);
        res.status(500).json({ error: 'Failed to process lch.pdf' });
    }
});

// Add clear route to delete all data
router.post('/clear', async (req, res) => {
    try {
        console.log('Clearing all data...');
        
        // Clear memory
        graph.nodes.clear();
        graph.chunks.clear();
        graph.relationships.clear();
        
        // Clear MongoDB
        const client = await MongoClient.connect(url);
        const db = client.db(dbName);

        await db.collection('nodes').deleteMany({});
        await db.collection('chunks').deleteMany({});
        await db.collection('relationships').deleteMany({});

        await client.close();

        console.log('All data cleared successfully');
        res.json({ 
            message: 'All data cleared successfully',
            memory: {
                nodes: graph.nodes.size,
                chunks: graph.chunks.size,
                relationships: graph.relationships.size
            }
        });
    } catch (error) {
        console.error('Error clearing data:', error);
        res.status(500).json({ error: 'Failed to clear data' });
    }
});

// Add HTML query endpoint with scoring details
router.post('/query-html', async (req, res) => {
    try {
        const { query } = req.body;
        
        // Get relevant chunks with scores
        const relevantChunks = await chunkSelection.selectRelevantChunks(query, graph);
        
        // Get concise answer
        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                {
                    role: "system",
                    content: "Provide answers in bullet points, maximum 50 words total."
                },
                {
                    role: "user",
                    content: `Context: ${relevantChunks.map(c => c.text).join('\n\n')}\nQuestion: ${query}`
                }
            ],
            temperature: 0.7,
            max_tokens: 150
        });

        const answer = completion.choices[0].message.content;

        // Extract only relevant entities and relationships from chunks
        const relevantEntities = new Set();
        const relevantRelationships = new Map();

        // First, get entities from chunks
        relevantChunks.forEach(chunk => {
            Array.from(graph.nodes.entries())
                .filter(([_, nodeData]) => nodeData.connectedChunks.has(chunk.chunkId))
                .forEach(([entity, nodeData]) => {
                    relevantEntities.add(entity);
                });
        });

        // Then, get relationships between relevant entities
        relevantEntities.forEach(entity => {
            const nodeData = graph.nodes.get(entity);
            if (nodeData && nodeData.relationships) {
                nodeData.relationships.forEach(rel => {
                    const [relationType, targetEntity] = rel.split('->').map(s => s.trim());
                    if (relevantEntities.has(targetEntity)) {
                        if (!relevantRelationships.has(entity)) {
                            relevantRelationships.set(entity, new Set());
                        }
                        relevantRelationships.get(entity).add({
                            type: relationType,
                            target: targetEntity
                        });
                    }
                });
            }
        });

        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>LCH Query Results</title>
            <script src="https://d3js.org/d3.v7.min.js"></script>
            <style>
                body {
                    font-family: 'Segoe UI', Arial, sans-serif;
                    max-width: 1000px;
                    margin: 40px auto;
                    padding: 30px;
                    line-height: 1.8;
                    color: #333;
                    background-color: #f8f9fa;
                }
                .container {
                    background: white;
                    padding: 30px;
                    border-radius: 10px;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                }
                .section {
                    margin-bottom: 30px;
                    padding: 20px;
                    border-radius: 8px;
                    background: #fff;
                    border: 1px solid #dee2e6;
                }
                .query {
                    background: #e9ecef;
                    border-left: 5px solid #007bff;
                }
                .answer {
                    background: #f1f8ff;
                }
                .entities {
                    background: #f3f0ff;
                }
                .entities-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
                    gap: 10px;
                    margin-top: 10px;
                }
                .entity-item {
                    padding: 5px 10px;
                    background: #e9ecef;
                    border-radius: 4px;
                    font-size: 0.9em;
                }
                .chunk {
                    background: white;
                    padding: 15px;
                    margin: 10px 0;
                    border-radius: 6px;
                    border: 1px solid #e9ecef;
                }
                h2 {
                    color: #212529;
                    margin: 0 0 15px;
                    font-size: 1.3em;
                }
                .scores {
                    font-size: 0.9em;
                    color: #666;
                    margin-bottom: 10px;
                }
                .graph-section {
                    background: #f0f7ff;
                    padding: 25px;
                    border-radius: 8px;
                    margin: 20px 0;
                    border: 1px solid #cce4ff;
                }
                .entity-card {
                    background: white;
                    padding: 20px;
                    margin: 15px 0;
                    border-radius: 8px;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
                }
                .entity-name {
                    font-weight: bold;
                    color: #0056b3;
                    font-size: 1.1em;
                    padding-bottom: 10px;
                    border-bottom: 2px solid #e9ecef;
                }
                .relationship-container {
                    margin-top: 15px;
                }
                .relationship-item {
                    background: #e9ecef;
                    padding: 8px 15px;
                    margin: 5px;
                    border-radius: 20px;
                    display: inline-block;
                    color: #495057;
                }
                .relationship-arrow {
                    color: #6c757d;
                    margin: 0 5px;
                }
                .relevance-stats {
                    background: #e9ecef;
                    padding: 15px;
                    border-radius: 8px;
                    margin-bottom: 20px;
                    font-size: 0.95em;
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 10px;
                }
                .stat-item {
                    padding: 10px;
                    background: white;
                    border-radius: 6px;
                }
                #knowledge-graph {
                    width: 100%;
                    height: 500px;
                    background: #f8f9fa;
                    border: 1px solid #dee2e6;
                    border-radius: 8px;
                    margin: 20px 0;
                }
                .node {
                    fill: #fff;
                    stroke: #007bff;
                    stroke-width: 2px;
                }
                .node text {
                    font-size: 12px;
                    fill: #333;
                }
                .link {
                    stroke: #999;
                    stroke-opacity: 0.6;
                    stroke-width: 1px;
                }
                .link-label {
                    font-size: 10px;
                    fill: #666;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="section query">
                    <h2>📝 Query</h2>
                    ${query}
                </div>
                
                <div class="section answer">
                    <h2>💡 Concise Answer</h2>
                    ${answer}
                </div>

                <div class="graph-section">
                    <h2>🎯 Relevant Entities and Relationships</h2>
                    <div class="relevance-stats">
                        <div class="stat-item">
                            <strong>Relevant Entities:</strong> ${relevantEntities.size}
                        </div>
                        <div class="stat-item">
                            <strong>Relevant Relationships:</strong> 
                            ${Array.from(relevantRelationships.values())
                                .reduce((acc, rels) => acc + rels.size, 0)}
                        </div>
                    </div>
                    
                    ${Array.from(relevantEntities).map(entity => `
                        <div class="entity-card">
                            <div class="entity-name">🔹 ${entity}</div>
                            ${relevantRelationships.has(entity) ? `
                                <div class="relationship-container">
                                    ${Array.from(relevantRelationships.get(entity)).map(rel => `
                                        <span class="relationship-item">
                                            ${entity} 
                                            <span class="relationship-arrow">→</span> 
                                            ${rel.type} 
                                            <span class="relationship-arrow">→</span> 
                                            ${rel.target}
                                        </span>
                                    `).join('')}
                                </div>
                            ` : '<div class="relationship-container">No direct relationships</div>'}
                        </div>
                    `).join('')}
                </div>
                
                <div class="section">
                    <h2>📚 Source Chunks</h2>
                    ${relevantChunks.map((chunk, i) => `
                        <div class="chunk">
                            <div class="scores">
                                <strong>Chunk ${i + 1}</strong> (Score: ${chunk.totalScore.toFixed(3)})<br>
                                Semantic: ${chunk.scores.semantic.toFixed(3)} | 
                                Entity: ${chunk.scores.entityScore.toFixed(3)} | 
                                Relationship: ${chunk.scores.relationshipScore.toFixed(3)} | 
                                Position: ${chunk.scores.positionScore.toFixed(3)}
                            </div>
                            ${chunk.text}
                        </div>
                    `).join('')}
                </div>

                <div class="graph-section">
                    <h2>🕸️ Knowledge Graph Visualization</h2>
                    <div id="knowledge-graph"></div>
                </div>
            </div>

            <script>
                // Prepare graph data
                const graphData = {
                    nodes: Array.from(${JSON.stringify(Array.from(relevantEntities))}).map(id => ({
                        id,
                        group: 1
                    })),
                    links: Array.from(${JSON.stringify(Array.from(relevantRelationships))})
                        .flatMap(([source, relations]) => 
                            Array.from(relations).map(rel => ({
                                source,
                                target: rel.target,
                                label: rel.type
                            }))
                        )
                };

                const width = document.getElementById('knowledge-graph').clientWidth;
                const height = 500;

                const simulation = d3.forceSimulation(graphData.nodes)
                    .force("link", d3.forceLink(graphData.links).id(d => d.id).distance(150))
                    .force("charge", d3.forceManyBody().strength(-300))
                    .force("center", d3.forceCenter(width / 2, height / 2));

                const svg = d3.select("#knowledge-graph")
                    .append("svg")
                    .attr("width", width)
                    .attr("height", height);

                // Add arrow markers
                svg.append("defs").selectAll("marker")
                    .data(["end"])
                    .enter().append("marker")
                    .attr("id", String)
                    .attr("viewBox", "0 -5 10 10")
                    .attr("refX", 25)
                    .attr("refY", 0)
                    .attr("markerWidth", 6)
                    .attr("markerHeight", 6)
                    .attr("orient", "auto")
                    .append("path")
                    .attr("d", "M0,-5L10,0L0,5");

                // Draw links
                const link = svg.append("g")
                    .selectAll("line")
                    .data(graphData.links)
                    .enter().append("line")
                    .attr("class", "link")
                    .attr("marker-end", "url(#end)");

                // Add link labels
                const linkLabel = svg.append("g")
                    .selectAll(".link-label")
                    .data(graphData.links)
                    .enter()
                    .append("text")
                    .attr("class", "link-label")
                    .text(d => d.label);

                // Draw nodes
                const node = svg.append("g")
                    .selectAll(".node-group")
                    .data(graphData.nodes)
                    .enter()
                    .append("g")
                    .call(d3.drag()
                        .on("start", dragstarted)
                        .on("drag", dragged)
                        .on("end", dragended));

                node.append("circle")
                    .attr("class", "node")
                    .attr("r", 20);

                node.append("text")
                    .attr("dx", 25)
                    .attr("dy", ".35em")
                    .text(d => d.id);

                // Update positions
                simulation.on("tick", () => {
                    link
                        .attr("x1", d => d.source.x)
                        .attr("y1", d => d.source.y)
                        .attr("x2", d => d.target.x)
                        .attr("y2", d => d.target.y);

                    linkLabel
                        .attr("x", d => (d.source.x + d.target.x) / 2)
                        .attr("y", d => (d.source.y + d.target.y) / 2);

                    node
                        .attr("transform", d => \`translate(\${d.x},\${d.y})\`);
                });

                // Drag functions
                function dragstarted(event, d) {
                    if (!event.active) simulation.alphaTarget(0.3).restart();
                    d.fx = d.x;
                    d.fy = d.y;
                }

                function dragged(event, d) {
                    d.fx = event.x;
                    d.fy = event.y;
                }

                function dragended(event, d) {
                    if (!event.active) simulation.alphaTarget(0);
                    d.fx = null;
                    d.fy = null;
                }
            </script>
        </body>
        </html>
        `;

        res.send(html);
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send(`<html><body><h1>Error</h1><p>${error.message}</p></body></html>`);
    }
});

// Update the route to handle both GET and POST
router.all('/knowledge-graph', async (req, res) => {
    try {
        // Calculate node importance based on relationships
        const nodeImportance = new Map();
        graph.nodes.forEach((data, id) => {
            // Count incoming relationships
            const incomingLinks = Array.from(graph.nodes.values())
                .filter(node => Array.from(node.relationships)
                    .some(rel => rel.includes(`-> ${id}`)))
                .length;
            
            // Count outgoing relationships
            const outgoingLinks = data.relationships.size;
            
            // Store total importance
            nodeImportance.set(id, incomingLinks + outgoingLinks);
        });

        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>LCH Knowledge Graph Visualization</title>
            <script src="https://d3js.org/d3.v7.min.js"></script>
            <style>
                body {
                    margin: 0;
                    padding: 20px;
                    font-family: 'Segoe UI', Arial, sans-serif;
                    background: #f0f2f5;
                }
                #graph-container {
                    background: white;
                    border-radius: 12px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                    padding: 30px;
                    margin: 20px auto;
                    max-width: 1400px;
                }
                #knowledge-graph {
                    width: 100%;
                    height: 900px;
                    background: #ffffff;
                    border-radius: 8px;
                }
                .node {
                    cursor: pointer;
                    transition: all 0.3s;
                }
                .node circle {
                    fill: #fff;
                    stroke: #2196F3;
                    stroke-width: 2px;
                    transition: all 0.3s;
                }
                .node:hover circle {
                    stroke: #1565C0;
                    stroke-width: 3px;
                }
                .node text {
                    font-size: 12px;
                    fill: #333;
                    font-weight: 500;
                }
                .link {
                    stroke: #90CAF9;
                    stroke-opacity: 0.6;
                    stroke-width: 2px;
                    transition: all 0.3s;
                }
                .link.highlighted {
                    stroke: #1565C0;
                    stroke-opacity: 1;
                    stroke-width: 3px;
                }
                .link-label {
                    font-size: 10px;
                    fill: #666;
                    font-weight: 500;
                }
                .controls {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    background: white;
                    padding: 20px;
                    border-radius: 8px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                    z-index: 1000;
                }
                button {
                    background: #2196F3;
                    color: white;
                    border: none;
                    padding: 8px 16px;
                    border-radius: 4px;
                    cursor: pointer;
                    margin: 5px;
                    transition: background 0.3s;
                }
                button:hover {
                    background: #1565C0;
                }
                .stats {
                    margin: 20px 0;
                    padding: 20px;
                    background: #E3F2FD;
                    border-radius: 8px;
                }
                .legend {
                    margin-top: 20px;
                    padding: 20px;
                    background: #F5F5F5;
                    border-radius: 8px;
                }
                .node-group {
                    opacity: 1;
                    transition: opacity 0.3s;
                }
                .node-group.faded {
                    opacity: 0.1;
                }
            </style>
        </head>
        <body>
            <div id="graph-container">
                <h1>LCH Knowledge Graph Visualization</h1>
                
                <div class="stats">
                    <h3>Graph Statistics</h3>
                    <div>Total Entities: ${graph.nodes.size}</div>
                    <div>Total Relationships: ${Array.from(graph.nodes.values())
                        .reduce((acc, node) => acc + node.relationships.size, 0)}</div>
                    <div>Most Connected Entity: ${
                        Array.from(nodeImportance.entries())
                            .sort((a, b) => b[1] - a[1])[0][0]
                    }</div>
                </div>

                <div id="knowledge-graph"></div>

                <div class="legend">
                    <h3>Legend</h3>
                    <div>• Node Size: Represents number of connections</div>
                    <div>• Line Thickness: Relationship strength</div>
                    <div>• Hover: Highlights connected nodes and relationships</div>
                    <div>• Drag: Move nodes to explore relationships</div>
                </div>
            </div>

            <div class="controls">
                <button onclick="resetZoom()">Reset View</button>
                <button onclick="toggleLabels()">Toggle Labels</button>
                <button onclick="toggleForceLayout()">Toggle Force</button>
            </div>

            <script>
                const graphData = {
                    nodes: Array.from(${JSON.stringify(Array.from(graph.nodes.entries()))})
                        .map(([id, data]) => ({
                            id,
                            relationships: Array.from(data.relationships),
                            importance: ${JSON.stringify([...nodeImportance])}
                                .find(([nodeId]) => nodeId === id)[1]
                        })),
                    links: Array.from(${JSON.stringify(Array.from(graph.nodes.entries()))})
                        .flatMap(([source, data]) => 
                            Array.from(data.relationships).map(rel => {
                                // Safely parse the relationship string
                                const parts = rel.split('->').map(s => s.trim());
                                const type = parts[0] || '';
                                const target = parts[1] || '';
                                return { 
                                    source, 
                                    target: target || source,  // fallback to source if target is empty
                                    type 
                                };
                            }).filter(link => link.source && link.target)  // Only keep valid links
                        )
                };

                const width = document.getElementById('knowledge-graph').clientWidth;
                const height = 900;
                let simulation;

                const svg = d3.select("#knowledge-graph")
                    .append("svg")
                    .attr("width", width)
                    .attr("height", height);

                const g = svg.append("g");

                // Add zoom behavior
                const zoom = d3.zoom()
                    .scaleExtent([0.1, 4])
                    .on("zoom", (event) => {
                        g.attr("transform", event.transform);
                    });

                svg.call(zoom);

                // Calculate node radius based on importance
                const radiusScale = d3.scaleLinear()
                    .domain([0, d3.max(graphData.nodes, d => d.importance)])
                    .range([10, 30]);

                // Setup force simulation
                function setupSimulation() {
                    simulation = d3.forceSimulation(graphData.nodes)
                        .force("link", d3.forceLink(graphData.links)
                            .id(d => d.id)
                            .distance(d => 100 + radiusScale(d.source.importance) + radiusScale(d.target.importance)))
                        .force("charge", d3.forceManyBody().strength(-1000))
                        .force("center", d3.forceCenter(width / 2, height / 2))
                        .force("collision", d3.forceCollide().radius(d => radiusScale(d.importance) + 10));
                }

                // Draw links
                const link = g.append("g")
                    .selectAll("line")
                    .data(graphData.links)
                    .enter()
                    .append("line")
                    .attr("class", "link");

                // Add link labels
                const linkLabel = g.append("g")
                    .selectAll(".link-label")
                    .data(graphData.links)
                    .enter()
                    .append("text")
                    .attr("class", "link-label")
                    .text(d => d.type);

                // Draw nodes
                const node = g.append("g")
                    .selectAll(".node-group")
                    .data(graphData.nodes)
                    .enter()
                    .append("g")
                    .attr("class", "node-group")
                    .call(d3.drag()
                        .on("start", dragstarted)
                        .on("drag", dragged)
                        .on("end", dragended));

                node.append("circle")
                    .attr("class", "node")
                    .attr("r", d => radiusScale(d.importance));

                node.append("text")
                    .attr("dx", d => radiusScale(d.importance) + 5)
                    .attr("dy", ".35em")
                    .text(d => d.id);

                // Highlight connected nodes and links
                node.on("mouseover", highlightConnections)
                    .on("mouseout", resetHighlight);

                function highlightConnections(event, d) {
                    const connectedNodes = new Set([d.id]);
                    const connectedLinks = new Set();
                    
                    graphData.links.forEach((link, i) => {
                        if (link.source.id === d.id || link.target.id === d.id) {
                            connectedNodes.add(link.source.id);
                            connectedNodes.add(link.target.id);
                            connectedLinks.add(i);
                        }
                    });

                    node.classed("faded", n => !connectedNodes.has(n.id));
                    link.classed("highlighted", (_, i) => connectedLinks.has(i));
                    linkLabel.style("opacity", (_, i) => connectedLinks.has(i) ? 1 : 0.1);
                }

                function resetHighlight() {
                    node.classed("faded", false);
                    link.classed("highlighted", false);
                    linkLabel.style("opacity", 1);
                }

                // Update positions
                setupSimulation();
                simulation.on("tick", () => {
                    link
                        .attr("x1", d => d.source.x)
                        .attr("y1", d => d.source.y)
                        .attr("x2", d => d.target.x)
                        .attr("y2", d => d.target.y);

                    linkLabel
                        .attr("x", d => (d.source.x + d.target.x) / 2)
                        .attr("y", d => (d.source.y + d.target.y) / 2);

                    node
                        .attr("transform", d => \`translate(\${d.x},\${d.y})\`);
                });

                // Control functions
                function dragstarted(event, d) {
                    if (!event.active) simulation.alphaTarget(0.3).restart();
                    d.fx = d.x;
                    d.fy = d.y;
                }

                function dragged(event, d) {
                    d.fx = event.x;
                    d.fy = event.y;
                }

                function dragended(event, d) {
                    if (!event.active) simulation.alphaTarget(0);
                    d.fx = null;
                    d.fy = null;
                }

                function resetZoom() {
                    svg.transition().duration(750).call(
                        zoom.transform,
                        d3.zoomIdentity
                    );
                }

                let labelsVisible = true;
                function toggleLabels() {
                    labelsVisible = !labelsVisible;
                    linkLabel.style("display", labelsVisible ? "block" : "none");
                }

                let forceEnabled = true;
                function toggleForceLayout() {
                    forceEnabled = !forceEnabled;
                    if (forceEnabled) {
                        setupSimulation();
                        simulation.alpha(1).restart();
                    } else {
                        simulation.stop();
                    }
                }
            </script>
        </body>
        </html>
        `;

        res.send(html);
    } catch (error) {
        console.error('Error generating graph:', error);
        res.status(500).send(`
            <html>
                <body>
                    <h1>Error</h1>
                    <p>Failed to generate graph: ${error.message}</p>
                    <pre>${error.stack}</pre>
                </body>
            </html>
        `);
    }
});

// Add new endpoint for chunk density visualization
router.get('/chunk-density/:chunkId', async (req, res) => {
    try {
        const chunkId = req.params.chunkId;
        
        // Get chunk density analysis
        const analysis = visualizeChunkDensity(chunkId, graph);
        
        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Chunk Density Analysis</title>
            <style>
                body {
                    font-family: 'Segoe UI', Arial, sans-serif;
                    max-width: 1000px;
                    margin: 40px auto;
                    padding: 20px;
                    background: #f5f5f5;
                }
                .container {
                    background: white;
                    padding: 30px;
                    border-radius: 10px;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                }
                .chunk-text {
                    background: #f8f9fa;
                    padding: 20px;
                    border-radius: 8px;
                    margin: 20px 0;
                    border-left: 4px solid #007bff;
                }
                .entity-card {
                    background: #fff;
                    padding: 15px;
                    margin: 10px 0;
                    border: 1px solid #dee2e6;
                    border-radius: 8px;
                }
                .relationship {
                    margin: 5px 20px;
                    padding: 5px 10px;
                    background: #e9ecef;
                    border-radius: 4px;
                    display: inline-block;
                }
                .density-score {
                    font-size: 1.2em;
                    padding: 15px;
                    background: #e3f2fd;
                    border-radius: 8px;
                    margin-top: 20px;
                }
                .secondary-connection {
                    color: #666;
                    font-style: italic;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>Chunk Density Analysis</h1>
                
                <h2>Chunk Text</h2>
                <div class="chunk-text">
                    ${graph.chunks.get(parseInt(chunkId)) || 'Chunk not found'}
                </div>

                <h2>Entity Analysis</h2>
                ${analysis.entities.map(entity => `
                    <div class="entity-card">
                        <h3>🔹 ${entity.name}</h3>
                        
                        <h4>Direct Relationships (${entity.directRelationships.length})</h4>
                        ${entity.directRelationships.map(rel => `
                            <span class="relationship">${rel}</span>
                        `).join('')}
                        
                        <h4>Secondary Connections (${entity.secondaryConnections.length})</h4>
                        ${entity.secondaryConnections.map(rel => `
                            <span class="relationship secondary-connection">${rel}</span>
                        `).join('')}
                    </div>
                `).join('')}

                <div class="density-score">
                    <strong>Final Density Score:</strong> ${analysis.densityScore.toFixed(3)}
                    <br>
                    <small>
                        (Direct Relationships: ${analysis.directScore.toFixed(3)} × 0.6) + 
                        (Secondary Connections: ${analysis.secondaryScore.toFixed(3)} × 0.4)
                    </small>
                </div>
            </div>
        </body>
        </html>
        `;
        
        res.send(html);
    } catch (error) {
        res.status(500).send(`Error: ${error.message}`);
    }
});

// Add visualization helper function
function visualizeChunkDensity(chunkId, graph) {
    const connectedEntities = Array.from(graph.nodes.entries())
        .filter(([_, nodeData]) => nodeData.connectedChunks.has(parseInt(chunkId)));
    
    const analysis = {
        entities: [],
        directScore: 0,
        secondaryScore: 0,
        densityScore: 0
    };
    
    // Analyze each entity
    connectedEntities.forEach(([entity, nodeData]) => {
        const entityAnalysis = {
            name: entity,
            directRelationships: Array.from(nodeData.relationships),
            secondaryConnections: Array.from(nodeData.relationships)
                .filter(rel => {
                    const targetEntity = rel.split('->')[1].trim();
                    return connectedEntities.some(([otherEntity]) => otherEntity === targetEntity);
                })
        };
        
        analysis.entities.push(entityAnalysis);
        analysis.directScore += entityAnalysis.directRelationships.length;
        analysis.secondaryScore += entityAnalysis.secondaryConnections.length;
    });
    
    // Calculate final density score
    analysis.densityScore = 
        (analysis.directScore * 0.6) + 
        (analysis.secondaryScore * 0.4);
    
    return analysis;
}

// Enhanced test-query endpoint with document filtering and metadata handling
router.post('/test-query', async (req, res) => {
    try {
        const startTime = Date.now();
        // Support both documentId (string) and documentIds (array) for backward compatibility
        const { query, documentId, documentIds = [], config = {} } = req.body;
        
        // Convert documentId to array if provided
        const docIds = documentId ? [documentId] : documentIds;
        
        logger.info('Processing query request:', { 
            query, 
            documentId,
            documentIds: docIds,
            configOptions: Object.keys(config)
        });

        // Load graph data from database
        await loadGraphFromDb();
        
        // Verify we have chunks for the selected documents using both storage locations
        let availableChunks = [];
        
        // Check local graph storage
        const graphChunks = Array.from(graph.chunks.entries())
            .map(([id, text]) => ({
                id,
                text,
                metadata: graph.chunkMetadata.get(id)
            }))
            .filter(chunk => {
                const meta = chunk.metadata;
                // If no document IDs provided, use all chunks
                if (docIds.length === 0) return true;
                
                return docIds.some(docId => 
                    meta?.documentId === docId || 
                    meta?.documentName === docId ||
                    meta?.originalDocumentId === docId
                );
            });
            
        // Check global storage
        const globalChunks = global.graphData && global.graphData.chunks
            ? global.graphData.chunks.filter(chunk => {
                const meta = chunk.metadata;
                // If no document IDs provided, use all chunks
                if (docIds.length === 0) return true;
                
                return docIds.some(docId => 
                    meta?.documentId === docId || 
                    meta?.documentName === docId ||
                    meta?.originalDocumentId === docId
                );
            })
            : [];
            
        // Combine unique chunks from both sources
        const seenIds = new Set();
        availableChunks = [...graphChunks, ...globalChunks]
            .filter(chunk => {
                if (seenIds.has(chunk.id)) return false;
                seenIds.add(chunk.id);
                return true;
            });

        if (availableChunks.length === 0) {
            logger.warn('No chunks found for documents:', docIds);
            return res.status(404).json({
                error: 'No chunks found for the selected documents',
                documentIds: docIds
            });
        }

        logger.info(`Found ${availableChunks.length} chunks across storage locations`);
        
        // Format metadata according to BusinessGPT requirements
        availableChunks = availableChunks.map(chunk => {
            const meta = chunk.metadata || {};
            return {
                ...chunk,
                metadata: {
                    ...meta,
                    documentName: meta.documentName || 'Unknown',
                    pageNumber: meta.pageNumber || '1/1',
                    section: meta.section || 'Unknown',
                    relevanceScore: meta.relevanceScore || 0.95,
                    metadataBlock: `---
Document: ${meta.documentName || 'Unknown'}
Page: ${meta.pageNumber || '1/1'}
Section: ${meta.section || 'Unknown'}
Relevance Score: ${(meta.relevanceScore || 0.95) * 100}%
---`,
                    formattedCitation: `[Source: ${meta.documentName || 'Unknown'}, Page ${meta.pageNumber || '1/1'}]`
                }
            };
        });

        // Validate query
        if (!query) {
            return res.status(400).json({ error: 'Query is required' });
        }
        
        // Set default configuration with sensible defaults
        const defaultConfig = {
            chunkSelection: {
                maxChunks: {
                    value: 3
                },
                scoreWeights: {
                    semantic: {
                        value: 0.6
                    },
                    entity: {
                        value: 0.3
                    },
                    relationship: {
                        value: 0.1
                    }
                }
            },
            useEntities: true,
            useChunks: true,
            maxResults: 5,
            includeAnalysis: true,
            minRelevanceScore: 0.65
        };
        
        // Merge provided config with defaults
        const mergedConfig = {
            ...defaultConfig,
            ...config,
            chunkSelection: {
                ...defaultConfig.chunkSelection,
                ...(config.chunkSelection || {}),
                maxChunks: {
                    ...defaultConfig.chunkSelection.maxChunks,
                    ...(config.chunkSelection?.maxChunks || {})
                },
                scoreWeights: {
                    ...defaultConfig.chunkSelection.scoreWeights,
                    ...(config.chunkSelection?.scoreWeights || {}),
                    semantic: {
                        ...defaultConfig.chunkSelection.scoreWeights.semantic,
                        ...(config.chunkSelection?.scoreWeights?.semantic || {})
                    },
                    entity: {
                        ...defaultConfig.chunkSelection.scoreWeights.entity,
                        ...(config.chunkSelection?.scoreWeights?.entity || {})
                    },
                    relationship: {
                        ...defaultConfig.chunkSelection.scoreWeights.relationship,
                        ...(config.chunkSelection?.scoreWeights?.relationship || {})
                    }
                }
            }
        };

        logger.debug('Using configuration:', mergedConfig);

        // Load graph data if not already loaded
        if (!global.graphData || !global.graphData.chunks || global.graphData.chunks.length === 0) {
            logger.info('Loading graph data from database...');
            await loadGraphFromDb();
        }

        // Extract entities from query for better matching
        logger.info('Extracting entities from query');
        const queryEntities = await extractEntitiesWithOpenAI(query);
        logger.debug('Extracted entities:', queryEntities.entities);
        logger.debug('Extracted relationships:', queryEntities.relationships);

        // Get embeddings for the query
        logger.info('Generating embeddings for query');
        const embeddingStartTime = Date.now();
        const queryEmbedding = await openai.embeddings.create({
            model: "text-embedding-ada-002",
            input: query
        });
        const embeddingEndTime = Date.now();
        logger.debug(`Embedding generation took ${embeddingEndTime - embeddingStartTime}ms`);

        // Filter chunks based on document IDs if provided
        let chunksToProcess = global.graphData.chunks;
        if (documentIds.length > 0) {
            chunksToProcess = global.graphData.chunks.filter(chunk => 
                chunk.metadata && documentIds.includes(chunk.metadata.documentName)
            );
            logger.info(`Filtered to ${chunksToProcess.length} chunks from selected documents`);
            
            if (chunksToProcess.length === 0) {
                return res.status(404).json({
                    error: 'No chunks found for the selected documents',
                    documentIds
                });
            }
        }

        // Score chunks based on multiple factors
        const scoredChunks = await Promise.all(
            chunksToProcess.map(async (chunk) => {
                // Calculate semantic similarity
                const similarity = cosineSimilarity(
                    queryEmbedding.data[0].embedding,
                    chunk.embedding
                );

                // Calculate entity overlap score
                const entityScore = calculateEntityScore(query, chunk.entities || []);
                
                // Calculate relationship relevance
                const relationshipScore = calculateRelationshipScore(
                    chunk.entities || [], 
                    queryEntities.entities || []
                );

                // Weighted combination of scores
                const totalScore = (
                    similarity * 0.6 +  // Semantic similarity weight
                    entityScore * 0.3 + // Entity overlap weight
                    relationshipScore * 0.1  // Relationship weight
                );

                return {
                    ...chunk,
                    score: totalScore,
                    similarity,
                    entityScore,
                    relationshipScore
                };
            })
        );

        // Sort and select top chunks
        const topChunks = scoredChunks
            .sort((a, b) => b.score - a.score)
            .slice(0, 3);  // Select top 3 chunks

        // Format context for the LLM
        const context = topChunks.map(chunk => {
            const metadata = chunk.metadata || {};
            return `
Source: ${metadata.documentName || 'Unknown'}
Page: ${metadata.pageNumber || 'N/A'}
Section: ${metadata.section || 'N/A'}
Relevance: ${(chunk.score * 100).toFixed(1)}%
---
${chunk.text}
`;
        }).join('\n\n');

        logger.info(`Selected ${topChunks.length} chunks for context`);

        // Construct prompt with clear instructions
        const prompt = `
You are an AI assistant helping to answer questions about documents. Use ONLY the information from the provided context to answer the question. If you cannot find the answer in the context, say so.

Context:
${context}

Question: ${query}

Please provide a clear and concise answer based solely on the provided context. Include relevant source citations when appropriate.`;

        // Generate response using ChatGPT
        const completion = await openai.chat.completions.create({
            model: "gpt-4-turbo-preview",
            messages: [
                {
                    role: "system",
                    content: "You are a helpful assistant that provides accurate answers based solely on the given context. Always cite sources and include page numbers when available. Format citations as [Document Name, Page X]. Prioritize information from sources with higher relevance scores."
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: 0.7,
            max_tokens: 1000
        });

        // Calculate timing information
        const endTime = Date.now();
        const timings = {
            total: endTime - startTime,
            embedding: embeddingEndTime - embeddingStartTime,
            llm: Date.now() - llmStartTime
        };

        // Prepare comprehensive response with metadata and analysis
        const response = {
            answer: completion.choices[0].message.content,
            metadata: {
                processingTime: timings.total,
                documentIds: documentIds,
                chunksProcessed: chunksToProcess.length,
                topChunksUsed: topChunks.length,
                processedAt: new Date().toISOString(),
                timings
            },
            sources: topChunks.map(chunk => ({
                documentName: chunk.metadata?.documentName || 'Unknown',
                pageNumber: chunk.metadata?.pageNumber,
                section: chunk.metadata?.section,
                relevanceScore: (chunk.score * 100).toFixed(1) + '%',
                relevanceCategory: chunk.score >= 0.85 ? 'high' : chunk.score >= 0.7 ? 'medium' : 'low',
                text: chunk.text,
                similarity: chunk.similarity,
                entityScore: chunk.entityScore,
                relationshipScore: chunk.relationshipScore,
                entities: chunk.entities
            })),
            analysis: {
                averageRelevance: (topChunks.reduce((acc, chunk) => acc + chunk.score, 0) / topChunks.length * 100).toFixed(1) + '%',
                topSourceCount: topChunks.filter(chunk => chunk.score >= 0.85).length,
                totalSourceCount: topChunks.length,
                keyEntities: queryEntities.entities.slice(0, 4),  // Top 4 most relevant concepts
                keyRelationships: queryEntities.relationships.slice(0, 2),  // Top 2 most important relationships
                topEntities,
                topRelationships,
                documentStats,
                queryEntities: queryEntities.entities,
                queryRelationships: queryEntities.relationships
            }
        };

        logger.info(`Query processed successfully in ${timings.total}ms`);
        res.json(response);
    } catch (error) {
        logger.error('Error processing query:', error);
        res.status(500).json({
            error: 'Failed to process query',
            details: error.message,
            metadata: {
                documentIds: req.body.documentIds || [],
                query: req.body.query
            },
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Helper function for cosine similarity
function cosineSimilarity(vecA, vecB) {
    const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
    const normA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
    const normB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
    return dotProduct / (normA * normB);
}

// Helper function for entity score
function calculateEntityScore(query, chunkEntities) {
    if (!chunkEntities || chunkEntities.length === 0) return 0;
    
    // Simple word overlap for now
    const queryWords = query.toLowerCase().split(/\W+/);
    const matchingEntities = chunkEntities.filter(entity => 
        queryWords.some(word => entity.toLowerCase().includes(word))
    );
    
    return matchingEntities.length / chunkEntities.length;
}

// Helper function for relationship score between chunk entities and query entities
function calculateRelationshipScore(chunkEntities, queryEntities) {
    if (!chunkEntities || !chunkEntities.length || !queryEntities || !queryEntities.length) {
        return 0;
    }
    
    // Convert to lowercase for case-insensitive comparison
    const normalizedChunkEntities = chunkEntities.map(e => e.toLowerCase());
    const normalizedQueryEntities = queryEntities.map(e => e.toLowerCase());
    
    // Count direct matches
    let directMatches = 0;
    normalizedQueryEntities.forEach(queryEntity => {
        if (normalizedChunkEntities.includes(queryEntity)) {
            directMatches++;
        }
    });
    
    // Count partial matches (one is substring of the other)
    let partialMatches = 0;
    normalizedQueryEntities.forEach(queryEntity => {
        if (!normalizedChunkEntities.includes(queryEntity)) { // Skip direct matches
            if (normalizedChunkEntities.some(chunkEntity => 
                chunkEntity.includes(queryEntity) || queryEntity.includes(chunkEntity))) {
                partialMatches++;
            }
        }
    });
    
    // Calculate score with higher weight for direct matches
    const directMatchScore = normalizedQueryEntities.length > 0 ? 
        (directMatches / normalizedQueryEntities.length) * 0.8 : 0;
    const partialMatchScore = normalizedQueryEntities.length > 0 ? 
        (partialMatches / normalizedQueryEntities.length) * 0.2 : 0;
    
    return directMatchScore + partialMatchScore;
}

// Add detailed insights endpoint for Graph RAG analysis
router.post('/insights', async (req, res) => {
    try {
        const startTime = Date.now();
        const { query, config = {} } = req.body;
        
        // Validate query
        if (!query) {
            return res.status(400).json({ error: 'Query is required' });
        }
        
        // Check if graph data exists
        if (!global.graphData || !global.graphData.chunks) {
            try {
                logger.info('Attempting to load graph data from file');
                const graphDataPath = path.join(__dirname, '../data/graph.json');
                const graphData = await fsPromises.readFile(graphDataPath, 'utf8');
                global.graphData = JSON.parse(graphData);
                logger.info(`Successfully loaded graph data with ${global.graphData.chunks.length} chunks`);
            } catch (error) {
                logger.error('Failed to load graph data:', error);
                return res.status(400).json({ 
                    error: 'Graph data not loaded. Please process documents first to build the graph.',
                    details: error.message
                });
            }
        }

        // Extract entities and relationships from query
        logger.info('Extracting entities and relationships from query');
        const queryAnalysis = await extractEntitiesWithOpenAI(query);
        logger.debug('Extracted entities:', queryAnalysis.entities);
        logger.debug('Extracted relationships:', queryAnalysis.relationships);
        
        // Generate embeddings for query
        logger.info('Generating embeddings for query');
        const embeddingStartTime = Date.now();
        const queryEmbedding = await openai.embeddings.create({
            model: "text-embedding-ada-002",
            input: query
        });
        const embeddingEndTime = Date.now();
        
        // Score all chunks
        const scoringStartTime = Date.now();
        const scoredChunks = await Promise.all(
            global.graphData.chunks.map(async (chunk, index) => {
                // Calculate semantic similarity
                const similarity = cosineSimilarity(
                    queryEmbedding.data[0].embedding,
                    chunk.embedding
                );

                // Calculate entity score
                const entityScore = calculateEntityScore(query, chunk.entities || []);
                
                // Calculate relationship score
                const relationshipScore = calculateRelationshipScore(
                    chunk.entities || [], 
                    queryAnalysis.entities
                );

                // Calculate final score using weights
                const totalScore = (
                    similarity * 0.6 +
                    entityScore * 0.3 +
                    relationshipScore * 0.1
                );

                // Get chunk metadata
                const metadata = chunk.metadata || {};
                
                // Determine relevance category
                let relevanceCategory = 'low';
                if (totalScore >= 0.85) relevanceCategory = 'high';
                else if (totalScore >= 0.7) relevanceCategory = 'medium';
                
                // Get page references if available
                const pageNumber = metadata.pageNumber || chunk.pageNumber || 0;
                const totalPages = metadata.totalPages || chunk.totalPages || 0;
                
                return {
                    chunkId: chunk.id || `chunk_${index}`,
                    text: chunk.text,
                    scores: {
                        total: totalScore,
                        semantic: similarity,
                        entity: entityScore,
                        relationship: relationshipScore
                    },
                    metadata: {
                        documentName: metadata.documentName || chunk.documentName || 'unknown',
                        pageNumber,
                        totalPages,
                        section: metadata.section || chunk.section || 'unknown',
                        relevanceCategory
                    },
                    entities: chunk.entities || [],
                    truncatedText: chunk.text.length > 200 ? 
                        `${chunk.text.substring(0, 200)}...` : 
                        chunk.text
                };
            })
        );
        const scoringEndTime = Date.now();
        
        // Sort chunks by score
        const sortedChunks = [...scoredChunks].sort((a, b) => b.scores.total - a.scores.total);
        
        // Get top chunks (used for response generation)
        const topChunks = sortedChunks.slice(0, 3);
        
        // Extract all entities and count occurrences
        const entityCounts = {};
        scoredChunks.forEach(chunk => {
            chunk.entities.forEach(entity => {
                entityCounts[entity] = (entityCounts[entity] || 0) + 1;
            });
        });
        
        // Get top entities
        const topEntities = Object.entries(entityCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([entity, count]) => ({ entity, count }));
        
        // Get document statistics
        const documentStats = {};
        scoredChunks.forEach(chunk => {
            const docName = chunk.metadata.documentName;
            if (!documentStats[docName]) {
                documentStats[docName] = {
                    chunkCount: 0,
                    highRelevanceCount: 0,
                    mediumRelevanceCount: 0,
                    lowRelevanceCount: 0,
                    averageScore: 0,
                    pages: new Set()
                };
            }
            
            documentStats[docName].chunkCount++;
            documentStats[docName].averageScore += chunk.scores.total;
            
            if (chunk.metadata.relevanceCategory === 'high') {
                documentStats[docName].highRelevanceCount++;
            } else if (chunk.metadata.relevanceCategory === 'medium') {
                documentStats[docName].mediumRelevanceCount++;
            } else {
                documentStats[docName].lowRelevanceCount++;
            }
            
            if (chunk.metadata.pageNumber) {
                documentStats[docName].pages.add(chunk.metadata.pageNumber);
            }
        });
        
        // Calculate averages and convert sets to arrays
        Object.keys(documentStats).forEach(docName => {
            const stats = documentStats[docName];
            stats.averageScore = stats.averageScore / stats.chunkCount;
            stats.pages = Array.from(stats.pages).sort((a, b) => a - b);
        });

        // Generate HTML visualization
        const endTime = Date.now();
        
        // Return detailed insights
        const insights = {
            query,
            queryEntities: queryAnalysis.entities,
            queryRelationships: queryAnalysis.relationships,
            topChunks,
            topEntities,
            documentStats,
            chunkCount: scoredChunks.length,
            relevanceCounts: {
                high: scoredChunks.filter(c => c.metadata.relevanceCategory === 'high').length,
                medium: scoredChunks.filter(c => c.metadata.relevanceCategory === 'medium').length,
                low: scoredChunks.filter(c => c.metadata.relevanceCategory === 'low').length
            },
            timings: {
                total: endTime - startTime,
                embedding: embeddingEndTime - embeddingStartTime,
                scoring: scoringEndTime - scoringStartTime
            }
        };
        
        res.json(insights);
    } catch (error) {
        logger.error('Error generating insights:', error);
        res.status(500).json({ 
            error: error.message || 'Internal server error',
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Helper function to split content into processable chunks
function splitIntoProcessableChunks(content, maxChunkSize = 1000) {
    // Simple implementation - split by paragraphs first
    let paragraphs = content.split(/\n\n+/);
    
    // Further split long paragraphs
    let chunks = [];
    for (const paragraph of paragraphs) {
        if (paragraph.length <= maxChunkSize) {
            if (paragraph.trim().length > 0) {
                chunks.push(paragraph.trim());
            }
        } else {
            // Split long paragraphs by sentences
            const sentences = paragraph.match(/[^.!?]+[.!?]+/g) || [paragraph];
            let currentChunk = '';
            
            for (const sentence of sentences) {
                if ((currentChunk + sentence).length <= maxChunkSize) {
                    currentChunk += sentence;
                } else {
                    if (currentChunk.trim().length > 0) {
                        chunks.push(currentChunk.trim());
                    }
                    currentChunk = sentence;
                }
            }
            
            if (currentChunk.trim().length > 0) {
                chunks.push(currentChunk.trim());
            }
        }
    }
    
    return chunks;
}

// Helper function to extract entities and relationships using OpenAI
async function extractEntitiesWithOpenAI(text) {
    try {
        const prompt = `Extract entities and relationships from the following text. Format the output as JSON with 'entities' and 'relationships' arrays.

Entities should have 'text' and 'type' properties. Types can be: Person, Organization, Location, Concept, Technology, Event, etc.

Relationships should have 'subject', 'relationship', and 'object' properties.

Text: "${text}"

Output:`;
        
        const response = await openai.createCompletion({
            model: "text-davinci-003",
            prompt,
            max_tokens: 1000,
            temperature: 0.3,
        });
        
        const output = response.data.choices[0].text.trim();
        let parsed;
        
        try {
            // Try to parse the output as JSON
            parsed = JSON.parse(output);
        } catch (e) {
            // If parsing fails, try to extract JSON from the text
            const jsonMatch = output.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                try {
                    parsed = JSON.parse(jsonMatch[0]);
                } catch (e2) {
                    // If all parsing fails, return empty results
                    logger.error('Failed to parse OpenAI output as JSON:', output);
                    return { entities: [], relationships: [] };
                }
            } else {
                logger.error('No JSON found in OpenAI output:', output);
                return { entities: [], relationships: [] };
            }
        }
        
        // Ensure the expected structure
        return {
            entities: Array.isArray(parsed.entities) ? parsed.entities : [],
            relationships: Array.isArray(parsed.relationships) ? parsed.relationships : []
        };
    } catch (error) {
        logger.error('Error extracting entities with OpenAI:', error);
        return { entities: [], relationships: [] };
    }
}

// Helper function to process a document and add it to the graph
async function processDocumentForGraph(documentId, content, metadata) {
    try {
        logger.info(`Processing document ${documentId} for graph`, { metadata });
        
        // Connect to MongoDB
        const client = new MongoClient(url);
        await client.connect();
        const db = client.db(dbName);
        const collection = db.collection('graphDocuments');
        
        // Update status to processing
        await collection.updateOne(
            { documentId },
            { $set: { status: 'processing' } }
        );
        
        // Process the document content
        const chunks = splitIntoProcessableChunks(content);
        
        // Format document metadata according to BusinessGPT requirements
        const documentMetadata = {
            documentName: metadata.documentName || metadata.name,
            documentId: documentId,
            type: metadata.type,
            pageCount: metadata.pageCount || Math.ceil(chunks.length / 30),
            sections: metadata.sections || ['Introduction', 'Analysis', 'Recommendations'],
            uploadDate: metadata.uploadDate || new Date().toISOString()
        };
        
        // Process each chunk with BusinessGPT metadata format
        for (let i = 0; i < chunks.length; i++) {
            const chunkId = `${documentId}_chunk_${i}`;
            const pageNum = Math.floor(i / 30) + 1;
            const sectionIndex = Math.floor(i / (chunks.length / documentMetadata.sections.length));
            
            // Create chunk metadata with required fields
            const chunkMetadata = {
                documentName: documentMetadata.documentName,
                documentId: documentMetadata.documentId,
                pageNumber: `${pageNum}/${documentMetadata.pageCount}`,
                section: documentMetadata.sections[sectionIndex],
                relevanceScore: 0.95, // Initial score
                uploadDate: documentMetadata.uploadDate,
                chunkIndex: i,
                type: documentMetadata.type
            };
            
            // Add chunk with metadata to graph
            graph.addChunkWithMetadata(chunkId, chunks[i], chunkMetadata);
            
            // Extract entities and relationships
            const { entities, relationships } = await extractEntitiesWithOpenAI(chunks[i]);
            
            // Add entities to graph with metadata
            for (const entity of entities) {
                const entityMetadata = {
                    documentId: documentMetadata.documentId,
                    confidence: entity.confidence || 0.8,
                    type: entity.type,
                    section: chunkMetadata.section,
                    pageNumber: chunkMetadata.pageNumber
                };
                graph.addNode(entity.text, entity.type, entityMetadata);
                graph.addChunkConnection(entity.text, chunkId);
            }
            
            // Add relationships to graph with metadata
            for (const rel of relationships) {
                graph.addRelationship(
                    rel.subject,
                    rel.relationship,
                    rel.object,
                    chunkId
                );
            }
            
            // Update processing status
            await collection.updateOne(
                { documentId },
                { 
                    $set: { 
                        processingProgress: Math.floor((i + 1) / chunks.length * 100)
                    }
                }
            );
        }
        
        // Save graph to database
        await saveGraphToDb();
        
        // Update document status to completed
        await collection.updateOne(
            { documentId },
            { 
                $set: { 
                    status: 'completed',
                    processingProgress: 100,
                    completedAt: new Date()
                }
            }
        );
        
        // Close the connection
        await client.close();
        
        logger.info(`Document ${documentId} processed successfully`);
    } catch (error) {
        logger.error(`Error processing document ${documentId}:`, error);
        
        // Update document status to error
        const client = new MongoClient(url);
        await client.connect();
        const db = client.db(dbName);
        const collection = db.collection('graphDocuments');
        
        await collection.updateOne(
            { documentId },
            { 
                $set: { 
                    status: 'error',
                    error: error.message
                }
            }
        );
        
        await client.close();
    }
}

// Add endpoint to select a document and load its graph
router.post('/select-document', async (req, res) => {
    try {
        const { documentId } = req.body;
        
        if (!documentId) {
            return res.status(400).json({ error: 'Document ID is required.' });
        }

        // Log the graph instance to debug
        console.log('Graph instance type:', typeof graph);
        console.log('Graph methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(graph)));
        
        // Use the graph instance instead of calling KnowledgeGraph statically
        const success = await graph.loadForDocument(documentId);
        if (!success) {
            return res.status(404).json({ error: 'Graph data not found for the provided document ID.' });
        }

        res.status(200).json({ 
            message: 'Graph data loaded successfully.', 
            nodeCount: graph.nodes.size,
            edgeCount: graph.edges.size,
            chunkCount: graph.chunks.size
        });
    } catch (error) {
        console.error('Error selecting document:', error);
        res.status(500).json({ error: 'An error occurred while selecting the document.', details: error.message });
    }
});

// Add endpoint to view logs
router.get('/logs', async (req, res) => {
    try {
        const { level = 'info', limit = 100 } = req.query;
        
        // Read logs from file
        const logs = await new Promise((resolve, reject) => {
            const logEntries = [];
            const logStream = winston.stream({ 
                filename: `logs/graph-rag-${level}.log`,
                json: true
            });

            logStream.on('data', (log) => {
                logEntries.push(JSON.parse(log));
                if (logEntries.length >= limit) {
                    logStream.destroy();
                }
            });

            logStream.on('end', () => resolve(logEntries));
            logStream.on('error', reject);
        });

        // Generate HTML view of logs
        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Graph RAG Logs</title>
            <style>
                body { font-family: monospace; padding: 20px; }
                .log-entry { 
                    margin: 10px 0; 
                    padding: 10px;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                }
                .error { background: #fee; }
                .debug { background: #eff; }
                .info { background: #eef; }
                .timestamp { color: #666; }
                .level { font-weight: bold; }
                pre { white-space: pre-wrap; }
            </style>
        </head>
        <body>
            <h1>Graph RAG Logs</h1>
            <div class="controls">
                <select onchange="window.location.href='?level=' + this.value">
                    <option value="debug" ${level === 'debug' ? 'selected' : ''}>Debug</option>
                    <option value="info" ${level === 'info' ? 'selected' : ''}>Info</option>
                    <option value="error" ${level === 'error' ? 'selected' : ''}>Error</option>
                </select>
            </div>
            ${logs.map(log => `
                <div class="log-entry ${log.level}">
                    <div class="timestamp">${log.timestamp}</div>
                    <div class="level">${log.level.toUpperCase()}</div>
                    <pre>${JSON.stringify(log, null, 2)}</pre>
                </div>
            `).join('')}
        </body>
        </html>
        `;

        res.send(html);
    } catch (error) {
        res.status(500).send(`Error reading logs: ${error.message}`);
    }
});

// Add the configure GET endpoint
router.get('/configure', async (req, res) => {
    try {
        // Default configuration
        const defaultConfig = {
            chunkSelection: {
                maxChunks: {
                    value: 5,
                    range: [1, 10],
                    description: "Maximum number of chunks to return"
                },
                scoreWeights: {
                    semantic: {
                        value: 0.3,
                        range: [0, 1],
                        description: "Weight for semantic similarity"
                    },
                    entity: {
                        value: 0.4,
                        range: [0, 1],
                        description: "Weight for entity matching"
                    },
                    relationship: {
                        value: 0.2,
                        range: [0, 1],
                        description: "Weight for relationship density"
                    },
                    position: {
                        value: 0.1,
                        range: [0, 1],
                        description: "Weight for position in document"
                    }
                }
            },
            // ... other configuration sections ...
        };

        res.json(defaultConfig);
    } catch (error) {
        console.error('Error getting configuration:', error);
        res.status(500).json({ error: error.message });
    }
});

// Add endpoint to load and process PDF
router.post('/load-pdf', async (req, res) => {
    try {
        // Path to LCH PDF
        const pdfPath = path.join(__dirname, '../data/lch.pdf');
        
        // Read PDF file
        const dataBuffer = await fsPromises.readFile(pdfPath);
        const data = await pdf(dataBuffer);

        // Split into chunks
        const chunks = data.text
            .split(/\n\n+/)
            .filter(chunk => chunk.trim().length > 50); // Filter out small chunks

        // Process chunks
        const processedChunks = await Promise.all(
            chunks.map(async (text, index) => {
                // Get embeddings for chunk
                const embedding = await openai.embeddings.create({
                    model: "text-embedding-ada-002",
                    input: text
                });

                // Extract entities (simple for now)
                const entities = text
                    .split(/\W+/)
                    .filter(word => word.length > 3 && /^[A-Z]/.test(word));

                return {
                    id: index,
                    text,
                    embedding: embedding.data[0].embedding,
                    entities
                };
            })
        );

        // Store in global variable
        global.graphData = {
            chunks: processedChunks,
            totalChunks: processedChunks.length,
            createdAt: new Date().toISOString()
        };

        // Save to file for persistence
        await fsPromises.writeFile(
            path.join(__dirname, '../data/graph.json'),
            JSON.stringify(global.graphData, null, 2)
        );

        res.json({
            message: 'Graph data loaded successfully',
            stats: {
                totalChunks: processedChunks.length,
                createdAt: global.graphData.createdAt
            }
        });

    } catch (error) {
        console.error('Error loading PDF:', error);
        res.status(500).json({ 
            error: error.message || 'Failed to load PDF',
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Add endpoint to check graph status
router.get('/graph-status', async (req, res) => {
    try {
        // Check if we have documents in processing state
        let processingCount = 0;
        try {
            const client = await MongoClient.connect(url);
            const db = client.db(dbName);
            const collection = db.collection('graphDocuments');
            processingCount = await collection.countDocuments({ status: 'processing' });
            
            // Get document count
            const documentCount = await collection.countDocuments();
            
            // Get node and edge counts from our graph
            const nodeCount = graph.nodes.size;
            const edgeCount = graph.edges.size;
            const chunkCount = graph.chunks.size;
            
            await client.close();
            
            if (global.graphData) {
                res.json({
                    status: 'active',
                    documentCount,
                    processingCount,
                    nodeCount,
                    edgeCount,
                    chunkCount,
                    lastUpdated: global.graphData.createdAt || new Date()
                });
            } else {
                // Try to load from file
                try {
                    const graphDataPath = path.join(__dirname, '../data/graph.json');
                    const graphData = await fsPromises.readFile(graphDataPath, 'utf8');
                    global.graphData = JSON.parse(graphData);
                    
                    res.json({
                        status: 'active',
                        documentCount,
                        processingCount,
                        nodeCount,
                        edgeCount,
                        chunkCount: global.graphData.chunks.length,
                        lastUpdated: global.graphData.createdAt || new Date()
                    });
                } catch (error) {
                    logger.error('Error loading graph data from file:', error);
                    res.json({
                        status: 'initializing',
                        documentCount,
                        processingCount,
                        nodeCount,
                        edgeCount,
                        chunkCount: 0,
                        error: 'Graph data not loaded'
                    });
                }
            }
        } catch (dbError) {
            logger.error('Error connecting to MongoDB:', dbError);
            // If we can't connect to MongoDB, return what we can
            if (global.graphData) {
                res.json({
                    status: 'active',
                    documentCount: 0,
                    processingCount: 0,
                    nodeCount: graph.nodes.size,
                    edgeCount: graph.edges.size,
                    chunkCount: global.graphData.chunks.length,
                    lastUpdated: global.graphData.createdAt || new Date()
                });
            } else {
                res.json({
                    status: 'initializing',
                    documentCount: 0,
                    processingCount: 0,
                    nodeCount: 0,
                    edgeCount: 0,
                    chunkCount: 0,
                    error: 'Database connection failed'
                });
            }
        }
    } catch (error) {
        logger.error('Error in graph-status endpoint:', error);
        res.status(500).json({ 
            error: error.message,
            status: 'error'
        });
    }
});

// Export both router and openai
module.exports = router;
module.exports.openai = openai; 

router.post('/test-query', async (req, res) => {
    try {
        const { query } = req.body;
        console.log('Testing query:', query);

        // Get relevant chunks with scores
        const relevantChunks = await graph.getRelevantChunks(query);

        // Log the response
        console.log('Top 2 Relevant Chunks:', relevantChunks);

        res.status(200).json({ relevantChunks });
    } catch (error) {
        console.error('Error in test-query:', error);
        res.status(500).json({ error: 'Failed to process query', details: error.message });
    }
});