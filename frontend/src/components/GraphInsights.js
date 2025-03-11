import React, { useState, useEffect } from 'react';
import GraphVisualization from './GraphVisualization';
import './GraphInsights.css';

const GraphInsights = ({ query, onClose }) => {
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchInsights = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/graph/insights', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to fetch insights');
        }

        const data = await response.json();
        setInsights(data);
        setError(null);
      } catch (err) {
        console.error('Error fetching insights:', err);
        setError(err.message || 'Failed to fetch insights');
      } finally {
        setLoading(false);
      }
    };

    if (query) {
      fetchInsights();
    }
  }, [query]);

  // Format number to 2 decimal places
  const formatNumber = (num) => {
    return Number(num).toFixed(2);
  };

  // Format time in ms to readable format
  const formatTime = (ms) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  // Get color based on score
  const getScoreColor = (score) => {
    if (score >= 0.85) return 'high-relevance';
    if (score >= 0.7) return 'medium-relevance';
    return 'low-relevance';
  };

  if (loading) {
    return (
      <div className="graph-insights-container">
        <div className="insights-header">
          <h2>Graph RAG Analysis</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Analyzing query and generating insights...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="graph-insights-container">
        <div className="insights-header">
          <h2>Graph RAG Analysis</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>
        <div className="error-container">
          <h3>Error</h3>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!insights) {
    return null;
  }

  // Prepare data for graph visualization
  const prepareGraphData = () => {
    if (!insights) return { entities: [], relationships: [] };
    
    // Extract entities from top chunks
    const entities = [];
    const entityMap = new Map();
    
    // Process entities from top chunks
    if (insights.topChunks) {
      insights.topChunks.forEach(chunk => {
        if (chunk.entities) {
          chunk.entities.forEach(entity => {
            if (!entityMap.has(entity)) {
              const entityObj = {
                id: entity,
                name: entity,
                relevance: chunk.scores.total
              };
              entityMap.set(entity, entityObj);
              entities.push(entityObj);
            }
          });
        }
      });
    }
    
    // Add query entities with higher relevance
    if (insights.queryEntities) {
      insights.queryEntities.forEach(entity => {
        if (!entityMap.has(entity)) {
          const entityObj = {
            id: entity,
            name: entity,
            relevance: 1.0,
            type: 'query'
          };
          entityMap.set(entity, entityObj);
          entities.push(entityObj);
        } else {
          // Update existing entity to mark as query entity
          const existingEntity = entityMap.get(entity);
          existingEntity.type = 'query';
          existingEntity.relevance = Math.max(existingEntity.relevance, 0.9);
        }
      });
    }
    
    // Create relationships based on co-occurrence in chunks
    const relationships = [];
    const relationshipMap = new Map();
    
    if (insights.topChunks) {
      insights.topChunks.forEach(chunk => {
        if (chunk.entities && chunk.entities.length > 1) {
          // Create relationships between all entities in the chunk
          for (let i = 0; i < chunk.entities.length; i++) {
            for (let j = i + 1; j < chunk.entities.length; j++) {
              const source = chunk.entities[i];
              const target = chunk.entities[j];
              const relKey = `${source}|${target}`;
              const reverseRelKey = `${target}|${source}`;
              
              if (!relationshipMap.has(relKey) && !relationshipMap.has(reverseRelKey)) {
                const relationship = {
                  source,
                  target,
                  weight: chunk.scores.total
                };
                relationshipMap.set(relKey, relationship);
                relationships.push(relationship);
              } else {
                // Update weight if relationship already exists
                const existingRel = relationshipMap.get(relKey) || relationshipMap.get(reverseRelKey);
                existingRel.weight = Math.max(existingRel.weight, chunk.scores.total);
              }
            }
          }
        }
      });
    }
    
    // Add relationships from query entities to top entities
    if (insights.queryEntities && insights.topEntities) {
      insights.queryEntities.forEach(queryEntity => {
        insights.topEntities.slice(0, 5).forEach(topEntity => {
          if (queryEntity !== topEntity.entity) {
            const relKey = `${queryEntity}|${topEntity.entity}`;
            const reverseRelKey = `${topEntity.entity}|${queryEntity}`;
            
            if (!relationshipMap.has(relKey) && !relationshipMap.has(reverseRelKey)) {
              const relationship = {
                source: queryEntity,
                target: topEntity.entity,
                weight: 0.8,
                type: 'query-related'
              };
              relationshipMap.set(relKey, relationship);
              relationships.push(relationship);
            }
          }
        });
      });
    }
    
    return { entities, relationships };
  };
  
  const handleEntityClick = (entity) => {
    console.log('Entity clicked:', entity);
    // Could implement highlighting related chunks or filtering
  };

  return (
    <div className="graph-insights-container">
      <div className="insights-header">
        <h2>Graph RAG Analysis</h2>
        <button className="close-button" onClick={onClose}>×</button>
      </div>
      
      <div className="insights-content">
        <div className="insights-section query-section">
          <h3>Query Analysis</h3>
          <div className="query-text">"{query}"</div>
          
          <div className="query-metadata">
            <div className="metadata-item">
              <span className="metadata-label">Processing Time:</span>
              <span className="metadata-value">{formatTime(insights.timings.total)}</span>
            </div>
            <div className="metadata-item">
              <span className="metadata-label">Embedding Time:</span>
              <span className="metadata-value">{formatTime(insights.timings.embedding)}</span>
            </div>
            <div className="metadata-item">
              <span className="metadata-label">Scoring Time:</span>
              <span className="metadata-value">{formatTime(insights.timings.scoring)}</span>
            </div>
          </div>
          
          {insights.queryEntities && insights.queryEntities.length > 0 && (
            <div className="query-entities">
              <h4>Detected Entities</h4>
              <div className="entity-tags">
                {insights.queryEntities.map((entity, index) => (
                  <span key={index} className="entity-tag">{entity}</span>
                ))}
              </div>
            </div>
          )}
        </div>
        
        <div className="insights-section document-stats-section">
          <h3>Document Statistics</h3>
          <div className="document-stats-grid">
            {Object.entries(insights.documentStats).map(([docName, stats]) => (
              <div key={docName} className="document-stat-card">
                <h4 className="document-name">{docName}</h4>
                <div className="document-stat-content">
                  <div className="stat-item">
                    <span className="stat-label">Average Score:</span>
                    <span className={`stat-value ${getScoreColor(stats.averageScore)}`}>
                      {formatNumber(stats.averageScore)}
                    </span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Chunks:</span>
                    <span className="stat-value">{stats.chunkCount}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">High Relevance:</span>
                    <span className="stat-value high-relevance">{stats.highRelevanceCount}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Medium Relevance:</span>
                    <span className="stat-value medium-relevance">{stats.mediumRelevanceCount}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Low Relevance:</span>
                    <span className="stat-value low-relevance">{stats.lowRelevanceCount}</span>
                  </div>
                  {stats.pages && stats.pages.length > 0 && (
                    <div className="stat-item">
                      <span className="stat-label">Pages Referenced:</span>
                      <span className="stat-value">{stats.pages.join(', ')}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
        
        <div className="insights-section relevance-section">
          <h3>Relevance Distribution</h3>
          <div className="relevance-bars">
            <div className="relevance-bar-container">
              <div className="relevance-label">High Relevance</div>
              <div className="relevance-bar">
                <div 
                  className="relevance-bar-fill high-relevance" 
                  style={{ 
                    width: `${(insights.relevanceCounts.high / insights.chunkCount) * 100}%` 
                  }}
                ></div>
              </div>
              <div className="relevance-count">{insights.relevanceCounts.high}</div>
            </div>
            <div className="relevance-bar-container">
              <div className="relevance-label">Medium Relevance</div>
              <div className="relevance-bar">
                <div 
                  className="relevance-bar-fill medium-relevance" 
                  style={{ 
                    width: `${(insights.relevanceCounts.medium / insights.chunkCount) * 100}%` 
                  }}
                ></div>
              </div>
              <div className="relevance-count">{insights.relevanceCounts.medium}</div>
            </div>
            <div className="relevance-bar-container">
              <div className="relevance-label">Low Relevance</div>
              <div className="relevance-bar">
                <div 
                  className="relevance-bar-fill low-relevance" 
                  style={{ 
                    width: `${(insights.relevanceCounts.low / insights.chunkCount) * 100}%` 
                  }}
                ></div>
              </div>
              <div className="relevance-count">{insights.relevanceCounts.low}</div>
            </div>
          </div>
        </div>
        
        <div className="insights-section top-entities-section">
          <h3>Top Entities</h3>
          <div className="top-entities-grid">
            {insights.topEntities.map((entity, index) => (
              <div key={index} className="entity-card">
                <div className="entity-name">{entity.entity}</div>
                <div className="entity-count">{entity.count} occurrences</div>
              </div>
            ))}
          </div>
        </div>
        
        <div className="insights-section graph-visualization-section">
          <h3>Knowledge Graph Visualization</h3>
          <p className="graph-description">Interactive visualization of entities and their relationships. Drag nodes to explore connections.</p>
          {insights && (
            <GraphVisualization 
              {...prepareGraphData()} 
              onEntityClick={handleEntityClick} 
            />
          )}
        </div>
        
        <div className="insights-section top-chunks-section">
          <h3>Top Chunks</h3>
          <div className="top-chunks-list">
            {insights.topChunks.map((chunk, index) => (
              <div key={index} className={`chunk-card ${getScoreColor(chunk.scores.total)}`}>
                <div className="chunk-header">
                  <div className="chunk-source">
                    {chunk.metadata.documentName} 
                    {chunk.metadata.pageNumber > 0 && ` (Page ${chunk.metadata.pageNumber})`}
                  </div>
                  <div className="chunk-score">
                    Score: {formatNumber(chunk.scores.total)}
                  </div>
                </div>
                <div className="chunk-text">{chunk.truncatedText}</div>
                <div className="chunk-scores">
                  <div className="chunk-score-item">
                    <span className="score-label">Semantic:</span>
                    <span className="score-value">{formatNumber(chunk.scores.semantic)}</span>
                  </div>
                  <div className="chunk-score-item">
                    <span className="score-label">Entity:</span>
                    <span className="score-value">{formatNumber(chunk.scores.entity)}</span>
                  </div>
                  <div className="chunk-score-item">
                    <span className="score-label">Relationship:</span>
                    <span className="score-value">{formatNumber(chunk.scores.relationship)}</span>
                  </div>
                </div>
                {chunk.entities && chunk.entities.length > 0 && (
                  <div className="chunk-entities">
                    <span className="entities-label">Entities:</span>
                    <div className="entity-tags">
                      {chunk.entities.map((entity, entityIndex) => (
                        <span key={entityIndex} className="entity-tag">{entity}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GraphInsights;
