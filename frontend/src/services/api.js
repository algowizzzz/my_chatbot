// API service for centralized API calls
import { getToken } from '../utils/auth';

const API_BASE_URL = 'http://localhost:5005';

// Helper function to get auth headers
const getAuthHeaders = () => {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    'Authorization': token ? `Bearer ${token}` : ''
  };
};

// Chat API
export const chatApi = {
  // Get all chats for the current user
  getAllChats: async () => {
    const response = await fetch(`${API_BASE_URL}/api/chats`, {
      headers: getAuthHeaders()
    });
    if (!response.ok) throw new Error('Failed to fetch chats');
    return response.json();
  },

  // Create a new chat
  createChat: async (title) => {
    const response = await fetch(`${API_BASE_URL}/api/chats/new`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ title: title || 'New Chat' })
    });
    if (!response.ok) throw new Error('Failed to create chat');
    return response.json();
  },

  // Delete a chat
  deleteChat: async (chatId) => {
    const response = await fetch(`${API_BASE_URL}/api/chats/${chatId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    if (!response.ok) throw new Error('Failed to delete chat');
    return response.json();
  },

  // Get chat messages
  getChatMessages: async (chatId) => {
    const response = await fetch(`${API_BASE_URL}/api/chats/${chatId}/messages`, {
      headers: getAuthHeaders()
    });
    if (!response.ok) throw new Error('Failed to fetch chat messages');
    return response.json();
  },

  // Send a message to a chat
  sendMessage: async (chatId, message, mode = 'direct', selectedDocs = []) => {
    const response = await fetch(`${API_BASE_URL}/api/chats/${chatId}/messages`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ 
        message, 
        mode,
        selectedDocuments: selectedDocs
      })
    });
    if (!response.ok) throw new Error('Failed to send message');
    return response.json();
  }
};

// Document API
export const documentApi = {
  // Get all documents
  getAllDocuments: async () => {
    const response = await fetch(`${API_BASE_URL}/api/documents`, {
      headers: getAuthHeaders()
    });
    if (!response.ok) throw new Error('Failed to fetch documents');
    return response.json();
  },

  // Delete a document
  deleteDocument: async (documentId) => {
    const response = await fetch(`${API_BASE_URL}/api/documents/${documentId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    if (!response.ok) throw new Error('Failed to delete document');
    return response.json();
  },

  // Rename a document
  renameDocument: async (documentId, newName) => {
    const response = await fetch(`${API_BASE_URL}/api/documents/${documentId}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ name: newName })
    });
    if (!response.ok) throw new Error('Failed to rename document');
    return response.json();
  },

  // Query documents with RAG
  queryWithRAG: async (query, selectedDocs) => {
    const response = await fetch(`${API_BASE_URL}/api/documents/query`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ query, documents: selectedDocs })
    });
    if (!response.ok) throw new Error('Failed to query documents');
    return response.json();
  },

  // Direct query without RAG
  queryDirect: async (query) => {
    const response = await fetch(`${API_BASE_URL}/api/documents/query/direct`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ query })
    });
    if (!response.ok) throw new Error('Failed to query');
    return response.json();
  }
};

// Graph/Knowledge Base API
export const graphApi = {
  // Get graph configuration
  getConfiguration: async () => {
    const response = await fetch(`${API_BASE_URL}/api/graph/configure`, {
      headers: getAuthHeaders()
    });
    if (!response.ok) throw new Error('Failed to fetch graph configuration');
    return response.json();
  },

  // Update graph configuration
  updateConfiguration: async (config) => {
    const response = await fetch(`${API_BASE_URL}/api/graph/configure`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(config)
    });
    if (!response.ok) throw new Error('Failed to update graph configuration');
    return response.json();
  },

  // Get graph status
  getStatus: async () => {
    const response = await fetch(`${API_BASE_URL}/api/graph/graph-status`, {
      headers: getAuthHeaders()
    });
    if (!response.ok) throw new Error('Failed to fetch graph status');
    return response.json();
  },

  // Load PDF
  loadPDF: async (formData) => {
    const response = await fetch(`${API_BASE_URL}/api/graph/load-pdf`, {
      method: 'POST',
      headers: {
        'Authorization': getAuthHeaders().Authorization
      },
      body: formData
    });
    if (!response.ok) throw new Error('Failed to load PDF');
    return response.json();
  },

  // Test query
  testQuery: async (query) => {
    const response = await fetch(`${API_BASE_URL}/api/graph/test-query`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ query })
    });
    if (!response.ok) throw new Error('Failed to test query');
    return response.json();
  }
};

// Auth API
export const authApi = {
  // Login
  login: async (email, password) => {
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    if (!response.ok) throw new Error('Login failed');
    return response.json();
  },

  // Register
  register: async (userData) => {
    const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData)
    });
    if (!response.ok) throw new Error('Registration failed');
    return response.json();
  },

  // Get current user
  getCurrentUser: async () => {
    const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
      headers: getAuthHeaders()
    });
    if (!response.ok) throw new Error('Failed to fetch user');
    return response.json();
  },

  // Logout
  logout: async () => {
    const response = await fetch(`${API_BASE_URL}/api/auth/logout`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    if (!response.ok) throw new Error('Logout failed');
    return response.json();
  }
};

export default {
  API_BASE_URL,
  chatApi,
  documentApi,
  graphApi,
  authApi
};
