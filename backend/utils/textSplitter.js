const { RecursiveCharacterTextSplitter } = require('langchain/text_splitter');

class DocumentProcessor {
  constructor() {
    this.splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 500,
      chunkOverlap: 50,
      separators: ["\n\n", "\n", ".", "!", "?", ",", " ", ""],
    });
  }

  async processDocument(content, metadata = {}) {
    try {
      console.log('Processing document...');
      
      const chunks = await this.splitter.createDocuments([content]);
      
      const processedChunks = chunks.map((chunk, index) => {
        // Get previous and next chunks for context
        const previousChunk = index > 0 ? chunks[index - 1].pageContent : '';
        const nextChunk = index < chunks.length - 1 ? chunks[index + 1].pageContent : '';

        return {
          content: chunk.pageContent,
          index: index,
          metadata: {
            pageNumber: Math.floor(index / 2) + 1,
            section: this.detectSection(chunk.pageContent) || 'Main Content',
            context: {
              previous: this.summarizeChunk(previousChunk),
              next: this.summarizeChunk(nextChunk)
            }
          }
        };
      });

      return {
        chunks: processedChunks,
        metadata: {
          totalChunks: processedChunks.length,
          averageChunkSize: this.calculateAverageChunkSize(processedChunks)
        }
      };
    } catch (error) {
      console.error('Error processing document:', error);
      throw error;
    }
  }

  summarizeChunk(text) {
    if (!text) return '';
    // Take first 100 characters as a summary
    return text.slice(0, 100).trim();
  }

  detectSection(text) {
    const lines = text.split('\n');
    const possibleHeader = lines[0].trim();
    if (possibleHeader.length < 100 && (possibleHeader.endsWith(':') || possibleHeader.toUpperCase() === possibleHeader)) {
      return possibleHeader;
    }
    return 'Main Content';
  }

  calculateAverageChunkSize(chunks) {
    const total = chunks.reduce((sum, chunk) => sum + chunk.content.length, 0);
    return Math.round(total / chunks.length);
  }

  analyzeDocumentStructure(chunks) {
    const structure = {
      chapters: []
    };

    let currentChapter = null;
    chunks.forEach((chunk, index) => {
      if (this.detectSection(chunk.content) !== 'Main Content') {
        if (currentChapter) {
          currentChapter.endChunk = index - 1;
          structure.chapters.push(currentChapter);
        }
        currentChapter = {
          title: this.detectSection(chunk.content),
          startChunk: index
        };
      }
    });

    if (currentChapter) {
      currentChapter.endChunk = chunks.length - 1;
      structure.chapters.push(currentChapter);
    }

    return structure;
  }
}

module.exports = new DocumentProcessor(); 