import React, { useState, useEffect } from 'react';
import ChatWindow from './components/ChatWindow';
import TopBar from './components/TopBar';
import Sidebar from './components/Sidebar';
import DocumentPanel from './components/DocumentPanel';
import { Layout } from 'antd';
const { Content, Sider } = Layout;

function App() {
  const [chatHistory, setChatHistory] = useState([]);
  const [currentChat, setCurrentChat] = useState(null);
  const [chats, setChats] = useState([]);
  const [mode, setMode] = useState('direct'); // 'direct' or 'rag'
  const [selectedDocs, setSelectedDocs] = useState([]);
  const [rightSiderVisible, setRightSiderVisible] = useState(false);

  // Load chats on mount
  useEffect(() => {
    fetchChats();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Show/hide right sider based on mode
  useEffect(() => {
    setRightSiderVisible(mode === 'rag');
    if (mode === 'direct') {
      setSelectedDocs([]); // Clear selected docs when switching to direct mode
    }
  }, [mode]);

  const fetchChats = async () => {
    try {
      const response = await fetch('/api/chats');
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

  const fetchChatHistory = async (chatId) => {
    try {
      const response = await fetch(`/api/chats/${chatId}/messages`);
      const data = await response.json();
      setChatHistory(data);
    } catch (error) {
      console.error('Failed to fetch chat history:', error);
    }
  };

  const handleNewChat = async () => {
    try {
      // For now, just create a local chat without backend
      const newChat = {
        _id: Date.now().toString(),
        title: 'New Chat',
        createdAt: new Date().toISOString()
      };
      
      console.log('Creating new chat locally:', newChat);
      setChats(prev => [newChat, ...prev]);
      setCurrentChat(newChat);
      setChatHistory([]);
      
    } catch (error) {
      console.error('Failed to create new chat:', error);
    }
  };

  const handleChatSelect = (chat) => {
    setCurrentChat(chat);
    fetchChatHistory(chat._id);
  };

  const handleChatRename = async (chatId, newTitle) => {
    try {
      const response = await fetch(`/api/chats/${chatId}/rename`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle })
      });
      const updatedChat = await response.json();
      setChats(chats.map(chat => 
        chat._id === chatId ? updatedChat : chat
      ));
      if (currentChat._id === chatId) {
        setCurrentChat(updatedChat);
      }
    } catch (error) {
      console.error('Failed to rename chat:', error);
    }
  };

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
      // Add user message immediately to show in UI
      const newUserMessage = { role: 'user', content: message };
      setChatHistory(prev => [...prev, newUserMessage]);

      // Use the correct endpoint based on mode
      const endpoint = mode === 'rag' 
        ? '/api/documents/query' 
        : '/api/documents/query/direct';
      
      const body = mode === 'rag' 
        ? { query: message, documentIds: selectedDocs }
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
        await fetch(`/api/chats/${currentChat._id}/messages`, {
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
    }
  };

  const handleClick = () => {
    console.log('New Chat button clicked');  // Add this
    handleNewChat();
  };

  return (
    <Layout style={{ height: '100vh' }}>
      <Sider 
        width={250} 
        theme="light"
        style={{
          overflow: 'auto',
          height: '100vh',
          position: 'fixed',
          left: 0,
        }}
      >
        <Sidebar 
          chats={chats}
          currentChat={currentChat}
          onChatSelect={handleChatSelect}
          onChatRename={handleChatRename}
        />
      </Sider>
      
      <Layout style={{ marginLeft: 250, marginRight: rightSiderVisible ? 300 : 0 }}>
        <TopBar 
          mode={mode} 
          setMode={setMode}
          onNewChat={handleClick}
        />
        
        <Content style={{ 
          height: 'calc(100vh - 64px)',
          padding: '20px',
          overflow: 'auto'
        }}>
          <ChatWindow 
            messages={chatHistory}
            onSendMessage={handleSendMessage}
          />
        </Content>
      </Layout>

      {rightSiderVisible && (
        <Sider 
          width={300} 
          theme="light"
          style={{
            overflow: 'auto',
            height: '100vh',
            position: 'fixed',
            right: 0,
          }}
        >
          <DocumentPanel
            visible={rightSiderVisible}
            selectedDocs={selectedDocs}
            onDocSelect={handleDocSelect}
          />
        </Sider>
      )}
    </Layout>
  );
}

export default App;