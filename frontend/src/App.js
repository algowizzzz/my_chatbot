import React, { useState, useEffect } from 'react';
import ChatWindow from './components/ChatWindow';
import ChatList from './components/ChatList';
import DocumentList from './components/DocumentList';
import ModeSelector from './components/ModeSelector';
import TaskSelector from './components/TaskSelector';
import DocumentPanel from './components/DocumentPanel';
import DocumentUpload from './components/DocumentUpload';
import GraphDocumentUpload from './components/GraphDocumentUpload';
import GraphDocumentList from './components/GraphDocumentList';
import GraphProcessStatus from './components/GraphProcessStatus';
import ProtectedRoute from './components/ProtectedRoute';
import Header from './components/Header';
import { Layout, Button, message, Select, Modal, List } from 'antd';
import { 
  PlusOutlined, 
  MenuFoldOutlined, 
  MenuUnfoldOutlined, 
  FileTextOutlined, 
  UploadOutlined,
  DeleteOutlined,
  ExclamationCircleOutlined,
  RobotOutlined
} from '@ant-design/icons';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import ConfigPage from './pages/ConfigPage';
import LoginPage from './pages/LoginPage';
import { AuthProvider } from './context/AuthContext';
import './App.css';
const { Content, Sider } = Layout;

// Add API base URL
const API_BASE_URL = 'http://localhost:5005'; // updated to match our backend port

function AppContent() {
  const [chatHistory, setChatHistory] = useState([]);
  const [currentChat, setCurrentChat] = useState(null);
  const [chats, setChats] = useState([]);
  const [mode, setMode] = useState('direct'); // 'direct' or 'rag'
  const [selectedDocs, setSelectedDocs] = useState([]);
  const [rightSiderVisible, setRightSiderVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [uploadModalVisible, setUploadModalVisible] = useState(false);
  const [deleteDocsModalVisible, setDeleteDocsModalVisible] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [chatListCollapsed, setChatListCollapsed] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [selectedGraphDocument, setSelectedGraphDocument] = useState(null);

  // Load chats on mount
  useEffect(() => {
    fetchChats();
    if (mode === 'rag') {
      fetchDocuments();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  
  // Fetch documents regardless of mode
  useEffect(() => {
    fetchDocuments();
  }, [mode]);

  // Update UI based on mode
  useEffect(() => {
    if (mode === 'direct') {
      setSelectedDocs([]); // Clear selected docs when switching to direct mode
    }
  }, [mode]);

  const fetchChats = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/chats`);
      const data = await response.json();
      setChats(data);
      if (data.length > 0 && !currentChat) {
        setCurrentChat(data[0]);
        fetchChatHistory(data[0]._id);
      }
    } catch (error) {
      console.error('Failed to fetch chats:', error);
    }
  };
  
  const fetchDocuments = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/documents`);
      if (!response.ok) {
        throw new Error(`Failed to fetch documents: ${response.statusText}`);
      }
      const data = await response.json();
      setDocuments(data);
    } catch (error) {
      console.error('Error fetching documents:', error);
      message.error('Failed to fetch documents');
    }
  };

  const fetchChatHistory = async (chatId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/chats/${chatId}/messages`);
      const data = await response.json();
      setChatHistory(data);
    } catch (error) {
      console.error('Failed to fetch chat history:', error);
    }
  };

  const handleNewChat = async (taskTitle) => {
    try {
      // Make sure taskTitle is a string to avoid circular references
      const title = typeof taskTitle === 'string' ? taskTitle : 'New Chat';
      
      const response = await fetch(`${API_BASE_URL}/api/chats/new`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title,
          userId: 'test-user' // We'll replace this with actual user ID later
        })
      });

      if (!response.ok) {
        throw new Error('Failed to create new chat');
      }

      const newChat = await response.json();
      console.log('Created new chat:', newChat);
      
      setChats(prev => [newChat, ...prev]);
      setCurrentChat(newChat);
      setChatHistory([]);
      message.success(`${title} created`);
      return newChat;
    } catch (error) {
      console.error('Failed to create new chat:', error);
      message.error('Failed to create new chat');
      return null;
    }
  };
  
  // Add chat rename functionality
  const handleChatRename = async (chatId, newTitle) => {
    console.log('handleChatRename called with:', { chatId, newTitle });
    try {
      console.log('Making API request to rename chat');
      const response = await fetch(`${API_BASE_URL}/api/chats/${chatId}/rename`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle })
      });

      if (!response.ok) {
        console.error('API response not OK:', response.status, response.statusText);
        throw new Error('Failed to rename chat');
      }

      console.log('Chat renamed successfully on server');
      
      // Update chat in state
      setChats(prevChats => {
        console.log('Updating chats in state');
        return prevChats.map(chat => 
          chat._id === chatId ? { ...chat, title: newTitle } : chat
        );
      });

      // Update current chat if it's the one being renamed
      if (currentChat && currentChat._id === chatId) {
        console.log('Updating current chat title');
        setCurrentChat(prev => ({ ...prev, title: newTitle }));
      }

      message.success('Chat renamed successfully');
    } catch (error) {
      console.error('Error renaming chat:', error);
      message.error('Failed to rename chat');
    }
  };
  
  const handleTaskSelect = async (taskId) => {
    const tasks = {
      'direct': 'General AI',
      'rag': 'Document Q&A',
      'graph-rag': 'Graph RAG'
    };
    
    setSelectedTask(taskId);
    
    // Handle mode switching
    setMode(taskId);
    
    // Show document panel for RAG and Graph RAG modes
    if (taskId === 'rag' || taskId === 'graph-rag') {
      setRightSiderVisible(true);
      // Only fetch regular documents for RAG mode
      if (taskId === 'rag') {
        fetchDocuments();
      }
    } else {
      setRightSiderVisible(false);
    }
    
    const taskTitle = tasks[taskId] || 'New Task';
    await handleNewChat(taskTitle);
  };

  const handleChatSelect = (chat) => {
    setCurrentChat(chat);
    fetchChatHistory(chat._id);
  };



  // This function is no longer needed as we're directly setting selectedDocs in the dropdown
  // Keeping it for backward compatibility with any other components
  const handleDocSelect = (docId) => {
    setSelectedDocs(prev => {
      const isSelected = prev.includes(docId);
      if (isSelected) {
        return prev.filter(id => id !== docId);
      } else {
        return [...prev, docId];
      }
    });
  };

  const handleSendMessage = async (message, editIndex = null, regenerate = false) => {
    try {
      setLoading(true);
      
      // Handle message editing
      if (editIndex !== null && !regenerate) {
        // Create a copy of the current chat history
        const updatedHistory = [...chatHistory];
        
        // Update the message at the specified index
        updatedHistory[editIndex] = {
          ...updatedHistory[editIndex],
          content: message,
          edited: true
        };
        
        // If we're editing a user message and there's an assistant response after it,
        // we should remove the assistant response and regenerate it
        if (updatedHistory[editIndex].role === 'user' && 
            editIndex + 1 < updatedHistory.length && 
            updatedHistory[editIndex + 1].role === 'assistant') {
          // Remove the assistant response
          const historyUpToEdit = updatedHistory.slice(0, editIndex + 1);
          setChatHistory(historyUpToEdit);
          
          // Save the updated chat history to the backend
          if (currentChat) {
            await fetch(`${API_BASE_URL}/api/chats/${currentChat._id}/messages`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ messages: historyUpToEdit })
            });
          }
          
          // Now regenerate the assistant response
          await generateResponse(message);
        } else {
          // Just update the chat history without regenerating
          setChatHistory(updatedHistory);
          
          // Save the updated chat history to the backend
          if (currentChat) {
            await fetch(`${API_BASE_URL}/api/chats/${currentChat._id}/messages`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ messages: updatedHistory })
            });
          }
        }
      }
      // Handle regenerating a response
      else if (regenerate) {
        // Find the user message before the assistant message to regenerate
        let userMessageIndex = editIndex - 1;
        while (userMessageIndex >= 0 && chatHistory[userMessageIndex].role !== 'user') {
          userMessageIndex--;
        }
        
        if (userMessageIndex >= 0) {
          // Get the user message
          const userMessage = chatHistory[userMessageIndex];
          
          // Keep only messages up to the user message
          const historyUpToUser = chatHistory.slice(0, userMessageIndex + 1);
          setChatHistory(historyUpToUser);
          
          // Save the updated chat history to the backend
          if (currentChat) {
            await fetch(`${API_BASE_URL}/api/chats/${currentChat._id}/messages`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ messages: historyUpToUser })
            });
          }
          
          // Now regenerate the assistant response
          await generateResponse(userMessage.content);
        }
      }
      // Handle new message
      else {
        // Add user message immediately to show in UI
        const newUserMessage = { role: 'user', content: message };
        setChatHistory(prev => [...prev, newUserMessage]);
        
        // Generate response for the new message
        await generateResponse(message);
      }
    } catch (error) {
      console.error('Detailed error:', error);
      setChatHistory(prev => [...prev, {
        role: 'assistant',
        content: `Error: ${error.message}`
      }]);
      console.error('Failed to send message');
    } finally {
      setLoading(false);
    }
  };
  
  // Helper function to generate a response from the API
  const generateResponse = async (message) => {
    // Use the correct endpoint based on mode
    let endpoint;
    let body;
    
    console.log('generateResponse: Current mode:', mode);
    console.log('generateResponse: Selected documents:', selectedDocs);
    
    if (mode === 'rag') {
      endpoint = `${API_BASE_URL}/api/documents/query`;
      body = { query: message, documentId: selectedDocs[0] }; // Use first selected doc for now
      console.log('generateResponse: Using RAG mode with document:', selectedDocs[0]);
    } else if (mode === 'graph-rag') {
      endpoint = `${API_BASE_URL}/api/graph/test-query`;
      body = { 
        query: message, 
        documentId: selectedGraphDocument?.documentId,
        config: {
          includeMetadata: true,
          includeSourceText: true
        }
      };
      console.log('generateResponse: Using Graph RAG mode with document:', selectedGraphDocument?.documentId);
      
      if (!selectedGraphDocument?.documentId) {
        message.error('Please select a document for Graph RAG');
        throw new Error('No document selected for Graph RAG');
      }
    } else {
      endpoint = `${API_BASE_URL}/api/documents/query/direct`;
      body = { query: message };
      console.log('generateResponse: Using direct mode (no documents)');
    }

    console.log('Sending request to:', endpoint);
    console.log('With body:', body);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Server error:', errorText);
      throw new Error(`Server error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    console.log('Server response:', data);
    
    // Add assistant's response to chat
    const assistantMessage = { 
      role: 'assistant', 
      content: data.answer || data.response, // Handle different response formats
      metadata: mode === 'rag' ? {
        selectedDocuments: selectedDocs
      } : null
    };
    setChatHistory(prev => [...prev, assistantMessage]);

    // Save messages to backend if you're tracking chat history
    if (currentChat) {
      await fetch(`${API_BASE_URL}/api/chats/${currentChat._id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          messages: [{ role: 'user', content: message }, assistantMessage]
        })
      });
    }
    
    return assistantMessage;
  };

  const handleDeleteChat = async (chatId) => {
    Modal.confirm({
      title: 'Delete Chat',
      icon: <ExclamationCircleOutlined />,
      content: 'Are you sure you want to delete this chat? This action cannot be undone.',
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          console.log(`Attempting to delete chat with ID: ${chatId}`);
          const deleteUrl = `${API_BASE_URL}/api/chats/${chatId}`;
          console.log(`DELETE request to: ${deleteUrl}`);
          
          const response = await fetch(deleteUrl, {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json'
            }
          });
          
          console.log(`Delete chat response status: ${response.status}`);
          
          if (!response.ok) {
            const errorText = await response.text();
            console.error(`Server error response: ${errorText}`);
            throw new Error(`Failed to delete chat: ${response.status} ${errorText}`);
          }

          const responseData = await response.json();
          console.log('Delete chat response data:', responseData);

          // Update the chats state to remove the deleted chat
          setChats(prevChats => prevChats.filter(chat => chat._id !== chatId));
          
          // If the deleted chat was the current chat, select the first available chat
          if (currentChat?._id === chatId) {
            // Important: Use the updated chats array, not the stale one
            const remainingChats = chats.filter(chat => chat._id !== chatId);
            if (remainingChats.length > 0) {
              setCurrentChat(remainingChats[0]);
              fetchChatHistory(remainingChats[0]._id);
            } else {
              setCurrentChat(null);
              setChatHistory([]);
            }
          }

          message.success('Chat deleted');
        } catch (error) {
          console.error('Error deleting chat:', error);
          message.error(`Failed to delete chat: ${error.message}`);
        }
      },
      // Make sure the modal is destroyed when closed
      destroyOnClose: true
    });
  };

  const handleBulkDeleteChat = async (chatIds) => {
    try {
      setLoading(true);
      let successCount = 0;
      let failCount = 0;

      // Create an array of promises for each delete operation
      const deletePromises = chatIds.map(async (chatId) => {
        try {
          const deleteUrl = `${API_BASE_URL}/api/chats/${chatId}`;
          const response = await fetch(deleteUrl, {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json'
            }
          });

          if (!response.ok) {
            failCount++;
            return false;
          }

          await response.json();
          successCount++;
          return true;
        } catch (error) {
          console.error(`Error deleting chat ${chatId}:`, error);
          failCount++;
          return false;
        }
      });

      // Wait for all delete operations to complete
      await Promise.all(deletePromises);

      // Update the chats state to remove all deleted chats
      setChats(prevChats => prevChats.filter(chat => !chatIds.includes(chat._id)));

      // If the current chat was deleted, select the first available chat
      if (currentChat && chatIds.includes(currentChat._id)) {
        const remainingChats = chats.filter(chat => !chatIds.includes(chat._id));
        if (remainingChats.length > 0) {
          setCurrentChat(remainingChats[0]);
          fetchChatHistory(remainingChats[0]._id);
        } else {
          setCurrentChat(null);
          setChatHistory([]);
        }
      }

      // Show success/failure message
      if (failCount === 0) {
        message.success(`${successCount} chat${successCount !== 1 ? 's' : ''} deleted successfully`);
      } else if (successCount === 0) {
        message.error(`Failed to delete ${failCount} chat${failCount !== 1 ? 's' : ''}`);
      } else {
        message.warning(`${successCount} chat${successCount !== 1 ? 's' : ''} deleted, ${failCount} failed`);
      }
    } catch (error) {
      console.error('Error in bulk delete operation:', error);
      message.error(`Bulk delete operation failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteDocument = async (documentId) => {
    Modal.confirm({
      title: 'Delete Document',
      icon: <ExclamationCircleOutlined />,
      content: 'Are you sure you want to delete this document? This action cannot be undone.',
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          setLoading(true);
          console.log(`Attempting to delete document with ID: ${documentId}`);
          const deleteUrl = `${API_BASE_URL}/api/documents/${documentId}`;
          console.log(`DELETE request to: ${deleteUrl}`);
          
          const response = await fetch(deleteUrl, {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json'
            }
          });
          
          console.log(`Delete document response status: ${response.status}`);
          
          // If we get a 404, the document is already deleted, so we should just update the UI
          if (response.status === 404) {
            console.log('Document not found (already deleted). Updating UI...');
            
            // Remove from selected docs if it was selected
            if (selectedDocs.includes(documentId)) {
              setSelectedDocs(prev => prev.filter(id => id !== documentId));
            }
            
            // Refresh documents list
            await fetchDocuments();
            message.info('Document already removed');
            return;
          }
          
          if (!response.ok) {
            const errorText = await response.text();
            console.error(`Server error response: ${errorText}`);
            throw new Error(`Failed to delete document: ${response.status} ${errorText}`);
          }
          
          const responseData = await response.json();
          console.log('Delete document response data:', responseData);
          
          // Remove from selected docs if it was selected
          if (selectedDocs.includes(documentId)) {
            setSelectedDocs(prev => prev.filter(id => id !== documentId));
          }
          
          // Refresh documents list immediately
          await fetchDocuments();
          message.success('Document deleted successfully');
        } catch (error) {
          console.error('Error deleting document:', error);
          
          // Check if the error is a 404 (document not found)
          if (error.message && error.message.includes('404')) {
            console.log('Document not found (already deleted). Updating UI...');
            
            // Remove from selected docs if it was selected
            if (selectedDocs.includes(documentId)) {
              setSelectedDocs(prev => prev.filter(id => id !== documentId));
            }
            
            // Refresh documents list
            await fetchDocuments();
            message.info('Document already removed');
          } else {
            message.error(`Failed to delete document: ${error.message}`);
          }
        } finally {
          setLoading(false);
        }
      }
    });
  };

  return (
    <>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={
          <ProtectedRoute>
          <Layout style={{ height: '100vh' }}>
            
            <Sider
              width={280}
              collapsible
              collapsed={sidebarCollapsed}
              trigger={null}
              style={{
                backgroundColor: '#fff',
                borderRight: '1px solid #f0f0f0',
                height: '100vh', 
                position: 'fixed',
                left: 0,
                top: '0', 
                zIndex: 1,
                overflow: 'hidden',
                transition: 'all 0.2s'
              }}
            >
              {/* Toggle button for sidebar */}
              <Button 
                type="text" 
                className="sidebar-toggle-btn"
                icon={sidebarCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              />
              <div style={{ 
                padding: '16px',
                borderBottom: '1px solid #f0f0f0',
                backgroundColor: '#fff',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                  <h2 style={{ margin: 0, fontSize: '1.2rem' }}>AlgoWizzzz</h2>
                </div>
                

              </div>
              <div style={{ 
                height: 'calc(100vh - 123px)', 
                overflow: 'auto',
                display: 'flex',
                flexDirection: 'column'
              }}>
                <div style={{ flex: '0 0 auto', overflow: 'auto' }}>
                  <TaskSelector onTaskSelect={handleTaskSelect} />
                </div>
                <div style={{ flex: '0 0 auto', overflow: 'auto' }}>
                  <ChatList
                    chats={chats}
                    onChatSelect={handleChatSelect}
                    currentChat={currentChat}
                    onDeleteChat={handleDeleteChat}
                    onNewChat={handleNewChat}
                    onBulkDeleteChat={handleBulkDeleteChat}
                    onChatRename={handleChatRename}
                  />
                </div>
                <div style={{ flex: '0 0 auto', overflow: 'auto' }}>
                  <DocumentList
                    documents={documents}
                    selectedDocs={selectedDocs}
                    onDocumentSelect={setSelectedDocs}
                    onUploadDocument={() => setUploadModalVisible(true)}
                    onDeleteDocument={(docId) => {
                      setDocumentToDelete(docId);
                      setDeleteDocsModalVisible(true);
                    }}
                    loading={loading}
                  />
                </div>
                
                {/* Graph RAG Document Management Section - Temporarily Disabled
                {mode === 'graph-rag' && (
                  <div style={{ flex: '0 0 auto', overflow: 'auto', borderTop: '1px solid #f0f0f0', marginTop: '16px', paddingTop: '16px' }}>
                    <div style={{ padding: '0 16px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 500 }}>
                        <RobotOutlined style={{ marginRight: '8px' }} />
                        Graph RAG Documents
                      </h3>
                    </div>
                    <GraphDocumentUpload />
                    <GraphDocumentList 
                      selectedDocs={selectedDocs}
                      onDocumentSelect={setSelectedDocs}
                    />
                    <GraphProcessStatus />
                  </div>
                )}
                */}

              </div>
            </Sider>
            {/* Chat header and Tool section */}
            <div style={{ position: 'fixed', top: 0, left: sidebarCollapsed ? 40 : 280, right: 0, zIndex: 99, transition: 'left 0.2s' }}>
              <div style={{
                padding: '12px 24px',
                backgroundColor: '#fff',
                borderBottom: '1px solid #f0f0f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <RobotOutlined style={{ fontSize: '18px', color: '#1890ff' }} />
                  <span style={{ fontSize: '16px', fontWeight: 500 }}>
                    {currentChat?.title || 'New Chat'}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  {(mode === 'rag' || mode === 'graph-rag') && (
                    <Button 
                      type="text" 
                      onClick={() => setRightSiderVisible(!rightSiderVisible)}
                      icon={rightSiderVisible ? <MenuFoldOutlined /> : <MenuUnfoldOutlined />}
                    />
                  )}
                  <Header />
                </div>
              </div>
            </div>
            

            
            <Layout style={{ marginLeft: sidebarCollapsed ? '80px' : '280px', height: '100vh', marginTop: '0', transition: 'margin-left 0.2s' }}>
              {/* Right sidebar for document panel */}
              {rightSiderVisible && (
                <Sider
                  width={300}
                  style={{
                    backgroundColor: '#fff',
                    borderLeft: '1px solid #f0f0f0',
                    height: '100vh',
                    overflow: 'auto',
                    position: 'fixed',
                    right: 0,
                    top: 0,
                    zIndex: 1
                  }}
                >
                  {/* Document Panel */}
                  {mode === 'rag' && (
                    <div className="document-panel">
                      <div className="panel-header">
                        <h3>Selected Documents</h3>
                        <Button
                          type="primary"
                          size="small"
                          icon={<UploadOutlined />}
                          onClick={() => setUploadModalVisible(true)}
                        >
                          Upload
                        </Button>
                      </div>
                      <DocumentPanel
                        documents={documents}
                        selectedDocs={selectedDocs}
                        onDocumentSelect={handleDocSelect}
                      />
                    </div>
                  )}
                  
                  {/* Graph RAG Document Panel */}
                  {mode === 'graph-rag' && (
                    <div className="document-panel">
                      <div className="panel-header">
                        <h3>Graph RAG Documents</h3>
                      </div>
                      <GraphDocumentUpload 
                        onUploadSuccess={fetchDocuments} 
                        onDocumentSelect={(document) => {
                          setSelectedGraphDocument(document);
                          message.success(`Selected document: ${document.documentName}`);
                        }}
                      />
                    </div>
                  )}
                </Sider>
              )}
              
              <Content style={{ 
                height: '100vh', 
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                marginRight: rightSiderVisible ? '300px' : '0',
                transition: 'margin-right 0.2s'
              }}>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <ChatWindow 
                    messages={chatHistory}
                    onSendMessage={handleSendMessage}
                    loading={loading}
                    onNewChat={handleNewChat}
                    mode={mode}
                  />
                </div>
              </Content>
            </Layout>

            {/* Document Upload Modal */}
            <Modal
              title="Upload Document"
              open={uploadModalVisible}
              onCancel={() => setUploadModalVisible(false)}
              footer={null}
              width={500}
            >
              <DocumentUpload
                onUploadSuccess={(data) => {
                  message.success(`Document "${data.name}" uploaded successfully`);
                  fetchDocuments();
                  setUploadModalVisible(false);
                }}
                onUploadError={(error) => {
                  message.error('Upload failed: ' + error);
                }}
              />
            </Modal>
            
            {/* Document Management Modal */}
            <Modal
              title="Manage Documents"
              open={deleteDocsModalVisible}
              onCancel={() => setDeleteDocsModalVisible(false)}
              footer={[
                <Button key="close" onClick={() => setDeleteDocsModalVisible(false)}>
                  Close
                </Button>
              ]}
              width={600}
            >
              <div style={{ maxHeight: '400px', overflow: 'auto' }}>
                {documents.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '20px' }}>
                    <p>No documents available</p>
                    <Button 
                      type="primary" 
                      icon={<UploadOutlined />}
                      onClick={() => {
                        setDeleteDocsModalVisible(false);
                        setUploadModalVisible(true);
                      }}
                    >
                      Upload Document
                    </Button>
                  </div>
                ) : (
                  <List
                    itemLayout="horizontal"
                    dataSource={documents}
                    renderItem={(doc) => (
                      <List.Item
                        actions={[
                          <Button 
                            type="text" 
                            danger 
                            icon={<DeleteOutlined />} 
                            onClick={() => handleDeleteDocument(doc._id)}
                          />
                        ]}
                      >
                        <List.Item.Meta
                          avatar={<FileTextOutlined style={{ fontSize: '24px' }} />}
                          title={doc.name}
                          description={`Uploaded: ${new Date(doc.createdAt).toLocaleString()}`}
                        />
                      </List.Item>
                    )}
                  />
                )}
              </div>
            </Modal>
          </Layout>
          </ProtectedRoute>
        } />
        <Route path="/config" element={
          <ProtectedRoute>
            <ConfigPage apiBaseUrl={API_BASE_URL} />
          </ProtectedRoute>
        } />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </>
  );
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </Router>
  );
}

export default App;
