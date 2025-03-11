import React, { useState } from 'react';
import { List, Button, Typography, Tooltip } from 'antd';
import { MenuFoldOutlined, MenuUnfoldOutlined, FileTextOutlined, VideoCameraOutlined, SoundOutlined, FileOutlined, RobotOutlined, ShareAltOutlined } from '@ant-design/icons';
import './ModeSelector.css'; // Reusing the same CSS

const { Text } = Typography;

const TaskSelector = ({ onTaskSelect }) => {
  const [listCollapsed, setListCollapsed] = useState(true);
  
  const tasks = [
    { id: 'direct', name: 'General AI', icon: <RobotOutlined />, enabled: true },
    { id: 'rag', name: 'Document Q&A', icon: <FileTextOutlined />, enabled: true },
    { id: 'graph-rag', name: 'Graph RAG', icon: <ShareAltOutlined />, enabled: true }
  ];

  return (
    <div className="mode-selector-container">
      <div className="mode-selector-header">
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <h3>Tasks</h3>
          <Button 
            type="text" 
            icon={listCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setListCollapsed(!listCollapsed)}
            size="small"
            style={{ marginLeft: '8px' }}
            aria-label={listCollapsed ? "Expand tasks" : "Collapse tasks"}
          />
        </div>
      </div>
      
      {!listCollapsed && (
        <div className="mode-selector-content">
          <List
            className="task-list"
            itemLayout="horizontal"
            dataSource={tasks}
            renderItem={(task) => (
              <Tooltip title={!task.enabled ? "This feature is currently unavailable" : ""}>
                <List.Item
                  className="task-list-item"
                  onClick={() => task.enabled && onTaskSelect(task.id)}
                  style={{ 
                    cursor: task.enabled ? 'pointer' : 'not-allowed',
                    padding: '8px 12px',
                    borderRadius: '4px',
                    marginBottom: '4px',
                    opacity: task.enabled ? 1 : 0.5
                  }}
                  onMouseEnter={(e) => {
                    if (task.enabled) {
                      e.currentTarget.style.backgroundColor = '#f5f5f5';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {task.icon}
                    <span>{task.name}</span>
                  </div>
                </List.Item>
              </Tooltip>
            )}
          />
        </div>
      )}
    </div>
  );
};

export default TaskSelector;
