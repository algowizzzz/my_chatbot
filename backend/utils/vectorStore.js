const { Pinecone } = require('@pinecone-database/pinecone');
const { OpenAIEmbeddings } = require('@langchain/openai');
const { PineconeStore } = require('@langchain/pinecone');

async function initVectorStore() {
  const pinecone = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY,
  });

  const index = pinecone.Index(process.env.PINECONE_INDEX);
  
  return new PineconeStore(
    new OpenAIEmbeddings({ openAIApiKey: process.env.OPENAI_API_KEY }),
    { pineconeIndex: index }
  );
}

module.exports = { initVectorStore }; 