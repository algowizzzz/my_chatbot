import React, { useState } from 'react';
import { List, Button, Typography, Tooltip, Checkbox, Spin, Select } from 'antd';
import { FileOutlined, UploadOutlined, DeleteOutlined, MenuFoldOutlined, MenuUnfoldOutlined, FileTextOutlined } from '@ant-design/icons';
import './DocumentList.css';

const { Text } = Typography;

function DocumentList({ documents = [], selectedDocs = [], onDocumentSelect, onUploadDocument, onDeleteDocument, loading = false }) {
  const [listCollapsed, setListCollapsed] = useState(true);
  
  const handleDocumentSelect = (docId) => {
    if (selectedDocs.includes(docId)) {
      onDocumentSelect(selectedDocs.filter(id => id !== docId));
    } else {
      if (selectedDocs.length < 5) {
        onDocumentSelect([...selectedDocs, docId]);
      } else {
        // Could show a message here about the 5 document limit
      }
    }
  };

  return (
    <div className="document-list-container">
      <div className="document-list-header">
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <h3>Files</h3>
          <Button 
            type="text" 
            icon={listCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setListCollapsed(!listCollapsed)}
            size="small"
            style={{ marginLeft: '8px' }}
            aria-label={listCollapsed ? "Expand document list" : "Collapse document list"}
          />
        </div>
        <Button 
          type="primary" 
          icon={<UploadOutlined />} 
          size="small"
          onClick={onUploadDocument}
          className="upload-doc-btn"
        >
          Add File
        </Button>
      </div>
      
      {!listCollapsed && (
        <div>
          {/* Document Selection */}
          <div style={{ marginBottom: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontWeight: 500 }}>Selected Documents</span>
              <span style={{ color: '#8c8c8c', fontSize: '12px' }}>{documents.length} available</span>
            </div>
            <Select
              placeholder="Select documents"
              mode="multiple"
              style={{ width: '100%', marginBottom: '10px' }}
              value={selectedDocs}
              onChange={(values) => {
                // Handle multiple document selection
                onDocumentSelect(values);
              }}
              optionLabelProp="label"
              maxTagCount={2}
              dropdownRender={(menu) => (
                <div>
                  {menu}
                  {documents.length > 0 && (
                    <div style={{ padding: '8px', borderTop: '1px solid #e8e8e8' }}>
                      <Button 
                        type="text" 
                        danger 
                        icon={<DeleteOutlined />}
                        onClick={() => onDeleteDocument && onDeleteDocument()}
                        size="small"
                        style={{ width: '100%', textAlign: 'left' }}
                      >
                        Manage Documents
                      </Button>
                    </div>
                  )}
                </div>
              )}
            >
              {documents.map(doc => (
                <Select.Option key={doc._id} value={doc._id} label={doc.name || 'Untitled Document'}>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <FileTextOutlined style={{ marginRight: '8px' }} />
                    <span>{doc.name || 'Untitled Document'}</span>
                  </div>
                </Select.Option>
              ))}
            </Select>
          </div>
          <Button 
            icon={<UploadOutlined />} 
            onClick={onUploadDocument}
            block
            style={{ marginBottom: '16px' }}
          >
            Add Document
          </Button>

          {/* Document List */}
          {loading ? (
            <div className="empty-document-list">
              <Spin size="small" />
              <p style={{ marginLeft: '8px' }}>Loading documents...</p>
            </div>
          ) : (!documents || documents.length === 0) ? (
            <div className="empty-document-list">
              <p>Upload a file to get started</p>
            </div>
          ) : (
            <div>
              <div className="document-selection-info">
                <Text type="secondary">Select up to 5 documents</Text>
                <Text type="secondary">{selectedDocs.length}/5 selected</Text>
              </div>
              <List
                className="document-list"
                itemLayout="horizontal"
                dataSource={documents}
                renderItem={(doc) => {
                  const isSelected = selectedDocs.includes(doc._id);
                  
                  return (
                    <List.Item
                      className={`document-list-item ${isSelected ? 'selected' : ''}`}
                      actions={[
                        onDeleteDocument && (
                          <Tooltip title="Delete">
                            <Button 
                              type="text" 
                              icon={<DeleteOutlined />} 
                              size="small" 
                              className="doc-action-btn delete"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteDocument(doc._id);
                              }}
                            />
                          </Tooltip>
                        )
                      ].filter(Boolean)}
                    >
                      <Checkbox 
                        checked={isSelected}
                        onChange={() => handleDocumentSelect(doc._id)}
                        className="document-checkbox"
                      />
                      <List.Item.Meta
                        avatar={<FileOutlined className={`doc-icon ${isSelected ? 'selected' : ''}`} />}
                        title={<Text strong={isSelected} className="doc-title">{doc.name || 'Untitled Document'}</Text>}
                        description={
                          <Text type="secondary" ellipsis className="doc-info">
                            {doc.size ? `${(doc.size / 1024).toFixed(1)} KB` : ''}
                            {doc.metadata?.totalPages ? ` • ${doc.metadata.totalPages} pages` : ''}
                            {doc.uploadDate ? ` • ${new Date(doc.uploadDate).toLocaleDateString()}` : ''}
                          </Text>
                        }
                      />
                    </List.Item>
                  );
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default DocumentList;