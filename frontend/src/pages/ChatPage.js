import React, { useState, useEffect } from 'react';
import Sidebar from '../components/Sidebar';
import ChatWindow from '../components/ChatWindow';

const ChatPage = ({ apiBaseUrl }) => {
  const [chats, setChats] = useState([]);
  const [currentChat, setCurrentChat] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchChats();
  }, []);

  const fetchChats = async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/api/chats`);
      if (!response.ok) throw new Error('Failed to fetch chats');
      const data = await response.json();
      setChats(data);
    } catch (error) {
      console.error('Failed to fetch chats:', error);
      setError('Failed to load chats');
    }
  };

  const handleChatSelect = (chat) => {
    setCurrentChat(chat);
  };

  const handleChatRename = async (chatId, newTitle) => {
    try {
      const response = await fetch(`${apiBaseUrl}/api/chats/${chatId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title: newTitle }),
      });
      if (!response.ok) throw new Error('Failed to rename chat');
      fetchChats(); // Refresh chat list
    } catch (error) {
      console.error('Failed to rename chat:', error);
    }
  };

  const handleSendMessage = async (message) => {
    // Add message handling logic here
  };

  if (error) {
    return <div className="p-4 text-red-500">{error}</div>;
  }

  return (
    <div className="flex h-screen">
      <div className="w-64 border-r">
        <Sidebar 
          chats={chats} 
          currentChat={currentChat}
          onChatSelect={handleChatSelect}
          onChatRename={handleChatRename}
        />
      </div>
      <div className="flex-1">
        <ChatWindow 
          messages={currentChat?.messages || []}
          onSendMessage={handleSendMessage}
        />
      </div>
    </div>
  );
};

export default ChatPage; 