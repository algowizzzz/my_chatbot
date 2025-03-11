import React, { useState } from 'react';
import { Form, Input, Button, Card, message, Typography, Tabs, Modal } from 'antd';
import { UserOutlined, LockOutlined, MailOutlined } from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Navigate } from 'react-router-dom';

const { Title, Text } = Typography;
const { TabPane } = Tabs;

const LoginPage = () => {
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('login');
  const [registerSuccess, setRegisterSuccess] = useState(false);
  const [registeredUser, setRegisteredUser] = useState(null);
  const { user, login, register } = useAuth();
  const navigate = useNavigate();
  
  // If user is already logged in, redirect to home
  if (user) {
    return <Navigate to="/" />;
  }
  
  const onFinish = async (values) => {
    try {
      setLoading(true);
      
      // Call the login function from AuthContext
      const result = await login({
        email: values.email,
        password: values.password
      });
      
      if (result.success) {
        message.success('Login successful!');
        navigate('/');
      } else {
        message.error(result.message || 'Invalid email or password');
      }
    } catch (error) {
      message.error('Login failed. Please try again.');
      setLoading(false);
    }
  };
  
  // Handle registration form submission
  const onRegisterFinish = async (values) => {
    try {
      setLoading(true);
      
      // Call register function from AuthContext
      const result = await register({
        name: values.name,
        email: values.email,
        password: 'AlgoWizzzz2025' // Default password for new users
      });
      
      if (result.success) {
        setRegisteredUser(result.user);
        setRegisterSuccess(true);
      } else {
        message.error(result.message || 'Registration failed');
      }
    } catch (error) {
      message.error('Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Handle tab change
  const handleTabChange = (key) => {
    setActiveTab(key);
  };

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
      backgroundColor: '#f0f2f5'
    }}>
      <Card 
        style={{ 
          width: 400, 
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
          borderRadius: '8px'
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <Title level={2} style={{ margin: '0 0 8px 0' }}>AlgoWizzzz</Title>
          <Text type="secondary">Sign in to access your AI assistant</Text>
        </div>
        
        <Tabs activeKey={activeTab} onChange={handleTabChange}>
          <TabPane tab="Login" key="login">
            <Form
              name="login"
              initialValues={{ email: 'user@example.com', password: 'password123' }}
              onFinish={onFinish}
              layout="vertical"
            >
              <Form.Item
                name="email"
                rules={[{ required: true, message: 'Please input your email!' }]}
              >
                <Input 
                  prefix={<MailOutlined />} 
                  placeholder="Email" 
                  size="large"
                />
              </Form.Item>
              
              <Form.Item
                name="password"
                rules={[{ required: true, message: 'Please input your password!' }]}
              >
                <Input.Password
                  prefix={<LockOutlined />}
                  placeholder="Password"
                  size="large"
                />
              </Form.Item>
              
              <Form.Item>
                <Button 
                  type="primary" 
                  htmlType="submit" 
                  style={{ width: '100%' }}
                  loading={loading}
                  size="large"
                >
                  Log in
                </Button>
              </Form.Item>
              
              <div style={{ textAlign: 'center' }}>
                <Text type="secondary">
                  Demo credentials: user@example.com / password123
                </Text>
              </div>
            </Form>
          </TabPane>
          
          <TabPane tab="Register" key="register">
            <Form
              name="register"
              onFinish={onRegisterFinish}
              layout="vertical"
            >
              <Form.Item
                name="name"
                rules={[{ required: true, message: 'Please input your name!' }]}
              >
                <Input 
                  prefix={<UserOutlined />} 
                  placeholder="Full Name" 
                  size="large"
                />
              </Form.Item>
              
              <Form.Item
                name="email"
                rules={[
                  { required: true, message: 'Please input your email!' },
                  { type: 'email', message: 'Please enter a valid email!' }
                ]}
              >
                <Input 
                  prefix={<MailOutlined />} 
                  placeholder="Email" 
                  size="large"
                />
              </Form.Item>
              
              <Form.Item>
                <Button 
                  type="primary" 
                  htmlType="submit" 
                  style={{ width: '100%' }}
                  loading={loading}
                  size="large"
                >
                  Register
                </Button>
              </Form.Item>
              
              <div style={{ textAlign: 'center' }}>
                <Text type="secondary">
                  A temporary password will be provided after registration
                </Text>
              </div>
            </Form>
          </TabPane>
        </Tabs>
      </Card>
      
      {/* Success Modal */}
      <Modal
        title="Registration Successful"
        open={registerSuccess}
        onOk={() => {
          setRegisterSuccess(false);
          setActiveTab('login');
        }}
        onCancel={() => {
          setRegisterSuccess(false);
          setActiveTab('login');
        }}
        footer={[
          <Button 
            key="ok" 
            type="primary" 
            onClick={() => {
              setRegisterSuccess(false);
              setActiveTab('login');
            }}
          >
            OK
          </Button>,
        ]}
      >
        <p>Your account has been created successfully!</p>
        <p><strong>Email:</strong> {registeredUser?.email}</p>
        <p><strong>Temporary Password:</strong> AlgoWizzzz2025</p>
        <p>Please use these credentials to log in.</p>
      </Modal>
    </div>
  );
};

export default LoginPage;
