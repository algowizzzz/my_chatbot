import React, { useState } from 'react';
import { List, Button, Typography, Tooltip, Checkbox, Space } from 'antd';
import { MessageOutlined, EditOutlined, DeleteOutlined, PlusOutlined, MenuFoldOutlined, MenuUnfoldOutlined, DeleteFilled } from '@ant-design/icons';
import './ChatList.css';

const { Text } = Typography;

const ChatList = ({ chats, currentChat, onChatSelect, onChatRename, onDeleteChat, onNewChat, onBulkDeleteChat }) => {
  const [listCollapsed, setListCollapsed] = useState(true);
  const [selectedChats, setSelectedChats] = useState([]);
  const [selectionMode, setSelectionMode] = useState(false);
  
  // Helper function to handle chat selection
  const handleChatSelection = (chatId) => {
    setSelectedChats(prev => {
      if (prev.includes(chatId)) {
        return prev.filter(id => id !== chatId);
      } else {
        return [...prev, chatId];
      }
    });
  };

  return (
    <div className="chat-list-container">
      <div className="chat-list-header">
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <h3>Chat History</h3>
          <Button 
            type="text" 
            icon={listCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setListCollapsed(!listCollapsed)}
            size="small"
            style={{ marginLeft: '8px' }}
            aria-label={listCollapsed ? "Expand chat list" : "Collapse chat list"}
          />
        </div>
        <Space>
          {!listCollapsed && selectionMode && (
            <Button 
              type="primary" 
              danger
              icon={<DeleteFilled />} 
              size="small"
              onClick={() => {
                if (selectedChats.length > 0) {
                  if (window.confirm(`Are you sure you want to delete ${selectedChats.length} selected chat(s)?`)) {
                    onBulkDeleteChat(selectedChats);
                    setSelectedChats([]);
                    setSelectionMode(false);
                  }
                } else {
                  alert('No chats selected');
                }
              }}
              disabled={selectedChats.length === 0}
            >
              Delete Selected
            </Button>
          )}
          {!listCollapsed && (
            <Button 
              type={selectionMode ? "default" : "dashed"} 
              size="small"
              onClick={() => {
                setSelectionMode(!selectionMode);
                setSelectedChats([]);
              }}
            >
              {selectionMode ? "Cancel" : "Select"}
            </Button>
          )}
          <Button 
            type="primary" 
            icon={<PlusOutlined />} 
            size="small"
            onClick={onNewChat}
            className="new-chat-btn"
          >
            New Chat
          </Button>
        </Space>
      </div>
      
      {!listCollapsed && (
        (!chats || chats.length === 0) ? (
          <div className="empty-chat-list">
            <p>Start a new conversation!</p>
          </div>
        ) : (
          <List
            className="chat-list"
            itemLayout="horizontal"
            dataSource={chats}
            renderItem={(chat) => {
              const isActive = currentChat && currentChat._id === chat._id;
              
              return (
                <List.Item
                  className={`chat-list-item ${isActive ? 'active' : ''} ${selectionMode && selectedChats.includes(chat._id) ? 'selected' : ''}`}
                  onClick={() => selectionMode ? handleChatSelection(chat._id) : onChatSelect(chat)}
                  actions={[
                    selectionMode && (
                      <Checkbox
                        checked={selectedChats.includes(chat._id)}
                        onChange={(e) => {
                          e.stopPropagation();
                          handleChatSelection(chat._id);
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ),
                    <Tooltip title="Rename">
                      <Button 
                        type="text" 
                        icon={<EditOutlined />} 
                        size="small"
                        className="chat-action-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          const newTitle = prompt('Enter new chat name:', chat.title);
                          if (newTitle && newTitle.trim() !== '') {
                            console.log('Attempting to rename chat:', chat._id);
                            console.log('onChatRename type:', typeof onChatRename);
                            console.log('onChatRename available:', onChatRename ? 'Yes' : 'No');
                            
                            if (typeof onChatRename === 'function') {
                              onChatRename(chat._id, newTitle.trim());
                            } else {
                              console.error('onChatRename is not a function!');
                              alert('Chat renaming functionality is not available. Please check the console for details.');
                            }
                          }
                        }}
                      />
                    </Tooltip>,
                    onDeleteChat && (
                      <Tooltip title="Delete">
                        <Button 
                          type="text" 
                          icon={<DeleteOutlined />} 
                          size="small" 
                          className="chat-action-btn delete"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm('Are you sure you want to delete this chat?')) {
                              onDeleteChat(chat._id);
                            }
                          }}
                        />
                      </Tooltip>
                    )
                  ].filter(Boolean)}
                >
                  <List.Item.Meta
                    avatar={
                      selectionMode ? (
                        <Checkbox
                          checked={selectedChats.includes(chat._id)}
                          onChange={(e) => {
                            e.stopPropagation();
                            handleChatSelection(chat._id);
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <MessageOutlined className={`chat-icon ${isActive ? 'active' : ''}`} />
                      )
                    }
                    title={<Text strong={isActive} className="chat-title">{chat.title || 'Untitled Chat'}</Text>}
                    description={
                      <Text type="secondary" ellipsis className="chat-preview">
                        {chat.messages && chat.messages.length > 0 
                          ? chat.messages[chat.messages.length - 1].content.substring(0, 30) + '...'
                          : 'No messages yet'}
                      </Text>
                    }
                  />
                </List.Item>
              );
            }}
          />
        )
      )}
    </div>
  );
};

export default ChatList;
