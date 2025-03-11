import React, { useState, useEffect } from 'react';
import { Upload, Button, message, Progress, Spin, Select, Tag, Empty, Card, Typography } from 'antd';
import { UploadOutlined, FileAddOutlined, FileTextOutlined, CheckCircleOutlined, CloseCircleOutlined, LoadingOutlined } from '@ant-design/icons';
import './GraphDocumentUpload.css';

const { Option } = Select;
const { Title, Text } = Typography;

/**
 * GraphDocumentUpload component for uploading documents to the Graph RAG system
 * This component handles file uploads specifically for Graph RAG processing
 */
const GraphDocumentUpload = ({ onUploadSuccess, onDocumentSelect }) => {
  const [fileList, setFileList] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [loadingDocument, setLoadingDocument] = useState(false);

  const handleUpload = async () => {
    if (fileList.length === 0) {
      message.error('Please select a file to upload');
      return;
    }

    const file = fileList[0];
    const formData = new FormData();
    formData.append('file', file);

    setUploading(true);
    setProgress(0);

    try {
      // Simulate progress updates for upload phase
      const progressInterval = setInterval(() => {
        setProgress(prevProgress => {
          const newProgress = prevProgress + 5; // Slower progress to be more realistic
          if (newProgress >= 90) { // Only go up to 90% for upload phase
            clearInterval(progressInterval);
            return 90;
          }
          return newProgress;
        });
      }, 500);

      // Upload the file to the new Graph RAG documents endpoint
      const response = await fetch('/api/graph/documents', {
        method: 'POST',
        body: formData, // Send as FormData instead of JSON
      }).catch(error => {
        clearInterval(progressInterval);
        throw new Error(`Network error: ${error.message}`);
      });

      clearInterval(progressInterval);
      setProgress(95); // Upload complete, waiting for server processing

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`Upload failed: ${response.status} ${errorText}`);
      }

      const result = await response.json();
      
      // If upload is successful, poll for processing status
      if (result.documentId) {
        setProcessing(true);
        // Poll for processing status using the documents endpoint
        const statusCheckInterval = setInterval(async () => {
          try {
            const statusResponse = await fetch('/api/graph/documents');
            
            if (!statusResponse.ok) {
              console.warn('Status check failed, will retry');
              return;
            }
            
            const statusResult = await statusResponse.json();
            const uploadedDoc = statusResult.documents.find(doc => doc.documentId === result.documentId);
            
            if (uploadedDoc && uploadedDoc.status === 'completed') {
              clearInterval(statusCheckInterval);
              setProcessing(false);
              message.success('Document successfully processed for Graph RAG');
              setFileList([]);
              if (onUploadSuccess) onUploadSuccess();
            } else if (uploadedDoc && uploadedDoc.status === 'error') {
              clearInterval(statusCheckInterval);
              setProcessing(false);
              message.error(`Processing failed: ${uploadedDoc.error || 'Unknown error'}`);
            }
          } catch (error) {
            console.error('Error in status check:', error);
            // Don't stop polling on error, just log it
          }
        }, 2000);
      } else {
        // If processing was synchronous or no document ID was returned
        message.success('Document successfully uploaded and processed for Graph RAG');
        setFileList([]);
        if (onUploadSuccess) onUploadSuccess();
      }
    } catch (error) {
      console.error('Error uploading file:', error);
      message.error(`Failed to upload document: ${error.message}`);
      // Reset the file list on error so user can try again
      setFileList([]);
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  const props = {
    onRemove: file => {
      const index = fileList.indexOf(file);
      const newFileList = fileList.slice();
      newFileList.splice(index, 1);
      setFileList(newFileList);
    },
    beforeUpload: file => {
      // Only accept PDF files
      const isPDF = file.type === 'application/pdf';
      
      if (!isPDF) {
        message.error('You can only upload PDF files!');
        return Upload.LIST_IGNORE;
      }
      
      // Check file size (limit to 20MB)
      const isLargeFile = file.size / 1024 / 1024 > 20;
      if (isLargeFile) {
        message.error(`${file.name} exceeds the 20MB file size limit`);
        return Upload.LIST_IGNORE;
      }
      
      // Only allow one file at a time
      setFileList([file]);
      return false;
    },
    fileList,
    accept: '.pdf',
    multiple: false,
    disabled: uploading || processing
  };

  // Fetch documents on component mount
  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/graph/documents');
      if (!response.ok) {
        throw new Error(`Failed to fetch documents: ${response.status}`);
      }
      const data = await response.json();
      setDocuments(data.documents || []);
    } catch (error) {
      console.error('Error fetching documents:', error);
      message.error(`Failed to fetch documents: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDocumentSelect = async (documentId) => {
    setLoadingDocument(true);
    try {
      // Find the document in the local state first
      const selectedDoc = documents.find(doc => doc.documentId === documentId);
      
      // If we have the document locally and it has graph data, use it directly
      if (selectedDoc && selectedDoc.hasGraphData) {
        setSelectedDocument(selectedDoc);
        
        // Notify parent component
        if (onDocumentSelect) {
          onDocumentSelect(selectedDoc);
        }
        
        message.success(`Document loaded: ${selectedDoc.documentName}`);
        return;
      }
      
      // Otherwise, fetch from the server
      const response = await fetch('/api/graph/select-document', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ documentId }),
      });

      if (!response.ok) {
        throw new Error(`Failed to select document: ${response.status}`);
      }

      const data = await response.json();
      setSelectedDocument(data.document);
      
      // Notify parent component
      if (onDocumentSelect) {
        onDocumentSelect(data.document);
      }
      
      message.success(`Document loaded: ${data.document.documentName}`);
    } catch (error) {
      console.error('Error selecting document:', error);
      message.error(`Failed to select document: ${error.message}`);
    } finally {
      setLoadingDocument(false);
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
      case 'processing':
        return <LoadingOutlined style={{ color: '#1890ff' }} />;
      case 'error':
        return <CloseCircleOutlined style={{ color: '#f5222d' }} />;
      default:
        return null;
    }
  };

  // Clear the selected document
  const clearSelectedDocument = () => {
    setSelectedDocument(null);
    // Notify parent component
    if (onDocumentSelect) {
      onDocumentSelect(null);
    }
    message.info('Document selection cleared');
  };
  
  return (
    <div className="graph-document-upload">
      <div className="upload-info">
        <FileAddOutlined className="upload-icon" />
        <div className="upload-text">
          <h3>Upload Documents for Graph RAG</h3>
          <p>Upload PDF documents to be processed for entity extraction and relationship analysis.</p>
        </div>
      </div>
      
      {/* Document Selection Section */}
      <div className="document-selection-section">
        <Title level={4}>Select a Document</Title>
        {loading ? (
          <Spin tip="Loading documents..." />
        ) : documents.length > 0 ? (
          <div className="document-list">
            <Select
              placeholder="Select a document to analyze"
              style={{ width: '100%', marginBottom: 16 }}
              onChange={handleDocumentSelect}
              loading={loadingDocument}
              disabled={loadingDocument}
            >
              {documents.map(doc => (
                <Option key={doc.documentId} value={doc.documentId}>
                  <div className="document-option">
                    <FileTextOutlined /> {doc.documentName} 
                    {getStatusIcon(doc.status)}
                    {doc.hasGraphData && (
                      <Tag color="green" style={{ marginLeft: 8 }}>Graph Ready</Tag>
                    )}
                  </div>
                </Option>
              ))}
            </Select>
            
            {selectedDocument && (
              <Card className="selected-document-card" size="small" 
                actions={[
                  <Button 
                    type="text" 
                    size="small" 
                    onClick={clearSelectedDocument}
                    icon={<CloseCircleOutlined />}
                  >
                    Clear Selection
                  </Button>
                ]}
              >
                <div className="document-details">
                  <Text strong>Selected: {selectedDocument.documentName}</Text>
                  <div className="document-metadata">
                    <Text type="secondary">Pages: {selectedDocument.pageCount || 'N/A'}</Text>
                    <Text type="secondary">Status: {selectedDocument.status}</Text>
                    {selectedDocument.processingStats && (
                      <>
                        <Text type="secondary">Entities: {selectedDocument.processingStats.entityCount}</Text>
                        <Text type="secondary">Relationships: {selectedDocument.processingStats.relationshipCount}</Text>
                      </>
                    )}
                  </div>
                </div>
              </Card>
            )}
          </div>
        ) : (
          <Empty description="No documents available" />
        )}
      </div>
      
      <div className="upload-section">
        <Title level={4}>Upload New Document</Title>
        <Upload {...props} className="upload-area">
          <Button icon={<UploadOutlined />}>Select PDF Files</Button>
        </Upload>
        
        {fileList.length > 0 && (
          <div className="upload-actions">
            <Button
              type="primary"
              onClick={handleUpload}
              disabled={fileList.length === 0 || uploading || processing}
              loading={uploading}
              style={{ marginTop: 16 }}
            >
              {uploading ? 'Uploading' : 'Start Upload'}
            </Button>
          </div>
        )}
        
        {uploading && (
          <div className="upload-progress">
            <Progress percent={progress} status="active" />
            <p>Uploading documents...</p>
          </div>
        )}
        
        {processing && (
          <div className="processing-indicator">
            <Spin />
            <p>Processing documents for Graph RAG...</p>
            <p className="processing-note">This may take a few minutes depending on document size and complexity.</p>
            <p className="processing-detail">Extracting entities and building knowledge graph...</p>
          </div>
        )}
        
        {!uploading && !processing && fileList.length === 0 && (
          <div className="upload-tip">
            <p>Supported format: PDF (max 20MB)</p>
            <p>Documents will be processed to extract entities and relationships for the Graph RAG system.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default GraphDocumentUpload;
