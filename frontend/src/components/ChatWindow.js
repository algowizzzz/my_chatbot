import React, { useState, useRef, useEffect } from 'react';
import { Spin, Typography, Tooltip, message, Button, Badge } from 'antd';
import { 
  SendOutlined, 
  ReloadOutlined, 
  EditOutlined, 
  CopyOutlined, 
  CheckOutlined,
  LikeOutlined,
  DislikeOutlined,
  BarChartOutlined,
  CloseOutlined,
  InfoCircleOutlined,
  FileTextOutlined
} from '@ant-design/icons';
import './ChatWindow.css';
import humanIcon from '../assets/human-icon.svg';
import botIcon from '../assets/bot-icon.svg';
import GraphInsights from './GraphInsights';
import SourceDisplay from './SourceDisplay';

const { Text } = Typography;

/**
 * ChatWindow component for the Algowizz Chatbot
 * Displays chat messages and provides input for sending new messages
 */
const ChatWindow = ({ messages = [], onSendMessage, loading, onNewChat, mode }) => {
  const [inputMessage, setInputMessage] = useState('');
  const [editingMessageIndex, setEditingMessageIndex] = useState(null);
  const [editText, setEditText] = useState('');
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [showInsights, setShowInsights] = useState(false);
  const [currentQuery, setCurrentQuery] = useState('');
  const [expandedSources, setExpandedSources] = useState({});
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const editInputRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    // Focus the input field when the component mounts
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (editingMessageIndex !== null && editInputRef.current) {
      editInputRef.current.focus();
    }
  }, [editingMessageIndex]);

  const handleSend = () => {
    if (inputMessage.trim()) {
      // If in graph-rag mode, store the query for insights
      if (mode === 'graph-rag') {
        setCurrentQuery(inputMessage.trim());
      }
      onSendMessage(inputMessage);
      setInputMessage('');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };
  
  const handleEditKeyDown = (e, index) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSaveEdit(index);
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  const handleEdit = (index) => {
    setEditingMessageIndex(index);
    setEditText(messages[index].content);
  };

  const handleSaveEdit = (index) => {
    if (editText.trim() && index === editingMessageIndex) {
      // Create a copy of messages and update the edited one
      const updatedMessages = [...messages];
      updatedMessages[index] = {
        ...updatedMessages[index],
        content: editText.trim(),
        edited: true
      };
      
      // Here you would typically call an API to update the message
      // For now, we'll just update the local state via the parent component
      onSendMessage(editText.trim(), index);
      
      setEditingMessageIndex(null);
      setEditText('');
    }
  };

  const handleCancelEdit = () => {
    setEditingMessageIndex(null);
    setEditText('');
  };

  const handleCopy = (text, index) => {
    navigator.clipboard.writeText(text)
      .then(() => {
        setCopiedIndex(index);
        setTimeout(() => setCopiedIndex(null), 2000);
        message.success('Copied to clipboard');
      })
      .catch(err => {
        console.error('Failed to copy text: ', err);
        message.error('Failed to copy text');
      });
  };

  const handleRegenerateResponse = (index) => {
    // Find the last user message before this assistant message
    let userMessageIndex = index - 1;
    while (userMessageIndex >= 0 && messages[userMessageIndex].role !== 'user') {
      userMessageIndex--;
    }
    
    if (userMessageIndex >= 0) {
      // Resend the user message to regenerate the response
      onSendMessage(messages[userMessageIndex].content, userMessageIndex, true);
    }
  };

  const toggleInsights = () => {
    setShowInsights(!showInsights);
  };

  const handleCloseInsights = () => {
    setShowInsights(false);
  };
  
  const toggleSourceExpansion = (index) => {
    setExpandedSources(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };
  
  // Count sources in a message's metadata
  const countSources = (metadata) => {
    if (!metadata || !metadata.relevantChunks) return 0;
    
    // Get unique document names
    const uniqueDocs = new Set();
    metadata.relevantChunks.forEach(chunk => {
      if (chunk.metadata?.documentName) {
        uniqueDocs.add(chunk.metadata.documentName);
      }
    });
    
    return uniqueDocs.size;
  };

  return (
    <div className="chat-window">
      {mode === 'graph-rag' && (
        <div className="graph-rag-controls">
          <Tooltip title="View graph insights and entity relationships for your query">
            <Button 
              type={showInsights ? "primary" : "default"}
              icon={<BarChartOutlined />}
              onClick={toggleInsights}
              className="insights-button"
            >
              {showInsights ? "Hide Insights" : "Knowledge Graph Insights"}
            </Button>
          </Tooltip>
          <div className="graph-mode-indicator">
            <Badge status="processing" color="#1890ff" />
            <span>Graph RAG Mode</span>
            <Tooltip title="Using knowledge graph enhanced retrieval for more accurate answers">
              <InfoCircleOutlined className="info-icon" />
            </Tooltip>
          </div>
        </div>
      )}

      {showInsights && currentQuery && (
        <GraphInsights query={currentQuery} onClose={handleCloseInsights} />
      )}

      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="empty-chat">
            <Text>No messages yet. Start a conversation!</Text>
          </div>
        ) : (
          messages.map((msg, index) => (
            <div
              key={index}
              className={`message-container ${msg.role}`}
            >
              {editingMessageIndex === index ? (
                <div className={`message-bubble ${msg.role} editing`}>
                  <img 
                    src={msg.role === 'user' ? humanIcon : botIcon} 
                    alt={`${msg.role === 'user' ? 'User' : 'Bot'} Icon`} 
                    className="message-icon" 
                  />
                  <div className="bubble-content edit-mode">
                    <textarea
                      ref={editInputRef}
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e) => handleEditKeyDown(e, index)}
                      className="edit-textarea"
                    />
                    <div className="edit-actions">
                      <button className="edit-btn save" onClick={() => handleSaveEdit(index)}>Save</button>
                      <button className="edit-btn cancel" onClick={handleCancelEdit}>Cancel</button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className={`message-bubble ${msg.role}`}>
                  <img 
                    src={msg.role === 'user' ? humanIcon : botIcon} 
                    alt={`${msg.role === 'user' ? 'User' : 'Bot'} Icon`} 
                    className="message-icon" 
                  />
                  <div className="bubble-content">
                    <p>{msg.content}</p>
                    
                    {/* Source Display for Graph RAG responses */}
                    {mode === 'graph-rag' && msg.role === 'assistant' && msg.metadata && (
                      <div className="source-display-container">
                        <SourceDisplay 
                          metadata={msg.metadata} 
                          key={`source-${index}`}
                          expanded={expandedSources[index]}
                        />
                        {msg.metadata.relevantChunks && msg.metadata.relevantChunks.length > 0 && (
                          <div className="source-toggle" onClick={() => toggleSourceExpansion(index)}>
                            <FileTextOutlined />
                            <span>
                              {expandedSources[index] ? 'Hide Sources' : `View Sources (${countSources(msg.metadata)} documents)`}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                    
                    <div className="message-footer">
                      <span className="timestamp">
                        {msg.edited && <span className="edited-label">(edited) </span>}
                        {new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </span>
                      <div className="message-actions">
                        {msg.role === 'user' && (
                          <Tooltip title="Edit message">
                            <button 
                              className="action-btn" 
                              onClick={() => handleEdit(index)}
                              aria-label="Edit message"
                            >
                              <EditOutlined />
                            </button>
                          </Tooltip>
                        )}
                        {msg.role === 'assistant' && (
                          <Tooltip title="Regenerate response">
                            <button 
                              className="action-btn" 
                              onClick={() => handleRegenerateResponse(index)}
                              aria-label="Regenerate response"
                              disabled={loading}
                            >
                              <ReloadOutlined />
                            </button>
                          </Tooltip>
                        )}
                        <Tooltip title={copiedIndex === index ? "Copied!" : "Copy to clipboard"}>
                          <button 
                            className="action-btn" 
                            onClick={() => handleCopy(msg.content, index)}
                            aria-label="Copy to clipboard"
                          >
                            {copiedIndex === index ? <CheckOutlined /> : <CopyOutlined />}
                          </button>
                        </Tooltip>
                        {msg.role === 'assistant' && (
                          <>
                            <Tooltip title="Thumbs up">
                              <button className="action-btn" aria-label="Thumbs up">
                                <LikeOutlined />
                              </button>
                            </Tooltip>
                            <Tooltip title="Thumbs down">
                              <button className="action-btn" aria-label="Thumbs down">
                                <DislikeOutlined />
                              </button>
                            </Tooltip>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
        {loading && (
          <div className="loading-container">
            <Spin />
            <Text type="secondary" style={{ marginTop: 'var(--spacing-sm)' }}>
              AI is thinking...
            </Text>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      
      <div className="chat-input-area">
        <input
          ref={inputRef}
          className="chat-input"
          type="text"
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type your message..."
          disabled={loading || editingMessageIndex !== null}
        />
        <button 
          className="send-button" 
          onClick={handleSend}
          disabled={loading}
          style={{ backgroundColor: '#FF6E40', color: '#FFFFFF' }}
        >
          <SendOutlined style={{ color: '#FFFFFF' }} />
        </button>
      </div>
    </div>
  );
};

export default ChatWindow; 