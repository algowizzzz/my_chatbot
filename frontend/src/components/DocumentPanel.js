import React, { useState, useEffect } from 'react';
import { List, Button, Input, Modal, message } from 'antd';
import { EditOutlined } from '@ant-design/icons';
import DocumentUpload from './DocumentUpload';

const DocumentPanel = ({ visible, selectedDocs, onDocSelect }) => {
  const [documents, setDocuments] = useState([]);
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [currentDoc, setCurrentDoc] = useState(null);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    if (visible) {
      fetchDocuments();
    }
  }, [visible]);

  const fetchDocuments = async () => {
    try {
      const response = await fetch('/api/documents/list/test-user');
      const data = await response.json();
      setDocuments(data);
    } catch (error) {
      message.error('Failed to fetch documents');
    }
  };

  const handleUploadSuccess = (data) => {
    message.success('Document uploaded successfully');
    fetchDocuments();
  };

  const handleRename = async () => {
    try {
      await fetch(`/api/documents/rename/${currentDoc._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      });
      message.success('Document renamed');
      fetchDocuments();
      setRenameModalVisible(false);
    } catch (error) {
      message.error('Failed to rename document');
    }
  };

  return (
    <div className="p-4">
      <DocumentUpload onUploadSuccess={handleUploadSuccess} />

      <List
        className="mt-4"
        dataSource={documents}
        renderItem={(doc) => (
          <List.Item
            actions={[
              <Button 
                icon={<EditOutlined />} 
                onClick={() => {
                  setCurrentDoc(doc);
                  setNewName(doc.name);
                  setRenameModalVisible(true);
                }}
              />,
            ]}
          >
            <List.Item.Meta
              title={doc.name}
              description={`Uploaded: ${new Date(doc.createdAt).toLocaleString()}`}
            />
            <Button
              type={selectedDocs.includes(doc._id) ? 'primary' : 'default'}
              onClick={() => onDocSelect(doc._id)}
            >
              {selectedDocs.includes(doc._id) ? 'Selected' : 'Select'}
            </Button>
          </List.Item>
        )}
      />

      <Modal
        title="Rename Document"
        visible={renameModalVisible}
        onOk={handleRename}
        onCancel={() => setRenameModalVisible(false)}
      >
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Enter new name"
        />
      </Modal>
    </div>
  );
};

export default DocumentPanel; 