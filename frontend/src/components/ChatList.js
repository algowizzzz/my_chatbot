import React, { useState } from 'react';
import { Button, Typography, Spin, message, Tooltip, Modal, Input } from 'antd';
import { DeleteOutlined, MessageOutlined, ExclamationCircleOutlined, EditOutlined } from '@ant-design/icons';
import './ChatList.css';

const { Text } = Typography;
const API_BASE_URL = 'http://localhost:5005';

const ChatList = ({ chats = [], onChatSelect, currentChat, onDeleteChat, onChatUpdate }) => {
  const [loading, setLoading] = useState(false);
  const [renamingChatId, setRenamingChatId] = useState(null);
  const [newChatTitle, setNewChatTitle] = useState('');
  const currentChatId = currentChat?._id;

  const handleDeleteChat = (chatId) => {
    // Just call the parent component's delete handler
    // This avoids having two Modal.confirm dialogs
    if (onDeleteChat) {
      onDeleteChat(chatId);
    }
  };
  
  const handleRenameChat = async (chatId, currentTitle) => {
    setRenamingChatId(chatId);
    setNewChatTitle(currentTitle);
  };
  
  const submitRename = async (chatId) => {
    if (!newChatTitle.trim()) {
      message.error('Chat title cannot be empty');
      return;
    }
    
    try {
      // Optimistically update the UI first
      const updatedChat = chats.find(c => c._id === chatId);
      if (updatedChat) {
        const optimisticUpdate = { ...updatedChat, title: newChatTitle.trim() };
        onChatUpdate(optimisticUpdate);
      }

      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/api/chats/${chatId}/rename`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ title: newChatTitle.trim() })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to rename chat');
      }
      
      // Update with the server response data
      if (data.chat && onChatUpdate) {
        onChatUpdate(data.chat);
      }
      
      message.success('Chat renamed successfully');
      setRenamingChatId(null); // Close the input after successful rename
    } catch (error) {
      console.error('Error renaming chat:', error);
      message.error(error.message);
      // Revert the optimistic update on error
      if (onChatUpdate) {
        const originalChat = chats.find(c => c._id === chatId);
        if (originalChat) {
          onChatUpdate(originalChat);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="empty-state">
        <Spin size="large" />
      </div>
    );
  }

  if (chats.length === 0) {
    return (
      <div className="empty-state">
        <MessageOutlined className="empty-icon" />
        <Text type="secondary">No chats yet</Text>
      </div>
    );
  }

  return (
    <div className="chat-list">
      {chats.map((chat) => (
        <div
          key={chat._id}
          className={`chat-item ${currentChatId === chat._id ? 'active' : ''} ${chat.isNew ? 'new' : ''}`}
          onClick={() => onChatSelect(chat)}
        >
          <MessageOutlined className="chat-icon" />
          <div className="chat-item-content">
            {renamingChatId === chat._id ? (
              <div onClick={(e) => e.stopPropagation()} style={{ width: '100%' }}>
                <Input 
                  value={newChatTitle}
                  onChange={(e) => setNewChatTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      e.stopPropagation();
                      submitRename(chat._id);
                    } else if (e.key === 'Escape') {
                      setRenamingChatId(null);
                    }
                  }}
                  onBlur={(e) => {
                    // Only hide the input if we're not clicking the save button
                    const target = e.relatedTarget;
                    if (!target || !target.classList.contains('save-button')) {
                      setRenamingChatId(null);
                    }
                  }}
                  autoFocus
                  size="small"
                  addonAfter={
                    <Button 
                      type="text" 
                      size="small" 
                      className="save-button"
                      onClick={(e) => {
                        e.stopPropagation();
                        submitRename(chat._id);
                      }}
                      style={{ padding: 0, margin: 0 }}
                    >
                      Save
                    </Button>
                  }
                />
              </div>
            ) : (
              <>
                <h4 className="chat-title">{chat.title || 'Untitled Chat'}</h4>
                <p className="chat-preview">{formatDate(chat.createdAt)}</p>
              </>
            )}
          </div>
          <div className="chat-actions">
            <Tooltip title="Rename chat">
              <Button
                type="text"
                size="small"
                icon={<EditOutlined />}
                onClick={(e) => {
                  e.stopPropagation();
                  handleRenameChat(chat._id, chat.title || 'Untitled Chat');
                }}
                style={{ marginRight: '4px' }}
              />
            </Tooltip>
            <Tooltip title="Delete chat">
              <Button
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteChat(chat._id);
                }}
              />
            </Tooltip>
          </div>
        </div>
      ))}
    </div>
  );
};

export default ChatList;
