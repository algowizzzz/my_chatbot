import React, { useState, useRef, useEffect } from 'react';
import Login from './components/Login';
import Register from './components/Register';
import './App.css';

function App() {
  const [authState, setAuthState] = useState('login');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userId, setUserId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [currentChatId, setCurrentChatId] = useState(null);
  const [chats, setChats] = useState([]);
  const messagesEndRef = useRef(null);
  const [documents, setDocuments] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [queryResult, setQueryResult] = useState(null);
  const [selectedDocuments, setSelectedDocuments] = useState(new Set());
  const [isMultiSearchMode, setIsMultiSearchMode] = useState(false);
  const [searchedDocs, setSearchedDocs] = useState([]);

  // Fetch user's chats when logged in
  useEffect(() => {
    if (isLoggedIn && userId) {
      fetchChats();
    }
  }, [isLoggedIn, userId]);

  // Add this effect to fetch existing documents on load
  useEffect(() => {
    if (userId) {
      fetchDocuments();
    }
  }, [userId]);

  const fetchChats = async () => {
    try {
      const response = await fetch(`http://localhost:5004/user/${userId}/chats`);
      const data = await response.json();
      setChats(data);
      
      // If no current chat, set the most recent one
      if (data.length > 0 && !currentChatId) {
        setCurrentChatId(data[0]._id);
        setMessages(data[0].messages || []);
      } else if (data.length === 0) {
        // If no chats exist, create one
        handleNewChat();
      }
    } catch (error) {
      console.error('Error fetching chats:', error);
    }
  };

  const fetchDocuments = async () => {
    try {
      const response = await fetch(`http://localhost:5004/documents/${userId}`);
      const data = await response.json();
      setDocuments(data);
    } catch (error) {
      console.error('Error fetching documents:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    try {
      const endpoint = isMultiSearchMode
        ? `http://localhost:5004/query-multiple`
        : 'http://localhost:5004/chat';

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          message: input,
          userId: userId
        }),
      });
      
      const data = await response.json();
      
      // Add user message
      setMessages(prev => [...prev, { role: 'user', content: input }]);
      
      // If in multi-search mode, show searched documents
      if (isMultiSearchMode && data.searchedDocs) {
        setSearchedDocs(data.searchedDocs);
        setMessages(prev => [...prev, {
          role: 'system',
          content: `🔍 Searched documents: ${data.searchedDocs.join(', ')}`
        }]);
      }
      
      // Add AI response
      setMessages(prev => [...prev, { role: 'assistant', content: data.message }]);
      setInput('');
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const handleNewChat = async () => {
    try {
      const response = await fetch(`http://localhost:5004/user/${userId}/chats`, {
        method: 'POST'
      });
      const newChat = await response.json();
      setCurrentChatId(newChat._id);
      setMessages([]);
      setInput('');
      fetchChats();
    } catch (error) {
      console.error('Error creating new chat:', error);
    }
  };

  const switchChat = async (chatId) => {
    try {
      const chat = chats.find(c => c._id === chatId);
      if (chat) {
        setCurrentChatId(chatId);
        setMessages(chat.messages || []);
      }
    } catch (error) {
      console.error('Error switching chat:', error);
    }
  };

  const handleLogin = (userData) => {
    setUserId(userData.userId);
    setIsLoggedIn(true);
    // Create initial chat
    handleNewChat();
  };

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    setSelectedFile(file);
    setUploadProgress(0);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    setUploadProgress(10); // Start progress

    const formData = new FormData();
    formData.append('document', selectedFile);
    formData.append('userId', userId);

    try {
      const response = await fetch('http://localhost:5004/upload-document', {
        method: 'POST',
        body: formData,
      });

      setUploadProgress(90); // Almost done

      const data = await response.json();
      if (response.ok) {
        setDocuments(prev => [...prev, data]);
        setSelectedFile(null);
        setUploadProgress(100);
      } else {
        throw new Error(data.error || 'Upload failed');
      }
    } catch (error) {
      console.error('Error uploading document:', error);
      alert('Failed to upload document');
    } finally {
      setUploading(false);
      setTimeout(() => setUploadProgress(0), 1000); // Reset progress after 1s
    }
  };

  const handleDocumentClick = async (doc) => {
    setSelectedDocument(doc);
    // Clear previous messages when selecting a new document
    setMessages([]);
  };

  const handleDeleteDocument = async (docId, e) => {
    e.stopPropagation(); // Prevent document selection when clicking delete

    if (!window.confirm('Are you sure you want to delete this document?')) {
      return;
    }

    try {
      const response = await fetch(`http://localhost:5004/documents/${docId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        // Remove from documents list
        setDocuments(docs => docs.filter(doc => doc._id !== docId));
        
        // Clear selection if deleted document was selected
        if (selectedDocument?._id === docId) {
          setSelectedDocument(null);
        }
      } else {
        throw new Error('Failed to delete document');
      }
    } catch (error) {
      console.error('Error deleting document:', error);
      alert('Failed to delete document');
    }
  };

  const handleDocumentSelect = (docId, e) => {
    e.stopPropagation();
    setSelectedDocuments(prev => {
      const newSelection = new Set(prev);
      if (newSelection.has(docId)) {
        newSelection.delete(docId);
      } else {
        newSelection.add(docId);
      }
      return newSelection;
    });
  };

  if (!isLoggedIn) {
    if (authState === 'login') {
      return (
        <Login 
          onLogin={handleLogin}
          switchToRegister={() => setAuthState('register')}
        />
      );
    } else {
      return (
        <Register 
          onRegister={handleLogin}
          switchToLogin={() => setAuthState('login')}
        />
      );
    }
  }

  return (
    <div className="app-container">
      <div className="sidebar">
        <button onClick={handleNewChat} className="new-chat-button">
          New Chat
        </button>
        <div className="chats-list">
          {Array.isArray(chats) && chats.map(chat => (
            <div
              key={chat._id}
              className={`chat-item ${currentChatId === chat._id ? 'active' : ''}`}
              onClick={() => switchChat(chat._id)}
            >
              {chat.title || 'New Chat'}
            </div>
          ))}
        </div>
      </div>
      <main className="main-content">
        <div className="header">
          <h1 className="title">DeepLearnHQ</h1>
          {selectedDocument && (
            <div className="selected-document-info">
              Querying: {selectedDocument.title}
              <button 
                onClick={() => setSelectedDocument(null)}
                className="clear-document-button"
              >
                ✕
              </button>
            </div>
          )}
        </div>
        <div className="chat-messages">
          {messages.map((message, index) => (
            <div key={index} className={`message ${message.role}`}>
              <div className="message-content">{message.content}</div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={handleSubmit} className="input-form">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message..."
            className="message-input"
          />
          <button type="submit" className="send-button">Send</button>
        </form>
      </main>

      <div className="document-sidebar">
        <div className="document-header">
          <div className="document-header-top">
            <h2>Documents</h2>
            <button 
              className={`multi-search-toggle ${isMultiSearchMode ? 'active' : ''}`}
              onClick={() => {
                setIsMultiSearchMode(!isMultiSearchMode);
                setSearchedDocs([]);
              }}
              title={isMultiSearchMode ? "Semantic search across all documents" : "Single document mode"}
            >
              {isMultiSearchMode ? 'Semantic Search' : 'Single Doc'}
            </button>
          </div>
          <div className="upload-section">
            <input
              type="file"
              onChange={handleFileSelect}
              accept=".txt,.pdf"
              className="file-input"
              id="file-input"
            />
            <label htmlFor="file-input" className="file-label">
              {uploading ? 'Uploading...' : 'Choose File'}
            </label>
            {selectedFile && (
              <>
                <div className="selected-file">
                  {selectedFile.name}
                </div>
                <button 
                  onClick={handleUpload} 
                  className="upload-button"
                  disabled={uploading}
                >
                  {uploading ? 'Uploading...' : 'Upload'}
                </button>
              </>
            )}
            {uploadProgress > 0 && (
              <div className="progress-bar-container">
                <div 
                  className="progress-bar" 
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            )}
          </div>
        </div>
        <div className="documents-list">
          {documents.map((doc) => (
            <div 
              key={doc._id} 
              className={`document-item ${
                searchedDocs.includes(doc.title) ? 'searched' : ''
              }`}
              onClick={() => !isMultiSearchMode && handleDocumentClick(doc)}
            >
              <div className="document-info">
                <span className="document-title">{doc.title}</span>
                <span className="document-date">
                  {new Date(doc.createdAt).toLocaleDateString()}
                </span>
              </div>
              <button 
                className="delete-document-button"
                onClick={(e) => handleDeleteDocument(doc._id, e)}
                title="Delete document"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default App;