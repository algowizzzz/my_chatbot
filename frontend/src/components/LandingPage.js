import React from 'react';
import { Button, Typography, Row, Col, Card, List } from 'antd';
import { ArrowRightOutlined, FileTextOutlined, BranchesOutlined, RobotOutlined, ApiOutlined, ToolOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import './LandingPage.css';

const { Title, Paragraph } = Typography;

const agents = [
  {
    title: "Doc Intelligence",
    subtitle: "Powerful document analysis and question answering",
    icon: <FileTextOutlined className="agent-icon" />,
    bullets: [
      "Upload and analyze documents in various formats",
      "Ask questions about your documents",
      "Get accurate answers with source citations",
      "Extract key insights from complex documents"
    ]
  },
  {
    title: "Graph RAG",
    subtitle: "Knowledge graph-based retrieval augmented generation",
    icon: <BranchesOutlined className="agent-icon" />,
    bullets: [
      "Build knowledge graphs from your data",
      "Explore connections between concepts",
      "Get contextually rich responses",
      "Visualize relationships in your data"
    ]
  },
  {
    title: "AI Assistant",
    subtitle: "Your personal AI-powered assistant",
    icon: <RobotOutlined className="agent-icon" />,
    bullets: [
      "Get instant answers to your questions",
      "Maintain conversation context for natural interactions",
      "Access to vast knowledge base",
      "Available 24/7 to assist you"
    ]
  },
  {
    title: "API Integration",
    subtitle: "Connect with external services and data sources",
    icon: <ApiOutlined className="agent-icon" />,
    bullets: [
      "Seamless integration with third-party APIs",
      "Pull in real-time data for analysis",
      "Connect to your existing systems",
      "Extend functionality with custom integrations"
    ]
  },
  {
    title: "Custom Tools",
    subtitle: "Specialized tools for specific tasks",
    icon: <ToolOutlined className="agent-icon" />,
    bullets: [
      "Data extraction and transformation",
      "Automated report generation",
      "Custom workflow automation",
      "Task-specific AI assistants"
    ]
  }
];

function LandingPage() {
  const navigate = useNavigate();

  const handleGetStarted = () => {
    // Making this button blank (not navigating anywhere)
    // navigate('/app');
  };

  const handleAgentClick = (agentTitle) => {
    // Only Doc Intelligence button navigates to the chatbot
    if (agentTitle === "Doc Intelligence") {
      navigate('/app');
    }
  };

  return (
    <div className="landing-container">
      <div className="landing-header">
        <div className="logo-container">
          <RobotOutlined className="logo-icon" />
          <span className="logo-text">AlgoWiz AI</span>
        </div>
      </div>

      <div className="hero-section">
        <Row gutter={[24, 24]} align="middle" justify="center">
          <Col xs={24} md={12}>
            <div className="hero-content">
              <Title level={1}>Intelligent AI Agents for Your Data</Title>
              <Paragraph className="hero-subtitle">
                Unlock the power of AI with our suite of specialized agents designed to transform how you interact with your data
              </Paragraph>
              <Button 
                type="primary" 
                size="large" 
                onClick={handleGetStarted}
                className="get-started-btn"
              >
                Get Started <ArrowRightOutlined />
              </Button>
            </div>
          </Col>
          <Col xs={24} md={12} className="hero-image-container">
            <div className="hero-image">
              {/* This is a placeholder for a hero image */}
              <div className="image-placeholder">
                <RobotOutlined style={{ fontSize: '80px', color: '#1890ff' }} />
              </div>
            </div>
          </Col>
        </Row>
      </div>

      <div className="agents-section">
        <Title level={2} className="section-title">Our AI Agents</Title>
        <Row gutter={[24, 24]}>
          {agents.map((agent, index) => (
            <Col xs={24} md={12} lg={8} key={index}>
              <Card className="agent-card">
                <div className="agent-card-header">
                  {agent.icon}
                  <Title level={3}>{agent.title}</Title>
                </div>
                <Paragraph className="agent-subtitle">{agent.subtitle}</Paragraph>
                <List
                  itemLayout="horizontal"
                  dataSource={agent.bullets}
                  renderItem={(item) => (
                    <List.Item className="agent-bullet">
                      <List.Item.Meta
                        title={item}
                      />
                    </List.Item>
                  )}
                />
                <Button 
                  type="primary" 
                  onClick={() => handleAgentClick(agent.title)}
                  className="agent-button"
                >
                  Try {agent.title}
                </Button>
              </Card>
            </Col>
          ))}
        </Row>
      </div>

      <div className="cta-section">
        <Title level={2}>Ready to experience the future of AI?</Title>
        <Button 
          type="primary" 
          size="large" 
          onClick={handleGetStarted}
          className="get-started-btn"
        >
          Get Started Now <ArrowRightOutlined />
        </Button>
      </div>

      <div className="landing-footer">
        <p>© 2025 AlgoWiz AI. All rights reserved.</p>
      </div>
    </div>
  );
}

export default LandingPage;
