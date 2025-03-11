require('dotenv').config();
const express = require('express');
const router = express.Router();
const { ApiError } = require('../middleware/errorHandler');

/**
 * Chat message routes
 * Consolidated to use documentRoutes.js for direct queries
 * This avoids duplicate functionality
 */

// Direct message endpoint - redirects to consolidated endpoint
router.post('/', async (req, res, next) => {
  try {
    const { query } = req.body;
    
    if (!query) {
      return next(new ApiError('Query is required', 400));
    }

    console.log('Direct message received, redirecting to consolidated endpoint');
    
    // Forward the request to the consolidated endpoint
    // This maintains backward compatibility while eliminating code duplication
    res.redirect(307, '/api/documents/query/direct');
  } catch (error) {
    next(new ApiError('Failed to process message', 500, error.message));
  }
});

module.exports = router;
