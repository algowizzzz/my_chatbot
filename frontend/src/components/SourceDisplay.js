import React, { useState } from 'react';
import { Collapse, Tooltip, Tag, Badge, Progress, Divider } from 'antd';
import { 
  FileTextOutlined, 
  DownOutlined, 
  RightOutlined, 
  TagsOutlined, 
  LinkOutlined, 
  InfoCircleOutlined,
  FileSearchOutlined,
  DatabaseOutlined
} from '@ant-design/icons';
import './SourceDisplay.css';

const { Panel } = Collapse;

/**
 * SourceDisplay component for showing source information and entity details
 * Used in chat responses for Graph RAG to display document sources and relevance
 */
const SourceDisplay = ({ metadata }) => {
  const [expanded, setExpanded] = useState(false);

  if (!metadata || !metadata.relevantChunks || metadata.relevantChunks.length === 0) {
    return null;
  }

  // Get unique documents from chunks and sort by relevance
  const documents = {};
  metadata.relevantChunks.forEach(chunk => {
    const docName = chunk.metadata?.documentName || 'Unknown';
    if (!documents[docName]) {
      documents[docName] = {
        name: docName,
        chunks: [],
        highRelevanceCount: 0,
        mediumRelevanceCount: 0,
        lowRelevanceCount: 0,
        totalScore: 0,
        pageNumbers: new Set(),
        uploadDate: chunk.metadata?.uploadDate
      };
    }
    
    documents[docName].chunks.push(chunk);
    documents[docName].totalScore += (chunk.scores?.total || 0);
    
    // Add page number to set of pages
    if (chunk.metadata?.pageNumber) {
      documents[docName].pageNumbers.add(chunk.metadata.pageNumber);
    }
    
    // Count by relevance category
    if (chunk.metadata?.relevanceCategory === 'high') {
      documents[docName].highRelevanceCount++;
    } else if (chunk.metadata?.relevanceCategory === 'medium') {
      documents[docName].mediumRelevanceCount++;
    } else {
      documents[docName].lowRelevanceCount++;
    }
  });
  
  // Calculate average score and sort documents by relevance
  const sortedDocuments = Object.values(documents).map(doc => {
    doc.averageScore = doc.totalScore / doc.chunks.length;
    doc.pageCount = doc.pageNumbers.size;
    return doc;
  }).sort((a, b) => b.averageScore - a.averageScore);

  // Get entities and relationships if available
  const entities = metadata.analysis?.topEntities || [];
  const relationships = metadata.analysis?.topRelationships || [];
  
  // Get source statistics
  const totalChunks = metadata.relevantChunks.length;
  const primaryChunks = metadata.relevantChunks.filter(chunk => 
    chunk.metadata?.relevanceCategory === 'high'
  ).length;
  
  // Calculate overall relevance score
  const overallScore = metadata.relevantChunks.reduce(
    (sum, chunk) => sum + (chunk.scores?.total || 0), 0
  ) / (totalChunks || 1);

  const getRelevanceColor = (score) => {
    if (score >= 0.85) return '#52c41a'; // green
    if (score >= 0.7) return '#faad14';  // yellow
    return '#ff4d4f';                    // red
  };

  const getRelevanceLabel = (category) => {
    switch (category) {
      case 'high': return 'High Relevance';
      case 'medium': return 'Medium Relevance';
      case 'low': return 'Low Relevance';
      default: return 'Unknown Relevance';
    }
  };

  const toggleExpand = () => {
    setExpanded(!expanded);
  };

  return (
    <div className="source-display">
      <div className="source-header" onClick={toggleExpand}>
        <div className="source-icon">
          {expanded ? <DownOutlined /> : <RightOutlined />}
        </div>
        <div className="source-title">
          <span>Source Analysis</span>
          <Tooltip title="Shows the sources, entities, and relationships used to generate this response">
            <InfoCircleOutlined className="info-icon" />
          </Tooltip>
        </div>
        <div className="source-summary">
          <Tooltip title={`${primaryChunks} primary chunks out of ${totalChunks} total chunks used`}>
            <span className="source-count">{primaryChunks}/{totalChunks}</span>
          </Tooltip>
        </div>
      </div>
      
      {expanded && (
        <div className="source-content">
          {/* Source Analysis Overview */}
          <div className="analysis-overview">
            <div className="relevance-overview">
              <div className="relevance-score-display">
                <Tooltip title="Overall relevance score of sources used">
                  <Progress 
                    type="circle" 
                    percent={Math.round(overallScore * 100)} 
                    width={60}
                    strokeColor={getRelevanceColor(overallScore)}
                    format={percent => `${percent}%`}
                  />
                </Tooltip>
                <span className="relevance-label">Relevance</span>
              </div>
              <div className="source-stats">
                <div className="stat-item">
                  <FileSearchOutlined />
                  <span><strong>{Object.keys(documents).length}</strong> documents</span>
                </div>
                <div className="stat-item">
                  <DatabaseOutlined />
                  <span><strong>{totalChunks}</strong> text chunks</span>
                </div>
              </div>
            </div>
          </div>
          
          <Divider style={{ margin: '12px 0' }} />
          
          {/* Document Sources */}
          <div className="source-section">
            <h4>Document Sources</h4>
            {sortedDocuments.map((doc, index) => (
              <div key={index} className="document-source">
                <div className="document-header">
                  <FileTextOutlined />
                  <span className="document-name">{doc.name}</span>
                  <div className="document-meta">
                    {doc.pageCount > 0 && (
                      <Tooltip title="Pages referenced">
                        <span className="page-count">
                          {Array.from(doc.pageNumbers).sort((a, b) => a - b).join(', ')}
                        </span>
                      </Tooltip>
                    )}
                    {doc.uploadDate && (
                      <Tooltip title="Document upload date">
                        <span className="upload-date">
                          {new Date(doc.uploadDate).toLocaleDateString()}
                        </span>
                      </Tooltip>
                    )}
                  </div>
                  <div className="relevance-counts">
                    <Tooltip title="Average relevance score">
                      <span className="avg-relevance-score" style={{ color: getRelevanceColor(doc.averageScore) }}>
                        {(doc.averageScore * 100).toFixed(1)}%
                      </span>
                    </Tooltip>
                    {doc.highRelevanceCount > 0 && (
                      <Tooltip title="High relevance chunks">
                        <Badge 
                          count={doc.highRelevanceCount} 
                          style={{ backgroundColor: '#52c41a' }} 
                        />
                      </Tooltip>
                    )}
                    {doc.mediumRelevanceCount > 0 && (
                      <Tooltip title="Medium relevance chunks">
                        <Badge 
                          count={doc.mediumRelevanceCount} 
                          style={{ backgroundColor: '#faad14' }} 
                        />
                      </Tooltip>
                    )}
                    {doc.lowRelevanceCount > 0 && (
                      <Tooltip title="Low relevance chunks">
                        <Badge 
                          count={doc.lowRelevanceCount} 
                          style={{ backgroundColor: '#ff4d4f' }} 
                        />
                      </Tooltip>
                    )}
                  </div>
                </div>
                
                <Collapse ghost className="chunks-collapse">
                  <Panel header={`${doc.chunks.length} chunks`} key="1">
                    {doc.chunks.map((chunk, chunkIndex) => (
                      <div key={chunkIndex} className="chunk-item">
                        <div className="chunk-header">
                          <Tooltip title={getRelevanceLabel(chunk.metadata?.relevanceCategory)}>
                            <div 
                              className="relevance-indicator" 
                              style={{ 
                                backgroundColor: getRelevanceColor(chunk.scores?.total || 0) 
                              }}
                            />
                          </Tooltip>
                          <div className="chunk-meta">
                            {chunk.metadata?.pageNumber && (
                              <span className="page-number">
                                Page {chunk.metadata.pageNumber}
                                {chunk.metadata.totalPages && `/${chunk.metadata.totalPages}`}
                              </span>
                            )}
                            {chunk.metadata?.section && (
                              <span className="section-name">
                                {chunk.metadata.section}
                              </span>
                            )}
                          </div>
                          {chunk.scores?.total !== undefined && (
                            <Tooltip title="Relevance score">
                              <span className="relevance-score">
                                {(chunk.scores.total * 100).toFixed(1)}%
                              </span>
                            </Tooltip>
                          )}
                        </div>
                        <div className="chunk-text">
                          {chunk.truncatedText || chunk.text}
                        </div>
                      </div>
                    ))}
                  </Panel>
                </Collapse>
              </div>
            ))}
          </div>
          
          {/* Entity Information */}
          {entities.length > 0 && (
            <div className="entity-section">
              <h4>Key Concepts</h4>
              <div className="entity-list">
                {entities.map((entity, index) => {
                  // Determine color based on entity type
                  let color = 'blue';
                  if (entity.type) {
                    const type = entity.type.toLowerCase();
                    if (type.includes('person') || type.includes('people')) color = 'purple';
                    else if (type.includes('organization') || type.includes('company')) color = 'orange';
                    else if (type.includes('location') || type.includes('place')) color = 'green';
                    else if (type.includes('date') || type.includes('time')) color = 'cyan';
                    else if (type.includes('concept') || type.includes('topic')) color = 'magenta';
                  }
                  
                  return (
                    <Tooltip 
                      key={index} 
                      title={
                        <div>
                          <div><strong>Type:</strong> {entity.type || 'Unknown'}</div>
                          {entity.relevance && <div><strong>Relevance:</strong> {(entity.relevance * 100).toFixed(1)}%</div>}
                          {entity.description && <div><strong>Description:</strong> {entity.description}</div>}
                        </div>
                      }
                    >
                      <Tag icon={<TagsOutlined />} color={color}>
                        {entity.text}
                        {entity.frequency && (
                          <span className="entity-frequency"> ({entity.frequency})</span>
                        )}
                      </Tag>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          )}
          
          {/* Relationship Information */}
          {relationships.length > 0 && (
            <div className="relationship-section">
              <h4>Key Relationships</h4>
              <div className="relationship-list">
                {relationships.map((rel, index) => (
                  <div key={index} className="relationship-item">
                    <Tooltip title={rel.confidence ? `Confidence: ${(rel.confidence * 100).toFixed(1)}%` : ''}>
                      <div className="relationship-content">
                        <Tag color="blue">{rel.subject}</Tag>
                        <LinkOutlined className="relationship-arrow" />
                        <Tag color="volcano">{rel.predicate}</Tag>
                        <LinkOutlined className="relationship-arrow" />
                        <Tag color="green">{rel.object}</Tag>
                      </div>
                    </Tooltip>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SourceDisplay;
