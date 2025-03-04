import React, { useState, useEffect } from 'react';
import { Card, Slider, Select, Button, Tooltip, message, Input, Divider, Spin, Alert } from 'antd';
import { InfoCircleOutlined, ArrowLeftOutlined, SendOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';

const TestChatSection = ({ testChat }) => {
  if (!testChat || testChat.length === 0) {
    return null;
  }

  return (
    <div className="mt-4">
      {testChat.map((msg, idx) => (
        <div key={idx} className="mb-4">
          <div className="font-bold">{msg.role === 'user' ? 'Query:' : 'Response:'}</div>
          <div className="ml-4">{msg.content}</div>
          {msg.metadata && msg.metadata.chunks && (
            <div className="ml-4 mt-2 text-sm text-gray-600">
              <div>Relevant Chunks:</div>
              {msg.metadata.chunks.map((chunk, i) => (
                <div key={i} className="mt-1 p-2 bg-gray-50 rounded">
                  <div>Score: {chunk.score.toFixed(3)}</div>
                  <div>{chunk.text}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

const ConfigPage = ({ apiBaseUrl }) => {
  const navigate = useNavigate();
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [testMessage, setTestMessage] = useState('');
  const [testChat, setTestChat] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [graphStatus, setGraphStatus] = useState(null);

  useEffect(() => {
    fetchConfig();
    checkGraphStatus();
  }, [apiBaseUrl]);

  const fetchConfig = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${apiBaseUrl}/api/graph/configure`);
      if (!response.ok) throw new Error('Failed to load configuration');
      const data = await response.json();
      setConfig(data);
      setError(null);
    } catch (err) {
      console.error('Configuration error:', err);
      setError(err.message);
      message.error('Failed to load configuration');
    } finally {
      setLoading(false);
    }
  };

  const checkGraphStatus = async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/api/graph/graph-status`);
      const data = await response.json();
      setGraphStatus(data);
    } catch (error) {
      console.error('Failed to check graph status:', error);
    }
  };

  const handleLoadGraph = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`${apiBaseUrl}/api/graph/load-pdf`, {
        method: 'POST'
      });
      const data = await response.json();
      if (response.ok) {
        message.success('Graph loaded successfully');
        checkGraphStatus();
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error('Failed to load graph:', error);
      message.error('Failed to load graph');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      await fetch(`${apiBaseUrl}/api/graph/configure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      message.success('Configuration saved successfully');
    } catch (error) {
      message.error('Failed to save configuration');
    }
  };

  const handleTest = async () => {
    if (!testMessage.trim()) return;

    setIsLoading(true);
    try {
      // Add the user message
      const newUserMessage = { role: 'user', content: testMessage };
      setTestChat(prev => [...prev, newUserMessage]);

      // Make the API call
      const response = await fetch(`${apiBaseUrl}/api/graph/test-query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: testMessage,
          config: config
        })
      });

      if (!response.ok) {
        throw new Error('Failed to process query');
      }

      const data = await response.json();
      
      // Add the assistant response
      const newAssistantMessage = {
        role: 'assistant',
        content: data.answer,
        metadata: {
          chunks: data.relevantChunks,
          processedAt: data.metadata.processedAt
        }
      };

      setTestChat(prev => [...prev, newAssistantMessage]);
      setTestMessage('');

    } catch (error) {
      console.error('Test query error:', error);
      message.error('Failed to process test query');
    } finally {
      setIsLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spin size="large" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center flex-col">
        <div className="text-red-500 mb-4">Error: {error}</div>
        <Button onClick={fetchConfig}>Retry</Button>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div>No configuration data available</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center mb-8">
          <Button 
            icon={<ArrowLeftOutlined />} 
            onClick={() => navigate('/')}
            className="mr-4"
          >
            Back
          </Button>
          <h1 className="text-2xl font-bold m-0">Graph RAG Configuration</h1>
        </div>

        {/* Graph Status */}
        <Alert
          message={
            graphStatus?.loaded
              ? `Graph Loaded (${graphStatus.stats.totalChunks} chunks)`
              : "Graph Not Loaded"
          }
          type={graphStatus?.loaded ? "success" : "warning"}
          action={
            !graphStatus?.loaded && (
              <Button
                size="small"
                onClick={handleLoadGraph}
                loading={isLoading}
              >
                Load Graph
              </Button>
            )
          }
          className="mb-4"
        />

        {/* Chunk Selection */}
        <Card title="Chunk Selection" className="mb-8">
          <div className="grid gap-6">
            <div>
              <div className="flex items-center mb-2">
                <h3 className="m-0 mr-2">Maximum Chunks</h3>
                <Tooltip title="Controls how many relevant text chunks are returned for each query. Higher values provide more context but may include less relevant information.">
                  <InfoCircleOutlined />
                </Tooltip>
              </div>
              <Slider
                min={1}
                max={10}
                value={config.chunkSelection.maxChunks.value}
                onChange={value => setConfig({
                  ...config,
                  chunkSelection: {
                    ...config.chunkSelection,
                    maxChunks: { ...config.chunkSelection.maxChunks, value }
                  }
                })}
              />
            </div>

            <div>
              <div className="flex items-center mb-2">
                <h3 className="m-0 mr-2">Scoring Weights</h3>
                <Tooltip title="Determines how different factors contribute to chunk relevance. Semantic similarity measures meaning, entity matching checks for specific terms, relationship density considers connections, and position accounts for document structure.">
                  <InfoCircleOutlined />
                </Tooltip>
              </div>
              <div className="grid gap-4">
                {Object.entries(config?.chunkSelection?.scoreWeights || {}).map(([key, setting]) => (
                  <div key={key}>
                    <div className="text-sm text-gray-600 mb-1">{key}</div>
                    <Slider
                      min={0}
                      max={1}
                      step={0.1}
                      value={setting.value}
                      onChange={value => setConfig({
                        ...config,
                        chunkSelection: {
                          ...config.chunkSelection,
                          scoreWeights: {
                            ...config.chunkSelection.scoreWeights,
                            [key]: { ...setting, value }
                          }
                        }
                      })}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>

        {/* Test Configuration */}
        <Card title="Test Configuration" className="mb-8">
          <div className="grid gap-4">
            <div>
              <Input.TextArea
                value={testMessage}
                onChange={e => setTestMessage(e.target.value)}
                placeholder="Enter your test query here..."
                rows={4}
              />
            </div>
            <div>
              <Button
                type="primary"
                icon={<SendOutlined />}
                onClick={handleTest}
                loading={isLoading}
              >
                Test Query
              </Button>
            </div>
            <TestChatSection testChat={testChat} />
          </div>
        </Card>

        <div className="flex justify-between mt-8">
          <Button 
            icon={<ArrowLeftOutlined />} 
            onClick={() => navigate('/')}
          >
            Back to Chat
          </Button>
          <Button 
            type="primary" 
            size="large"
            onClick={handleSave}
          >
            Save Configuration
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ConfigPage; 