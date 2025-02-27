import React from 'react';
import { Select, Button, Tooltip } from 'antd';
const { Option } = Select;

const TopBar = ({ mode, setMode, onNewChat }) => {
  console.log('TopBar props:', { mode, setMode, onNewChat }); // Debug props

  return (
    <div className="flex justify-between items-center p-4 border-b">
      <div className="flex items-center space-x-4">
        <Select 
          value={mode} 
          onChange={setMode}
          style={{ width: 200 }}
        >
          <Option value="direct">General Chat</Option>
          <Option value="rag">Document Q&A</Option>
        </Select>
      </div>
      
      <Tooltip title="Start a new chat">
        <Button 
          type="primary" 
          onClick={() => {
            console.log('Button clicked'); // First debug point
            if (!onNewChat) {
              console.log('onNewChat is not defined!'); // Check if prop exists
              return;
            }
            console.log('Calling onNewChat...'); // Before calling
            onNewChat();
            console.log('Called onNewChat'); // After calling
          }}
        >
          New Chat
        </Button>
      </Tooltip>
    </div>
  );
};

export default TopBar; 