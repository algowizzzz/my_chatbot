const express = require('express');
const router = express.Router();
const natural = require('natural');  // We'll use this for basic NLP
const { OpenAI } = require('openai');
const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');
const { MongoClient } = require('mongodb');  // Add this at the top
const chunkSelection = require('../utils/chunkSelection');
const winston = require('winston');
const fsPromises = require('fs').promises;

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

// Simple graph structure
class KnowledgeGraph {
    constructor() {
        this.nodes = new Map();  // Store entities
        this.edges = new Map();  // Store relationships
        this.chunks = new Map(); // Store chunk_id -> text mapping
        this.relationships = new Map();
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
        return Array.from(relevantChunks);
    }
}

const graph = new KnowledgeGraph();

// Add MongoDB connection info
const url = 'mongodb://localhost:27017';
const dbName = 'graphrag';

// Add the saveGraphToDb function
async function saveGraphToDb() {
    try {
        console.log('Connecting to MongoDB...');
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
        console.log('Storing data...');
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

        console.log('Graph saved successfully');
        await client.close();
        return true;
    } catch (error) {
        console.error('Error saving to database:', error);
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

async function extractEntitiesAndRelations(text) {
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

            const { entities, relationships } = await extractEntitiesAndRelations(chunk);

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
        console.log('Starting discover.pdf processing...');
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
                const { entities, relationships } = await extractEntitiesAndRelations(chunk);
                console.log(`Found ${entities.length} entities and ${relationships.length} relationships in chunk ${chunkId}`);

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
        console.log('Starting test.txt processing...');
        const filePath = path.join(__dirname, '..', 'test.txt');
        const content = await fsPromises.readFile(filePath, 'utf8');
        
        // Split into chunks
        console.log('Splitting into chunks...');
        const chunks = content.split('\n\n').filter(chunk => chunk.trim());
        console.log(`Created ${chunks.length} chunks`);
        
        // Process each chunk through our graph
        for (let chunkId = 0; chunkId < chunks.length; chunkId++) {
            console.log(`Processing chunk ${chunkId + 1}/${chunks.length}`);
            const chunk = chunks[chunkId];
            
            // Skip empty chunks
            if (!chunk.trim()) {
                console.log(`Skipping empty chunk ${chunkId}`);
                continue;
            }

            graph.chunks.set(chunkId, chunk);

            try {
                const { entities, relationships } = await extractEntitiesAndRelations(chunk);
                console.log(`Found ${entities.length} entities and ${relationships.length} relationships in chunk ${chunkId}`);

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
            message: 'test.txt processed successfully',
            entityCount: graph.nodes.size,
            relationshipCount: graph.relationships.size,
            chunks: graph.chunks.size
        });
    } catch (error) {
        console.error('Error processing test.txt:', error);
        res.status(500).json({ error: 'Failed to process test.txt' });
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
                const { entities, relationships } = await extractEntitiesAndRelations(chunk);
                console.log(`Found ${entities.length} entities and ${relationships.length} relationships in chunk ${chunkId}`);

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
                const { entities, relationships } = await extractEntitiesAndRelations(chunk);
                console.log(`Found ${entities.length} entities and ${relationships.length} relationships in chunk ${chunkId}`);

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
                .answer ul {
                    margin: 0;
                    padding-left: 20px;
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

                // Create force directed graph
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
                    .enter().append("text")
                    .attr("class", "link-label")
                    .text(d => d.label);

                // Draw nodes
                const node = svg.append("g")
                    .selectAll("circle")
                    .data(graphData.nodes)
                    .enter().append("g")
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
            <title>LCH Knowledge Graph</title>
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
                    line-height: 1.6;
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

// Update test-query endpoint to use actual graph data
router.post('/test-query', async (req, res) => {
    try {
        const { query, config } = req.body;
        
        if (!query) {
            return res.status(400).json({ error: 'Query is required' });
        }

        // Check if graph data exists
        if (!global.graphData || !global.graphData.chunks) {
            // Try to load graph data
            try {
                const graphDataPath = path.join(__dirname, '../data/graph.json');
                const graphData = await fsPromises.readFile(graphDataPath, 'utf8');
                global.graphData = JSON.parse(graphData);
            } catch (error) {
                return res.status(400).json({ 
                    error: 'Graph data not loaded. Please load the graph first.'
                });
            }
        }

        // Get embeddings for the query
        const queryEmbedding = await openai.embeddings.create({
            model: "text-embedding-ada-002",
            input: query
        });

        // Calculate similarity scores for each chunk
        const scoredChunks = await Promise.all(
            global.graphData.chunks.map(async (chunk, index) => {
                // Calculate semantic similarity
                const similarity = cosineSimilarity(
                    queryEmbedding.data[0].embedding,
                    chunk.embedding
                );

                // Calculate entity score
                const entityScore = calculateEntityScore(query, chunk.entities);

                // Calculate final score using weights
                const totalScore = (
                    similarity * config.chunkSelection.scoreWeights.semantic.value +
                    entityScore * config.chunkSelection.scoreWeights.entity.value
                );

                return {
                    text: chunk.text,
                    score: totalScore,
                    similarity,
                    entityScore,
                    index
                };
            })
        );

        // Sort and get top chunks
        const topChunks = scoredChunks
            .sort((a, b) => b.score - a.score)
            .slice(0, config.chunkSelection.maxChunks.value);

        // Generate context from top chunks
        const context = topChunks
            .map(chunk => chunk.text)
            .join('\n\n');

        // Get response from GPT
        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                {
                    role: "system",
                    content: `You are a helpful assistant specializing in LCH Clearnet documentation. 
                             Use the provided context to answer questions accurately and concisely. 
                             If you're not sure about something, say so.`
                },
                {
                    role: "user",
                    content: `Context: ${context}\n\nQuestion: ${query}`
                }
            ],
            temperature: 0.7,
            max_tokens: 500
        });

        res.json({
            answer: completion.choices[0].message.content,
            relevantChunks: topChunks.map(chunk => ({
                text: chunk.text,
                score: chunk.score,
                similarity: chunk.similarity,
                entityScore: chunk.entityScore
            })),
            metadata: {
                totalChunks: global.graphData.chunks.length,
                processedAt: new Date().toISOString(),
                configUsed: config
            }
        });

    } catch (error) {
        console.error('Error in test query:', error);
        res.status(500).json({ 
            error: error.message || 'Internal server error',
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
        if (global.graphData) {
            res.json({
                loaded: true,
                stats: {
                    totalChunks: global.graphData.chunks.length,
                    createdAt: global.graphData.createdAt
                }
            });
        } else {
            // Try to load from file
            try {
                const graphDataPath = path.join(__dirname, '../data/graph.json');
                const graphData = await fsPromises.readFile(graphDataPath, 'utf8');
                global.graphData = JSON.parse(graphData);
                res.json({
                    loaded: true,
                    stats: {
                        totalChunks: global.graphData.chunks.length,
                        createdAt: global.graphData.createdAt
                    }
                });
            } catch (error) {
                res.json({
                    loaded: false,
                    error: 'Graph data not loaded'
                });
            }
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Export both router and openai
module.exports = router;
module.exports.openai = openai; 