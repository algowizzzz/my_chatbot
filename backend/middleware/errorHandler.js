/**
 * Centralized error handling middleware
 * Standardizes error responses across all routes
 */
const errorHandler = (err, req, res, next) => {
  console.error('Error:', err.message);
  
  // Default error status and message
  const status = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';
  
  // Detailed error info for development, simplified for production
  const errorResponse = {
    success: false,
    message,
    path: req.originalUrl,
    timestamp: new Date().toISOString()
  };
  
  // Add stack trace in development mode
  if (process.env.NODE_ENV !== 'production') {
    errorResponse.stack = err.stack;
    errorResponse.details = err.details || err.toString();
  }
  
  res.status(status).json(errorResponse);
};

// Custom error class for API errors
class ApiError extends Error {
  constructor(message, statusCode, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = {
  errorHandler,
  ApiError
};
