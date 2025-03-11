import React, { useState, useEffect } from 'react';
import { List, Button, Tooltip, Tag, Popconfirm, Spin, message, Empty, Checkbox } from 'antd';
import { DeleteOutlined, ReloadOutlined, FileTextOutlined, TagsOutlined } from '@ant-design/icons';
import './GraphDocumentList.css';

/**
 * GraphDocumentList component for displaying and managing documents processed for Graph RAG
 * Shows document status, entity counts, and provides controls for reprocessing or deletion
 */
const GraphDocumentList = ({ selectedDocs = [], onDocumentSelect = () => {} }) => {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingDocId, setProcessingDocId] = useState(null);
  
  // Log selected documents whenever they change
  useEffect(() => {
    console.log('GraphDocumentList: Selected documents updated:', selectedDocs);
  }, [selectedDocs]);

  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    try {
      setLoading(true);
      console.log('GraphDocumentList: Fetching documents from /api/graph/documents');
      const response = await fetch('/api/graph/documents').catch(error => {
        console.error('Network error:', error);
        throw new Error('Network error when fetching documents');
      });
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error(`Server error: ${response.status}`, errorText);
        throw new Error(`Failed to fetch documents: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('GraphDocumentList: Received documents:', data.documents);
      setDocuments(data.documents || []);
    } catch (error) {
      console.error('Error fetching documents:', error);
      message.error(`Failed to load Graph RAG documents: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (documentId) => {
    try {
      message.loading('Removing document...', 0.5);
      
      const response = await fetch(`/api/graph/documents/${documentId}`, {
        method: 'DELETE',
      }).catch(error => {
        console.error('Network error:', error);
        throw new Error('Network error when deleting document');
      });
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error(`Server error: ${response.status}`, errorText);
        throw new Error(`Failed to delete document: ${response.status}`);
      }
      
      message.success('Document successfully removed from Graph RAG');
      fetchDocuments();
    } catch (error) {
      console.error('Error deleting document:', error);
      message.error(`Failed to delete document: ${error.message}`);
    }
  };

  const handleReprocess = async (documentId) => {
    try {
      setProcessingDocId(documentId);
      message.loading('Starting document reprocessing...', 0.5);
      
      // Use the new reprocess endpoint
      const response = await fetch(`/api/graph/documents/${documentId}/reprocess`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      }).catch(error => {
        console.error('Network error:', error);
        throw new Error('Network error when reprocessing document');
      });
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error(`Server error: ${response.status}`, errorText);
        throw new Error(`Failed to reprocess document: ${response.status}`);
      }
      
      const result = await response.json();
      
      message.info('Document reprocessing started - extracting entities and building knowledge graph');
      
      // Poll for processing status
      let retryCount = 0;
      const maxRetries = 30; // 1 minute max polling time
      const statusCheckInterval = setInterval(async () => {
        try {
          if (retryCount >= maxRetries) {
            clearInterval(statusCheckInterval);
            setProcessingDocId(null);
            message.warning('Reprocessing is taking longer than expected. Please check status later.');
            return;
          }
          
          retryCount++;
          // Use the new process-status endpoint with documentId as jobId
          const statusResponse = await fetch(`/api/graph/process-status/${documentId}`).catch(error => {
            console.error('Status check network error:', error);
            // Don't throw here, just log and continue polling
          });
          
          if (!statusResponse || !statusResponse.ok) {
            console.warn('Status check failed, will retry');
            return;
          }
          
          const statusResult = await statusResponse.json();
          
          if (statusResult.status === 'completed') {
            clearInterval(statusCheckInterval);
            setProcessingDocId(null);
            message.success('Document successfully reprocessed with updated entities and relationships');
            fetchDocuments();
          } else if (statusResult.status === 'error') {
            clearInterval(statusCheckInterval);
            setProcessingDocId(null);
            message.error(`Reprocessing failed: ${statusResult.error || 'Unknown error'}`);
          }
        } catch (error) {
          console.error('Error in status check:', error);
          // Don't stop polling on error, just log it
        }
      }, 2000);
    } catch (error) {
      console.error('Error reprocessing document:', error);
      message.error(`Failed to reprocess document: ${error.message}`);
      setProcessingDocId(null);
    }
  };

  const getStatusTag = (status) => {
    switch (status) {
      case 'completed':
      case 'processed':
        return <Tag color="green">Processed</Tag>;
      case 'processing':
      case 'uploaded':
        return <Tag color="blue">Processing</Tag>;
      case 'error':
      case 'failed':
        return <Tag color="red">Failed</Tag>;
      default:
        return <Tag color="default">Unknown</Tag>;
    }
  };

  if (loading) {
    return (
      <div className="graph-document-list-loading">
        <Spin />
        <p>Loading documents...</p>
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className="graph-document-list-empty">
        <Empty 
          description="No documents processed for Graph RAG" 
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
        <div className="empty-instructions">
          <p>Upload PDF documents using the form above to process them for Graph RAG.</p>
          <p>Documents will be analyzed to extract entities and relationships for enhanced question answering.</p>
        </div>
      </div>
    );
  }

  // Handle document selection
  const handleDocumentSelect = (docId) => {
    console.log('GraphDocumentList: Handling document selection for:', docId);
    if (selectedDocs.includes(docId)) {
      // Deselect document
      onDocumentSelect(selectedDocs.filter(id => id !== docId));
    } else {
      // Select document (with limit of 5)
      if (selectedDocs.length < 5) {
        onDocumentSelect([...selectedDocs, docId]);
      } else {
        message.warning('Maximum of 5 documents can be selected for querying');
      }
    }
  };

  return (
    <div className="graph-document-list">
      <List
        itemLayout="horizontal"
        dataSource={documents}
        renderItem={(doc) => {
          // Use documentId for selection (or fallback to id if documentId is not available)
          const docId = doc.documentId || doc.id;
          const isSelected = selectedDocs.includes(docId);
          
          return (
            <List.Item
              actions={[
                <Tooltip title="Reprocess document">
                  <Button
                    icon={<ReloadOutlined />}
                    size="small"
                    loading={processingDocId === docId}
                    onClick={() => handleReprocess(docId)}
                    disabled={processingDocId !== null}
                  />
                </Tooltip>,
                <Tooltip title="Delete document">
                  <Popconfirm
                    title="Remove this document from Graph RAG?"
                    onConfirm={() => handleDelete(docId)}
                    okText="Yes"
                    cancelText="No"
                  >
                    <Button
                      icon={<DeleteOutlined />}
                      size="small"
                      danger
                      disabled={processingDocId !== null}
                    />
                  </Popconfirm>
                </Tooltip>
              ]}
            >
              <Checkbox
                checked={isSelected}
                onChange={() => handleDocumentSelect(docId)}
                style={{ marginRight: '12px' }}
              />
              <List.Item.Meta
                avatar={<FileTextOutlined style={{ fontSize: '24px', color: '#1890ff' }} />}
              title={
                <div className="document-title">
                  <span>{doc.name}</span>
                  {getStatusTag(doc.status)}
                </div>
              }
              description={
                <div className="document-details">
                  <div className="document-stats">
                    <Tooltip title="Entities extracted">
                      <span className="stat-item">
                        <TagsOutlined /> {doc.entityCount || 0} entities
                      </span>
                    </Tooltip>
                    <span className="stat-item">
                      {doc.pageCount ? `${doc.pageCount} pages` : 'Unknown pages'}
                    </span>
                  </div>
                  {doc.lastProcessed && (
                    <div className="document-timestamp">
                      Last processed: {new Date(doc.lastProcessed).toLocaleString()}
                    </div>
                  )}
                </div>
              }
            />
          </List.Item>
          );
        }}
      />
      {documents.length > 0 && (
        <div className="selection-info" style={{ padding: '8px 16px', borderTop: '1px solid #f0f0f0', fontSize: '12px', color: '#666' }}>
          {selectedDocs.length > 0 ? (
            <p>{selectedDocs.length} document(s) selected for querying</p>
          ) : (
            <p>Select documents to include in your Graph RAG queries</p>
          )}
        </div>
      )}
    </div>
  );
};

// Add console log for debugging
console.log('GraphDocumentList component loaded');

export default GraphDocumentList;
