import React, { useState } from 'react';
import axios from 'axios';
import './DocumentUpload.css';

// Use the same API base URL as the rest of the application
const API_BASE_URL = 'http://localhost:5005';

function DocumentUpload({ onUploadSuccess }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(0);

  const handleUpload = async (file) => {
    const formData = new FormData();
    formData.append('document', file);

    try {
      setLoading(true);
      setError(null);
      setProgress(0);

      const response = await axios.post(`${API_BASE_URL}/api/documents/upload`, formData, {
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setProgress(percentCompleted);
        }
      });

      onUploadSuccess(response.data);
    } catch (error) {
      console.error('Upload failed:', error);
      setError(error.response?.data?.error || 'Failed to upload document');
    } finally {
      setLoading(false);
      setProgress(0);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  return (
    <div 
      className="upload-container"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      <div className="upload-box">
        <input 
          type="file" 
          id="file-upload"
          className="file-input"
          onChange={(e) => e.target.files[0] && handleUpload(e.target.files[0])}
          accept=".txt,.pdf,.doc,.docx"
        />
        <label htmlFor="file-upload" className="upload-label">
          {loading ? (
            <div className="progress-bar">
              <div 
                className="progress-fill" 
                style={{ width: `${progress}%` }}
              />
              <span>Processing... {progress}%</span>
            </div>
          ) : (
            <>
              <span className="upload-icon">📄</span>
              <span>Drag & drop a document or click to browse</span>
            </>
          )}
        </label>
      </div>
      {error && <div className="error-message">{error}</div>}
    </div>
  );
}

export default DocumentUpload; 