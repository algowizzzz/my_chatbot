import React, { useState } from 'react';
import { Radio, Button, Typography } from 'antd';
import { MenuFoldOutlined, MenuUnfoldOutlined, RobotOutlined, FileTextOutlined } from '@ant-design/icons';
import './ModeSelector.css';

const { Text } = Typography;

const ModeSelector = ({ mode, onModeChange }) => {
  const [listCollapsed, setListCollapsed] = useState(true);

  return (
    <div className="mode-selector-container">
      <div className="mode-selector-header">
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <h3>AI Tool</h3>
          <Button 
            type="text" 
            icon={listCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setListCollapsed(!listCollapsed)}
            size="small"
            style={{ marginLeft: '8px' }}
            aria-label={listCollapsed ? "Expand mode options" : "Collapse mode options"}
          />
        </div>
      </div>
      
      {!listCollapsed && (
        <div className="mode-selector-content">
          <Radio.Group 
            value={mode} 
            onChange={(e) => onModeChange(e.target.value)}
            className="mode-radio-group"
          >
            <Radio.Button value="direct" className="mode-radio-button">
              <RobotOutlined /> <span className="mode-label">General AI</span>
            </Radio.Button>
            <Radio.Button value="rag" className="mode-radio-button">
              <FileTextOutlined /> <span className="mode-label">Document Q&A</span>
            </Radio.Button>
          </Radio.Group>
          <Text type="secondary" className="mode-description">
            {mode === 'direct' 
              ? 'Chat with the AI assistant about any topic' 
              : 'Ask questions about your uploaded documents'}
          </Text>
        </div>
      )}
    </div>
  );
};

export default ModeSelector;
