import React from 'react';
import { Menu, Button } from 'antd';
import { EditOutlined } from '@ant-design/icons';

const Sidebar = ({ chats, currentChat, onChatSelect, onChatRename }) => {
  const handleRename = (chat) => {
    const newTitle = prompt('Enter new chat name:', chat.title);
    if (newTitle && newTitle !== chat.title) {
      onChatRename(chat._id, newTitle);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <Menu
        mode="inline"
        selectedKeys={[currentChat?._id]}
        className="flex-1 overflow-auto"
      >
        {chats.map((chat) => (
          <Menu.Item
            key={chat._id}
            onClick={() => onChatSelect(chat)}
            className="flex items-center justify-between"
          >
            {chat.title}
            <Button
              icon={<EditOutlined />}
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                handleRename(chat);
              }}
            />
          </Menu.Item>
        ))}
      </Menu>
    </div>
  );
};

export default Sidebar; 