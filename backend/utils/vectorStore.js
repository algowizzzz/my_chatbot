require('dotenv').config();

const { Pinecone } = require('@pinecone-database/pinecone');
const { OpenAIEmbeddings } = require('@langchain/openai');
const { PineconeStore } = require('@langchain/pinecone');

class VectorStoreManager {
  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY not found in environment variables');
    }
    
    this.embeddings = new OpenAIEmbeddings({
      openAIApiKey: process.env.OPENAI_API_KEY
    });
  }

  async initialize() {
    if (!process.env.PINECONE_API_KEY) {
      throw new Error('PINECONE_API_KEY not found in environment variables');
    }

    const pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY
    });

    this.index = pinecone.Index(process.env.PINECONE_INDEX);
    return this;
  }

  async addDocumentChunks(documentId, chunks) {
    try {
      console.log('\n=== Processing Document Chunks ===');
      console.log(`Total chunks: ${chunks.length}`);

      const vectors = await Promise.all(
        chunks.map(async (chunk, i) => {
          console.log(`\nProcessing chunk ${i + 1}/${chunks.length}`);
          
          const embedding = await this.embeddings.embedQuery(chunk.content);
          
          // Clean and prepare metadata
          const metadata = {
            documentId: String(documentId),
            chunkIndex: String(i),
            pageNumber: String(chunk.metadata?.pageNumber || 1),
            section: String(chunk.metadata?.section || 'Main Content'),
            content: String(chunk.content || '').slice(0, 1000),
            context_previous: String(chunk.metadata?.context?.previous || ''),
            context_next: String(chunk.metadata?.context?.next || '')
          };

          console.log('Chunk metadata:', {
            section: metadata.section,
            pageNumber: metadata.pageNumber,
            hasContext: {
              previous: !!metadata.context_previous,
              next: !!metadata.context_next
            }
          });

          return {
            id: `${documentId}_${i}`,
            values: embedding,
            metadata
          };
        })
      );

      console.log('\n=== Upserting to Pinecone ===');
      await this.index.upsert(vectors);
      
      console.log('Successfully added vectors to Pinecone');
      return vectors.map(v => v.id);
    } catch (error) {
      console.error('Error in addDocumentChunks:', error);
      throw error;
    }
  }

  async semanticSearch(query, { maxResults = 5, filterDocumentId = null, minScore = 0.7 } = {}) {
    try {
      const queryEmbedding = await this.embeddings.embedQuery(query);
      
      const searchOptions = {
        vector: queryEmbedding,
        topK: maxResults,
        includeMetadata: true
      };

      if (filterDocumentId) {
        searchOptions.filter = { documentId: filterDocumentId };
      }

      const results = await this.index.query(searchOptions);
      
      return results.matches
        .filter(match => match.score > minScore)
        .map(match => ({
          content: match.metadata.content,
          score: match.score,
          metadata: {
            section: match.metadata.section,
            pageNumber: parseInt(match.metadata.pageNumber),
            context: {
              previous: match.metadata.context_previous,
              next: match.metadata.context_next
            }
          }
        }));
    } catch (error) {
      console.error('Error in semanticSearch:', error);
      throw error;
    }
  }

  async deleteDocument(documentId) {
    // Delete all vectors associated with the document
    await this.index.deleteMany({
      filter: {
        documentId: documentId
      }
    });
  }

  async getRelatedChunks(chunkId, maxResults = 3) {
    // Get the vector for the specified chunk
    const chunkVector = await this.index.fetch([chunkId]);
    
    if (!chunkVector.vectors[chunkId]) {
      throw new Error('Chunk not found');
    }

    // Find related chunks
    const results = await this.index.query({
      vector: chunkVector.vectors[chunkId].values,
      topK: maxResults + 1, // Add 1 to exclude the source chunk
      includeMetadata: true
    });

    // Remove the source chunk and return related chunks
    return results.matches
      .filter(match => match.id !== chunkId)
      .map(match => ({
        content: match.metadata.content,
        score: match.score,
        metadata: match.metadata
      }));
  }
}

// Export singleton instance
module.exports = new VectorStoreManager(); 