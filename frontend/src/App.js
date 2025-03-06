import React, { useState, useEffect } from 'react';
import ChatWindow from './components/ChatWindow';
import ChatList from './components/ChatList';
import DocumentPanel from './components/DocumentPanel';
import DocumentUpload from './components/DocumentUpload';
import LandingPage from './components/LandingPage';
import { Layout, Button, message, Select, Modal, List } from 'antd';
import { 
  PlusOutlined, 
  MessageOutlined, 
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
const { Content, Sider } = Layout;

// Add API base URL
const API_BASE_URL = 'http://localhost:5005'; // adjust this to match your backend port

function App() {
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

  // Load chats on mount
  useEffect(() => {
    fetchChats();
    if (mode === 'rag') {
      fetchDocuments();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  
  // Fetch documents when mode changes to RAG
  useEffect(() => {
    if (mode === 'rag') {
      fetchDocuments();
    }
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
      const response = await fetch(`${API_BASE_URL}/api/documents/list/test123`);
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

  const handleNewChat = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/chats/new`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'New Chat',
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
      message.success('New chat created');
    } catch (error) {
      console.error('Failed to create new chat:', error);
      message.error('Failed to create new chat');
    }
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

  const handleSendMessage = async (message) => {
    try {
      setLoading(true);
      // Add user message immediately to show in UI
      const newUserMessage = { role: 'user', content: message };
      setChatHistory(prev => [...prev, newUserMessage]);

      // Use the correct endpoint based on mode
      const endpoint = mode === 'rag' 
        ? `${API_BASE_URL}/api/documents/query` 
        : `${API_BASE_URL}/api/documents/query/direct`;
      
      const body = mode === 'rag' 
        ? { query: message, documentId: selectedDocs[0] } // Use first selected doc for now
        : { query: message };

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
        content: data.answer
      };
      setChatHistory(prev => [...prev, assistantMessage]);

      // Save messages to backend if you're tracking chat history
      if (currentChat) {
        await fetch(`${API_BASE_URL}/api/chats/${currentChat._id}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            messages: [newUserMessage, assistantMessage]
          })
        });
      }
    } catch (error) {
      console.error('Detailed error:', error);
      setChatHistory(prev => [...prev, {
        role: 'assistant',
        content: `Error: ${error.message}`
      }]);
      // Use notification instead of message to avoid conflicts
      console.error('Failed to send message');
      // Display error in chat instead of using message.error
      // This avoids potential conflicts with Ant Design's message API
    } finally {
      setLoading(false);
    }
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
          
          // Refresh documents list
          fetchDocuments();
          message.success('Document deleted successfully');
        } catch (error) {
          console.error('Error deleting document:', error);
          message.error(`Failed to delete document: ${error.message}`);
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const ChatbotApp = () => (
    <Layout style={{ height: '100vh' }}>
            {/* Top header with logo - full width */}
            <div style={{ 
              position: 'fixed', 
              top: 0, 
              left: 0, 
              right: 0, 
              backgroundColor: '#fff',
              borderBottom: '1px solid #f0f0f0',
              padding: '12px 24px',
              display: 'flex',
              justifyContent: 'flex-start',
              alignItems: 'center',
              zIndex: 100
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <RobotOutlined style={{ fontSize: '24px', color: '#1890ff' }} />
                <span style={{ fontSize: '18px', fontWeight: 600, color: '#1890ff' }}>
                  AlgoWiz AI
                </span>
              </div>
            </div>
            
            <Sider
              width={280}
              style={{
                backgroundColor: '#fff',
                borderRight: '1px solid #f0f0f0',
                height: 'calc(100vh - 50px)',
                position: 'fixed',
                left: 0,
                top: '50px',
                zIndex: 1
              }}
            >
              <div style={{ 
                padding: '16px',
                borderBottom: '1px solid #f0f0f0',
                backgroundColor: '#fff'
              }}>
                <Select
                  value={mode}
                  onChange={(value) => setMode(value)}
                  style={{ width: '100%', marginBottom: '10px' }}
                  options={[
                    { value: 'direct', label: 'General ChatGPT' },
                    { value: 'rag', label: 'Document Q&A' }
                  ]}
                />
                
                {/* Document Selection UI - Only shown in Document Q&A mode */}
                {mode === 'rag' && (
                  <div style={{ marginBottom: '16px', borderTop: '1px solid #f0f0f0', paddingTop: '16px' }}>
                    <div style={{ marginBottom: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontWeight: 500 }}>Documents</span>
                        <span style={{ color: '#8c8c8c', fontSize: '12px' }}>{documents.length} available</span>
                      </div>
                      <Select
                        placeholder="Select documents"
                        mode="multiple"
                        style={{ width: '100%', marginBottom: '10px' }}
                        value={selectedDocs}
                        onChange={(values) => {
                          // Handle multiple document selection
                          setSelectedDocs(values);
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
                                  onClick={() => setDeleteDocsModalVisible(true)}
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
                          <Select.Option key={doc._id} value={doc._id} label={doc.name}>
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                              <FileTextOutlined style={{ marginRight: '8px' }} />
                              <span>{doc.name}</span>
                            </div>
                          </Select.Option>
                        ))}
                      </Select>
                    </div>
                    <Button 
                      icon={<UploadOutlined />} 
                      onClick={() => setUploadModalVisible(true)}
                      block
                    >
                      Add Document
                    </Button>
                  </div>
                )}
              </div>
              <div style={{ height: mode === 'rag' ? 'calc(100vh - 250px)' : 'calc(100vh - 123px)', overflow: 'auto' }}>
                <ChatList
                  chats={chats}
                  onChatSelect={handleChatSelect}
                  currentChat={currentChat}
                  onDeleteChat={handleDeleteChat}
                />
              </div>
            </Sider>
            {/* Chat header and Tool section */}
            <div style={{ position: 'fixed', top: 50, left: 280, right: 0, zIndex: 99 }}>
              <div style={{
                padding: '12px 24px',
                backgroundColor: '#fff',
                borderBottom: '1px solid #f0f0f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <MessageOutlined style={{ fontSize: '18px', color: '#1890ff' }} />
                  <span style={{ fontSize: '16px', fontWeight: 500 }}>
                    {currentChat?.title || 'New Chat'}
                  </span>
                </div>
                {mode === 'rag' && (
                  <Button 
                    type="text" 
                    onClick={() => setRightSiderVisible(!rightSiderVisible)}
                    icon={rightSiderVisible ? <MenuFoldOutlined /> : <MenuUnfoldOutlined />}
                  />
                )}
              </div>
            </div>
            

            
            <Layout style={{ marginLeft: 280, height: '100vh', marginTop: '100px' }}>
              <Content style={{ 
                height: 'calc(100vh - 100px)',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column'
              }}>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <ChatWindow 
                    messages={chatHistory}
                    onSendMessage={handleSendMessage}
                    loading={loading}
                    onNewChat={handleNewChat}
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
  );

  return (
    <Router>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/app" element={<ChatbotApp />} />
        <Route path="/config" element={<ConfigPage apiBaseUrl={API_BASE_URL} />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Router>
  );
}

export default App;