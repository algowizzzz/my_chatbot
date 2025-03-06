const { OpenAI } = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function analyzeEntities(chunks) {
  try {
    // Combine all chunk contents
    const combinedText = chunks.map(chunk => chunk.content).join('\n\n');
    
    const messages = [
      {
        role: 'system',
        content: `Analyze the following text and extract:
        1. Key entities (people, organizations, concepts, technologies)
        2. Important relationships between entities
        3. Frequency of entity mentions
        Return the analysis in JSON format with these fields:
        {
          "entities": [{"name": string, "type": string, "frequency": number}],
          "relationships": [{"entity1": string, "relationship": string, "entity2": string, "frequency": number}]
        }`
      },
      {
        role: 'user',
        content: combinedText
      }
    ];

    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages,
      temperature: 0.3,
      response_format: { type: "json_object" }
    });

    const analysis = JSON.parse(response.choices[0].message.content);
    
    // Sort entities and relationships by frequency
    analysis.entities.sort((a, b) => b.frequency - a.frequency);
    analysis.relationships.sort((a, b) => b.frequency - a.frequency);

    return analysis;
  } catch (error) {
    console.error('Error in entity analysis:', error);
    return {
      entities: [],
      relationships: []
    };
  }
}

module.exports = {
  analyzeEntities
};
