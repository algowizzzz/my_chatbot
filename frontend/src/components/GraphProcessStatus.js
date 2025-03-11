import React, { useState, useEffect } from 'react';
import { Card, Statistic, Badge, Tooltip, Spin } from 'antd';
import { DatabaseOutlined, FileTextOutlined, TagsOutlined } from '@ant-design/icons';
import './GraphProcessStatus.css';

/**
 * GraphProcessStatus component displays the current status of the Graph RAG system
 * Shows statistics about loaded documents, chunks, and entities
 */
const GraphProcessStatus = () => {
  const [graphStatus, setGraphStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchGraphStatus();
    // Poll for status updates every 30 seconds
    const intervalId = setInterval(fetchGraphStatus, 30000);
    
    return () => clearInterval(intervalId);
  }, []);

  const fetchGraphStatus = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/graph/graph-status').catch(error => {
        console.error('Network error:', error);
        throw new Error('Network error when fetching graph status');
      });
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error(`Server error: ${response.status}`, errorText);
        throw new Error(`Failed to fetch graph status: ${response.status}`);
      }
      
      const data = await response.json();
      setGraphStatus(data);
      setError(null);
    } catch (error) {
      console.error('Error fetching graph status:', error);
      setError(`${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (loading && !graphStatus) {
    return (
      <div className="graph-status-loading">
        <Spin size="small" />
        <span>Loading Graph RAG status...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="graph-status-error">
        <Badge status="error" />
        <span>{error}</span>
        <button 
          className="retry-button" 
          onClick={() => {
            setError(null);
            fetchGraphStatus();
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (!graphStatus) {
    return (
      <div className="graph-status-unavailable">
        <Badge status="default" />
        <span>Graph RAG system status unavailable</span>
        <p className="status-hint">Upload documents to initialize the Graph RAG system</p>
      </div>
    );
  }

  return (
    <div className="graph-process-status">
      <div className="status-header">
        <Badge 
          status={graphStatus.status === "active" ? "success" : "warning"} 
          text={graphStatus.status === "active" ? "Graph RAG System Active" : "Graph RAG System Initializing"} 
        />
        {!loading && (
          <Tooltip title="Refresh status">
            <button 
              className="refresh-button" 
              onClick={fetchGraphStatus}
              aria-label="Refresh status"
            >
              ↻
            </button>
          </Tooltip>
        )}
      </div>
      
      {graphStatus.status && (
        <div className="status-stats">
          <Tooltip title="Total text chunks in the knowledge graph">
            <div className="stat-item">
              <DatabaseOutlined />
              <span>
                <strong>{graphStatus.chunkCount || 0}</strong> chunks
              </span>
            </div>
          </Tooltip>
          
          <Tooltip title="Number of documents processed">
            <div className="stat-item">
              <FileTextOutlined />
              <span>
                <strong>{graphStatus.documentCount || 0}</strong> documents
                {graphStatus.processingCount > 0 && (
                  <small className="processing-badge"> ({graphStatus.processingCount} processing)</small>
                )}
              </span>
            </div>
          </Tooltip>
          
          <Tooltip title="Graph elements (nodes and edges)">
            <div className="stat-item">
              <TagsOutlined />
              <span>
                <strong>{(graphStatus.nodeCount || 0) + (graphStatus.edgeCount || 0)}</strong> elements
                <small className="graph-details"> ({graphStatus.nodeCount || 0} nodes, {graphStatus.edgeCount || 0} edges)</small>
              </span>
            </div>
          </Tooltip>
          
          {graphStatus.lastUpdated && (
            <div className="last-updated">
              Last updated: {new Date(graphStatus.lastUpdated).toLocaleString()}
            </div>
          )}
        </div>
      )}
      
      {graphStatus.status !== 'active' && (
        <div className="initializing-message">
          <Spin size="small" />
          <span>Initializing Graph RAG system...</span>
        </div>
      )}
      
      {graphStatus.status === 'active' && (
        <div className="status-metadata">
          <p className="metadata-hint">
            The Graph RAG system enhances query responses with knowledge graph connections and relevant source information. 
            Source analysis includes relevance scoring with color indicators (green ≥85%, yellow ≥70%, red &lt;70%).
          </p>
        </div>
      )}
    </div>
  );
};

export default GraphProcessStatus;
