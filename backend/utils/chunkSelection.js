const { OpenAI } = require('openai');
const graphRag = require('../routes/graphRag');

// Use either the passed instance or create new
const openai = graphRag.openai || new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Cosine similarity helper
function cosineSimilarity(embedding1, embedding2) {
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;
    
    for (let i = 0; i < embedding1.length; i++) {
        dotProduct += embedding1[i] * embedding2[i];
        norm1 += embedding1[i] * embedding1[i];
        norm2 += embedding2[i] * embedding2[i];
    }
    
    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
}

// Calculate overlap between two arrays
function calculateOverlap(arr1, arr2) {
    const set1 = new Set(arr1.map(s => s.toLowerCase()));
    const set2 = new Set(arr2.map(s => s.toLowerCase()));
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    return intersection.size / Math.max(set1.size, set2.size);
}

// Extract entities helper - Using chat completions correctly
async function extractEntities(text) {
    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                {
                    role: "system",
                    content: "Extract key entities from the text. Return as array."
                },
                {
                    role: "user",
                    content: text
                }
            ],
            temperature: 0.3,
        });
        
        try {
            return JSON.parse(completion.choices[0].message.content);
        } catch (e) {
            return completion.choices[0].message.content.split(',').map(e => e.trim());
        }
    } catch (error) {
        console.error('Error extracting entities:', error);
        return [];
    }
}

// Update the entity match score calculation
async function calculateEntityMatchScore(query, chunkId, graph) {
    try {
        // Await the entity extraction
        const queryEntities = await extractEntities(query);
        console.log('Query entities:', queryEntities);
        
        const chunkEntities = Array.from(graph.nodes.entries())
            .filter(([_, nodeData]) => nodeData.connectedChunks.has(chunkId))
            .map(([entity]) => entity);
        console.log('Chunk entities:', chunkEntities);
        
        const score = calculateOverlap(queryEntities, chunkEntities);
        console.log('Entity match score:', score);
        
        return score;
    } catch (error) {
        console.error('Error calculating entity match score:', error);
        return 0;
    }
}

// Update relationship score calculation to be more impactful
function calculateRelationshipScore(chunkId, graph) {
    try {
        const connectedEntities = Array.from(graph.nodes.entries())
            .filter(([_, nodeData]) => nodeData.connectedChunks.has(chunkId));
        
        const score = connectedEntities.reduce((score, [entity, nodeData]) => {
            // Increase impact of relationships
            return score + (nodeData.relationships.size * 0.2);  // Increased from 0.1
        }, 0);
        
        console.log('Relationship score for chunk', chunkId, ':', score);
        return score;
    } catch (error) {
        console.error('Error calculating relationship score:', error);
        return 0;
    }
}

function calculatePositionScore(chunkId, graph) {
    return 1 - (chunkId / graph.chunks.size);
}

async function selectRelevantChunks(query, graph, maxChunks = 5) {
    console.log('Selecting relevant chunks for query:', query);
    
    try {
        // Get query embedding - Using embeddings correctly
        const queryEmbeddingResponse = await openai.embeddings.create({
            input: query,
            model: "text-embedding-ada-002"
        });
        
        const queryEmbedding = queryEmbeddingResponse.data[0].embedding;

        // Score chunks
        const scoredChunks = await Promise.all(
            Array.from(graph.chunks.entries()).map(async ([chunkId, text]) => {
                console.log('Scoring chunk', chunkId);
                
                // Get chunk embedding
                const chunkEmbeddingResponse = await openai.embeddings.create({
                    input: text,
                    model: "text-embedding-ada-002"
                });
                
                const chunkEmbedding = chunkEmbeddingResponse.data[0].embedding;

                // Calculate scores
                const scores = {
                    semantic: cosineSimilarity(queryEmbedding, chunkEmbedding),
                    entityScore: await calculateEntityMatchScore(query, chunkId, graph),
                    relationshipScore: calculateRelationshipScore(chunkId, graph),
                    positionScore: calculatePositionScore(chunkId, graph)
                };

                // Updated weights to give more importance to entities and relationships
                const totalScore = (
                    scores.semantic * 0.3 +          // Reduced from 0.4
                    scores.entityScore * 0.4 +       // Increased from 0.3
                    scores.relationshipScore * 0.2 +  // Same
                    scores.positionScore * 0.1        // Same
                );

                console.log('Chunk', chunkId, 'scores:', scores);

                return {
                    chunkId,
                    text,
                    scores,
                    totalScore
                };
            })
        );

        // Return top chunks
        return scoredChunks
            .sort((a, b) => b.totalScore - a.totalScore)
            .slice(0, maxChunks);
    } catch (error) {
        console.error('Error in selectRelevantChunks:', error);
        throw error;
    }
}

// Add a test function
async function testOpenAI() {
    try {
        const response = await openai.embeddings.create({
            input: "test",
            model: "text-embedding-ada-002"
        });
        console.log('OpenAI test successful:', response.data[0].embedding.length);
    } catch (error) {
        console.error('OpenAI test failed:', error);
    }
}

// Call test on module load
testOpenAI();

module.exports = {
    selectRelevantChunks,
    calculateEntityMatchScore,
    calculateRelationshipScore,
    calculatePositionScore
};
