import React, { useState, useRef, useEffect } from 'react';
import { Input, Button, Spin, Typography, Tooltip } from 'antd';
import { SendOutlined, PlusOutlined } from '@ant-design/icons';
import './ChatWindow.css';

const { Text } = Typography;

const ChatWindow = ({ messages, onSendMessage, loading, onNewChat }) => {
  const [message, setMessage] = useState('');
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = () => {
    if (message.trim()) {
      onSendMessage(message);
      setMessage('');
    }
  };

  return (
    <div className="chat-window">
      <div className="chat-messages">
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: '#666', margin: 'auto' }}>
            <Text type="secondary">No messages yet. Start a conversation!</Text>
          </div>
        )}
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`message-container ${msg.role}`}
          >
            <div
              className={`message-bubble ${msg.role}`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="loading-container">
            <Spin />
            <Text type="secondary" style={{ display: 'block', marginTop: '8px' }}>
              AI is thinking...
            </Text>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      
      <div className="input-container">
        <div className="input-wrapper">
          <Tooltip title="New chat">
            <Button
              type="text"
              onClick={onNewChat}
              size="large"
              icon={<PlusOutlined />}
              style={{ marginRight: '8px', borderRadius: '8px' }}
            />
          </Tooltip>
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onPressEnter={handleSend}
            placeholder="Type your message..."
            size="large"
            disabled={loading}
            style={{ borderRadius: '8px', flex: 1 }}
          />
          <Button 
            type="primary" 
            onClick={handleSend}
            size="large"
            icon={<SendOutlined />}
            loading={loading}
            style={{ borderRadius: '8px' }}
          />
        </div>
      </div>
    </div>
  );
};

export default ChatWindow; 