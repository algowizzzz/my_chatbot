// Authentication utility functions

// Store token in localStorage
export const setToken = (token) => {
  localStorage.setItem('authToken', token);
};

// Get token from localStorage
export const getToken = () => {
  return localStorage.getItem('authToken');
};

// Remove token from localStorage
export const removeToken = () => {
  localStorage.removeItem('authToken');
};

// Check if user is authenticated
export const isAuthenticated = () => {
  const token = getToken();
  return !!token;
};

export default {
  setToken,
  getToken,
  removeToken,
  isAuthenticated
};
