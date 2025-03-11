import React, { createContext, useState, useEffect, useContext } from 'react';
import { authApi } from '../services/api';
import { setToken, getToken, removeToken } from '../utils/auth';

// Create the auth context
const AuthContext = createContext();

// Auth provider component
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Check if user is logged in on initial load and validate token
  useEffect(() => {
    const validateToken = async () => {
      const token = getToken();
      const storedUser = localStorage.getItem('user');
      
      if (!token || !storedUser) {
        setUser(null);
        setLoading(false);
        return;
      }
      
      try {
        // Verify token is valid by calling the /me endpoint
        const userData = await authApi.getCurrentUser();
        
        // Token is valid, set user from API response
        setUser(userData);
        localStorage.setItem('user', JSON.stringify(userData));
      } catch (error) {
        // Token validation failed, clear user data
        console.error('Token validation error:', error);
        removeToken();
        localStorage.removeItem('user');
        setUser(null);
      } finally {
        setLoading(false);
      }
    };
    
    validateToken();
  }, []);
  
  // Login function
  const login = async (credentials) => {
    try {
      setLoading(true);
      console.log('Attempting login with credentials:', { email: credentials.email, passwordLength: credentials.password?.length });
      
      // Use the centralized API service
      const data = await authApi.login(credentials.email, credentials.password);
      
      // Ensure we have a user object with at least a default ID
      const userData = data.user || { _id: 'test-user' };
      if (!userData._id) {
        userData._id = 'test-user';
      }
      
      console.log('Login successful, received data:', { userId: userData._id, hasToken: !!data.token });
      
      // Store token using auth utility
      setToken(data.token);
      
      // Store user data with guaranteed userId
      setUser(userData);
      localStorage.setItem('user', JSON.stringify(userData));
      
      setLoading(false);
      return { success: true };
    } catch (error) {
      console.error('Login error:', error.message);
      setLoading(false);
      return { 
        success: false, 
        message: error.message || 'Login failed. Please try again.'
      };
    }
  };
  
  // Logout function
  const logout = async () => {
    try {
      // Call logout endpoint using centralized API service
      await authApi.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Always clear local storage and state regardless of API response
      setUser(null);
      localStorage.removeItem('user');
      removeToken();
    }
  };
  
  // Register function
  const register = async (userData) => {
    try {
      setLoading(true);
      console.log('Attempting registration with data:', { email: userData.email, name: userData.name });
      
      // Use the centralized API service
      const data = await authApi.register(userData);
      console.log('Registration successful, received data:', { userId: data.user?._id, hasToken: !!data.token });
      
      // Store token using auth utility
      setToken(data.token);
      
      // Store user data
      setUser(data.user);
      localStorage.setItem('user', JSON.stringify(data.user));
      
      setLoading(false);
      return { 
        success: true,
        user: data.user
      };
    } catch (error) {
      console.error('Registration error:', error.message);
      setLoading(false);
      return { 
        success: false, 
        message: error.message || 'Registration failed. Please try again.'
      };
    }
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, register, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

// Custom hook to use the auth context
export const useAuth = () => useContext(AuthContext);
