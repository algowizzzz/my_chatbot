import React, { useState, useEffect, useCallback } from 'react';
import { message } from 'antd';
import Sidebar from '../components/Sidebar';
import ChatWindow from '../components/ChatWindow';

const ChatPage = ({ apiBaseUrl }) => {
  const [chats, setChats] = useState([]);
  const [currentChat, setCurrentChat] = useState(null);
  const [error, setError] = useState(null);

  const fetchChats = useCallback(async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/api/chats`);
      if (!response.ok) throw new Error('Failed to fetch chats');
      const data = await response.json();
      setChats(data);
    } catch (error) {
      console.error('Failed to fetch chats:', error);
      setError('Failed to load chats');
      message.error('Failed to load chats');
    }
  }, [apiBaseUrl]);

  useEffect(() => {
    fetchChats();
  }, [fetchChats]);

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
      message.error('Failed to rename chat');
    }
  };

  const handleNewChat = async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/api/chats/new`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title: 'New Chat' }),
      });
      
      if (!response.ok) throw new Error('Failed to create new chat');
      
      const newChat = await response.json();
      await fetchChats(); // Refresh chat list
      setCurrentChat(newChat); // Set the new chat as current
      message.success('New chat created');
    } catch (error) {
      console.error('Failed to create new chat:', error);
      message.error('Failed to create new chat');
    }
  };

  const handleSendMessage = async (newMessage) => {
    if (!currentChat) {
      message.error('Please select or create a chat first');
      return;
    }

    try {
      // Add user message to UI immediately
      const updatedChat = {
        ...currentChat,
        messages: [...(currentChat?.messages || []), { 
          role: 'user', 
          content: newMessage 
        }]
      };
      setCurrentChat(updatedChat);

      // Send message to API
      const response = await fetch(`${apiBaseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: newMessage,
          chatId: currentChat._id
        })
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      const aiResponse = await response.json();
      
      // Add AI response to chat
      setCurrentChat(prev => ({
        ...prev,
        messages: [...prev.messages, {
          role: 'assistant',
          content: aiResponse.text
        }]
      }));

    } catch (error) {
      console.error('Message send error:', error);
      message.error('Failed to send message. Please try again.');
    }
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
          onNewChat={handleNewChat}
          loading={false}
        />
      </div>
    </div>
  );
};

export default ChatPage; 