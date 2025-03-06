import React, { useState, useRef, useEffect } from 'react';
import { Input, Button, Spin, Typography, Tooltip, Progress } from 'antd';
import { SendOutlined, PlusOutlined, BarChartOutlined, TeamOutlined, ApiOutlined } from '@ant-design/icons';
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';
import 'highlight.js/styles/github.css';
import './ChatWindow.css';

const { Text } = Typography;

const ChunkAnalysis = ({ analysis }) => {
  const relevancePercent = Math.round(analysis.averageRelevanceScore * 100);
  const relevanceColor = 
    relevancePercent >= 85 ? '#52c41a' : 
    relevancePercent >= 70 ? '#faad14' : 
    '#f5222d';

  return (
    <div className="chunk-analysis">
      <div className="analysis-section">
        <h4><BarChartOutlined /> Source Analysis</h4>
        <ul>
          <li>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ minWidth: '90px' }}>Relevance:</span>
              <Progress 
                percent={relevancePercent}
                size="small"
                strokeColor={relevanceColor}
                style={{ flex: 1, marginBottom: 0 }}
              />
            </div>
          </li>
          <li>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ minWidth: '90px' }}>Sources:</span>
              <span style={{ color: '#1890ff' }}>{analysis.primaryChunks}</span>
              <span style={{ color: '#8c8c8c' }}>/</span>
              <span>{analysis.totalChunks} chunks</span>
              <span style={{ color: '#8c8c8c', marginLeft: 'auto' }}>📄 {analysis.pageRanges.join(', ')}</span>
            </div>
          </li>
        </ul>
      </div>
      
      <div className="analysis-section">
        <h4><TeamOutlined /> Key Concepts</h4>
        <ul>
          {analysis.entityAnalysis.entities.map((entity, i) => (
            <li key={i}>
              <Tooltip title={`Type: ${entity.type}`}>
                <span style={{ color: '#1890ff', cursor: 'help' }}>{entity.name}</span>
              </Tooltip>
              <span style={{ marginLeft: 'auto', color: '#8c8c8c' }}>{entity.frequency}×</span>
            </li>
          )).slice(0, 4)}
        </ul>
      </div>
      
      <div className="analysis-section">
        <h4><ApiOutlined /> Relationships</h4>
        <ul>
          {analysis.entityAnalysis.relationships.map((rel, i) => (
            <li key={i}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', width: '100%' }}>
                <Tooltip title="Subject">
                  <span style={{ color: '#1890ff', cursor: 'help' }}>{rel.entity1}</span>
                </Tooltip>
                <span style={{ color: '#8c8c8c' }}>→</span>
                <Tooltip title="Action">
                  <span style={{ color: '#52c41a', cursor: 'help' }}>{rel.relationship}</span>
                </Tooltip>
                <span style={{ color: '#8c8c8c' }}>→</span>
                <Tooltip title="Object">
                  <span style={{ color: '#1890ff', cursor: 'help' }}>{rel.entity2}</span>
                </Tooltip>
              </div>
            </li>
          )).slice(0, 2)}
        </ul>
      </div>
    </div>
  );
};

const Message = ({ msg, isLastUserMessage }) => {
  const renderMarkdown = (content) => {
    const md = new MarkdownIt({
      html: false,
      linkify: true,
      typographer: true,
      breaks: true,
      highlight: function (str, lang) {
        if (lang && hljs.getLanguage(lang)) {
          try {
            return hljs.highlight(str, { language: lang }).value;
          } catch (__) {}
        }
        return ''; // use external default escaping
      }
    });

    // Custom rendering rules for section headings
    md.renderer.rules.heading_open = (tokens, idx) => {
      const token = tokens[idx];
      const level = token.tag;
      const nextToken = tokens[idx + 1];
      const content = nextToken ? nextToken.content : '';
      
      // Add emoji icons to main sections
      if (content.includes('ANSWER')) {
        return `<${level} class="section-heading">💡 `;
      } else if (content.includes('SOURCES')) {
        return `<${level} class="section-heading">📚 `;
      } else if (content.includes('SYNTHESIS')) {
        return `<${level} class="section-heading">🔗 `;
      } else if (content.includes('IMPORTANT')) {
        return `<${level} class="section-heading">⚠️ `;
      }
      return `<${level}>`;
    };

    return { __html: md.render(content) };
  };

  if (msg.role === 'user') {
    return (
      <div className={`message-bubble ${msg.role}`}>
        {msg.content}
      </div>
    );
  }

  return (
    <div className="assistant-response">
      {isLastUserMessage && msg.analysis && (
        <ChunkAnalysis analysis={msg.analysis} />
      )}
      <div 
        className={`message-bubble ${msg.role}`}
        dangerouslySetInnerHTML={renderMarkdown(msg.content)}
      />
    </div>
  );
};

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
        {messages.map((msg, index) => {
          const isLastUserMessage = index > 0 && 
            messages[index - 1].role === 'user' && 
            msg.role === 'assistant';
            
          return (
            <div
              key={index}
              className={`message-container ${msg.role}`}
            >
              <Message msg={msg} isLastUserMessage={isLastUserMessage} />
            </div>
          );
        })}
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