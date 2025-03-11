/**
 * Entity and relationship extraction utilities for Graph RAG
 * This module provides functions to extract entities and relationships from text
 */

const natural = require('natural');
const tokenizer = new natural.WordTokenizer();
const winston = require('winston');
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/entity-extraction.log' })
  ]
});

// Common stop words to filter out
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'because', 'as', 'what', 'which',
  'this', 'that', 'these', 'those', 'then', 'just', 'so', 'than', 'such', 'both',
  'through', 'about', 'for', 'is', 'of', 'while', 'during', 'to', 'from', 'in',
  'on', 'by', 'at', 'with', 'between', 'after', 'before', 'without', 'under',
  'over', 'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where',
  'why', 'how', 'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other',
  'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too',
  'very', 's', 't', 'can', 'will', 'don', 'should', 'now', 'i', 'me', 'my',
  'myself', 'we', 'our', 'ours', 'ourselves', 'you', 'your', 'yours', 'yourself',
  'yourselves', 'he', 'him', 'his', 'himself', 'she', 'her', 'hers', 'herself',
  'it', 'its', 'itself', 'they', 'them', 'their', 'theirs', 'themselves', 'am',
  'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'having',
  'do', 'does', 'did', 'doing', 'would', 'could', 'should', 'ought', 'i\'m',
  'you\'re', 'he\'s', 'she\'s', 'it\'s', 'we\'re', 'they\'re', 'i\'ve', 'you\'ve',
  'we\'ve', 'they\'ve', 'i\'d', 'you\'d', 'he\'d', 'she\'d', 'we\'d', 'they\'d',
  'i\'ll', 'you\'ll', 'he\'ll', 'she\'ll', 'we\'ll', 'they\'ll', 'isn\'t', 'aren\'t',
  'wasn\'t', 'weren\'t', 'hasn\'t', 'haven\'t', 'hadn\'t', 'doesn\'t', 'don\'t',
  'didn\'t', 'won\'t', 'wouldn\'t', 'shan\'t', 'shouldn\'t', 'can\'t', 'cannot',
  'couldn\'t', 'mustn\'t', 'let\'s', 'that\'s', 'who\'s', 'what\'s', 'here\'s',
  'there\'s', 'when\'s', 'where\'s', 'why\'s', 'how\'s'
]);

/**
 * Extract potential entities from text using NLP techniques
 * @param {string} text - The text to extract entities from
 * @returns {Array<string>} - Array of extracted entities
 */
function extractEntities(text) {
  try {
    if (!text || typeof text !== 'string') {
      return [];
    }
    
    // Tokenize the text
    const tokens = tokenizer.tokenize(text);
    
    // Filter out stop words and short words
    const filteredTokens = tokens.filter(token => 
      !STOP_WORDS.has(token.toLowerCase()) && 
      token.length > 2 &&
      /^[a-zA-Z0-9]+$/.test(token) // Only alphanumeric
    );
    
    // Extract noun phrases (simple implementation)
    const nounPhrases = [];
    let currentPhrase = [];
    
    for (let i = 0; i < filteredTokens.length; i++) {
      const token = filteredTokens[i];
      
      // Check if token starts with uppercase (potential proper noun)
      if (token[0] === token[0].toUpperCase() && token !== token.toUpperCase()) {
        currentPhrase.push(token);
      } else {
        // End of noun phrase
        if (currentPhrase.length > 0) {
          nounPhrases.push(currentPhrase.join(' '));
          currentPhrase = [];
        }
        
        // Add individual nouns (simplified approach)
        if (token.length > 3) {
          nounPhrases.push(token);
        }
      }
    }
    
    // Add the last phrase if exists
    if (currentPhrase.length > 0) {
      nounPhrases.push(currentPhrase.join(' '));
    }
    
    // Remove duplicates and return
    return [...new Set(nounPhrases)];
  } catch (error) {
    logger.error('Error extracting entities:', error);
    return [];
  }
}

/**
 * Extract potential relationships between entities
 * @param {string} text - The text to extract relationships from
 * @param {Array<string>} entities - Previously extracted entities
 * @returns {Array<Object>} - Array of relationship objects {subject, predicate, object}
 */
function extractRelationships(text, entities) {
  try {
    if (!text || !entities || entities.length < 2) {
      return [];
    }
    
    const relationships = [];
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    
    for (const sentence of sentences) {
      // Find entities in this sentence
      const entitiesInSentence = entities.filter(entity => 
        sentence.toLowerCase().includes(entity.toLowerCase())
      );
      
      if (entitiesInSentence.length >= 2) {
        // Find pairs of entities
        for (let i = 0; i < entitiesInSentence.length; i++) {
          for (let j = i + 1; j < entitiesInSentence.length; j++) {
            const subject = entitiesInSentence[i];
            const object = entitiesInSentence[j];
            
            // Extract the text between the two entities
            const subjectIndex = sentence.toLowerCase().indexOf(subject.toLowerCase());
            const objectIndex = sentence.toLowerCase().indexOf(object.toLowerCase());
            
            if (subjectIndex < objectIndex) {
              const middle = sentence.substring(
                subjectIndex + subject.length, 
                objectIndex
              ).trim();
              
              // Simple verb extraction (very basic)
              const verbs = middle.split(' ')
                .filter(word => word.length > 2 && !STOP_WORDS.has(word.toLowerCase()));
              
              if (verbs.length > 0) {
                relationships.push({
                  subject,
                  predicate: verbs.join(' '),
                  object
                });
              } else {
                relationships.push({
                  subject,
                  predicate: 'related to',
                  object
                });
              }
            } else {
              // Handle case where object appears before subject
              const middle = sentence.substring(
                objectIndex + object.length, 
                subjectIndex
              ).trim();
              
              const verbs = middle.split(' ')
                .filter(word => word.length > 2 && !STOP_WORDS.has(word.toLowerCase()));
              
              if (verbs.length > 0) {
                relationships.push({
                  subject: object,
                  predicate: verbs.join(' '),
                  object: subject
                });
              } else {
                relationships.push({
                  subject: object,
                  predicate: 'related to',
                  object: subject
                });
              }
            }
          }
        }
      }
    }
    
    return relationships;
  } catch (error) {
    logger.error('Error extracting relationships:', error);
    return [];
  }
}

/**
 * Extract both entities and relationships from text
 * @param {string} text - The text to analyze
 * @returns {Object} - Object containing entities and relationships
 */
async function extractEntitiesAndRelations(text) {
  try {
    const entities = extractEntities(text);
    const relationships = extractRelationships(text, entities);
    
    return {
      entities,
      relationships
    };
  } catch (error) {
    logger.error('Error in extractEntitiesAndRelations:', error);
    return {
      entities: [],
      relationships: []
    };
  }
}

module.exports = {
  extractEntities,
  extractRelationships,
  extractEntitiesAndRelations
};
