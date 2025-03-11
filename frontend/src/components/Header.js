import React from 'react';
import { Button, Tooltip, Avatar } from 'antd';
import { LogoutOutlined, UserOutlined } from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';
import './Header.css';

/**
 * Header component for the Algowizz Chatbot
 * Displays the Algowizz branding on the left and user first name with logout icon on the right
 */
const Header = () => {
  const { user, logout } = useAuth();
  
  // Extract first name only
  const firstName = user ? user.name.split(' ')[0] : 'User';
  return (
    <header className="header">
      <div className="branding">{firstName}</div>
      <div className="user-greeting">
        {user && (
          <Tooltip title="Logout">
            <Button 
              type="text" 
              icon={<LogoutOutlined />} 
              onClick={logout}
              className="logout-button"
            />
          </Tooltip>
        )}
      </div>
    </header>
  );
};

export default Header;
