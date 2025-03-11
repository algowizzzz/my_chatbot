import React, { useState, useEffect } from 'react';
import axios from 'axios';

function DocumentList({ onSelectDocument }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadDocuments();
  }, []);

  const loadDocuments = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/documents');
      setDocuments(response.data);
    } catch (error) {
      console.error('Failed to load documents:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="document-list">
      <h2>Your Documents</h2>
      {loading ? (
        <div>Loading...</div>
      ) : (
        <ul>
          {documents.map(doc => (
            <li key={doc._id} onClick={() => onSelectDocument(doc)}>
              <h3>{doc.title}</h3>
              <div className="metadata">
                <span>Chunks: {doc.chunks?.length || 0}</span>
                <span>Pages: {doc.metadata?.totalPages || 1}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default DocumentList; 