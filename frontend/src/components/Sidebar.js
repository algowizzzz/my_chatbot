import React from 'react';
import { Menu, Button } from 'antd';
import { EditOutlined, SettingOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';

const Sidebar = ({ chats, currentChat, onChatSelect, onChatRename }) => {
  const navigate = useNavigate();

  const handleRename = (chat) => {
    const newTitle = prompt('Enter new chat name:', chat.title);
    if (newTitle && newTitle !== chat.title) {
      onChatRename(chat._id, newTitle);
    }
  };

  // Convert chats to menu items format
  const menuItems = chats.map(chat => ({
    key: chat._id,
    label: chat.title,
    onClick: () => onChatSelect(chat),
    extra: (
      <Button
        icon={<EditOutlined />}
        size="small"
        onClick={(e) => {
          e.stopPropagation();
          handleRename(chat);
        }}
      />
    )
  }));

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b">
        <Button 
          icon={<SettingOutlined />}
          onClick={() => navigate('/config')}
          type="primary"
          block
        >
          Graph RAG Settings
        </Button>
      </div>
      <Menu
        mode="inline"
        selectedKeys={[currentChat?._id]}
        className="flex-1 overflow-auto"
        items={menuItems}
      />
    </div>
  );
};

export default Sidebar; 