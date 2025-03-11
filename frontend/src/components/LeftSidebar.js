import React, { useState } from 'react';
import { Button } from 'antd';
import { 
  FileOutlined, 
  PlusOutlined, 
  DeleteOutlined, 
  RobotOutlined,
  MessageOutlined
} from '@ant-design/icons';
import './LeftSidebar.css';

/**
 * LeftSidebar component for the Algowizz Chatbot
 * Contains three main sections: Files, Skills, and Chat History
 */
const LeftSidebar = ({ 
  chats = [], 
  currentChat, 
  onChatSelect, 
  onChatRename, 
  onDeleteChat,
  onNewChat,
  mode,
  setMode
}) => {
  const [filesExpanded, setFilesExpanded] = useState(false);

  // Toggle files dropdown
  const toggleFilesDropdown = () => {
    setFilesExpanded(!filesExpanded);
  };

  // Handle skill selection
  const handleSkillSelect = (skillMode) => {
    if (setMode) {
      setMode(skillMode);
    }
  };

  return (
    <div className="sidebar">
      {/* Files Section */}
      <div className="sidebar-section">
        <h2 className="section-title">Files</h2>
        <div className="section-content">
          <div className="dropdown-header" onClick={toggleFilesDropdown}>
            <FileOutlined /> Files
            <span className={`dropdown-arrow ${filesExpanded ? 'expanded' : ''}`}>▼</span>
          </div>
          
          {filesExpanded && (
            <div className="dropdown-content">
              <div className="file-actions">
                <Button 
                  type="text" 
                  icon={<PlusOutlined />} 
                  className="sidebar-button"
                >
                  Add New File
                </Button>
                <Button 
                  type="text" 
                  icon={<DeleteOutlined />} 
                  className="sidebar-button"
                >
                  Delete File
                </Button>
              </div>
              <div className="file-list">
                {/* File list would go here */}
                <div className="file-item">Sample Document 1</div>
                <div className="file-item">Sample Document 2</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Skills Section */}
      <div className="sidebar-section">
        <h2 className="section-title">Skills</h2>
        <div className="section-content">
          <Button 
            type="text" 
            icon={<MessageOutlined />} 
            className={`sidebar-button ${mode === 'direct' ? 'active' : ''}`}
            onClick={() => handleSkillSelect('direct')}
          >
            Chatbot
          </Button>
          <Button 
            type="text" 
            icon={<RobotOutlined />} 
            className={`sidebar-button ${mode === 'rag' ? 'active' : ''}`}
            onClick={() => handleSkillSelect('rag')}
          >
            RAG
          </Button>
        </div>
      </div>

      {/* Chat History Section */}
      <div className="sidebar-section">
        <h2 className="section-title">Chat History</h2>
        <div className="section-content">
          <Button 
            type="text" 
            icon={<PlusOutlined />} 
            className="sidebar-button new-chat"
            onClick={onNewChat}
          >
            New Chat
          </Button>
          
          <div className="chat-list">
            {chats.length === 0 ? (
              <div className="empty-state">No chats yet</div>
            ) : (
              chats.map((chat) => (
                <div 
                  key={chat._id} 
                  className={`chat-item ${currentChat && currentChat._id === chat._id ? 'active' : ''}`}
                  onClick={() => onChatSelect(chat)}
                >
                  <span className="chat-title">{chat.title}</span>
                  <div className="chat-actions">
                    <Button 
                      type="text" 
                      size="small" 
                      icon={<DeleteOutlined />} 
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteChat && onDeleteChat(chat._id);
                      }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LeftSidebar;
