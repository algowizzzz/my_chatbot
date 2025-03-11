const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { ApiError } = require('../middleware/errorHandler');

// Middleware to ensure proper JSON response headers
const ensureJsonResponse = (req, res, next) => {
  res.setHeader('Content-Type', 'application/json');
  next();
};

// Debug middleware to log request details
const logRequestDetails = (req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  console.log('Request headers:', req.headers);
  console.log('Request body:', req.body);
  next();
};

// Register a new user
router.post('/register', ensureJsonResponse, logRequestDetails, async (req, res, next) => {
  try {
    console.log('Processing registration request');
    const { name, email, password } = req.body;
    
    // Validate required fields
    if (!email) {
      console.error('Registration error: Missing email');
      return next(new ApiError('Email is required', 400));
    }
    
    if (!name) {
      console.error('Registration error: Missing name');
      return next(new ApiError('Name is required', 400));
    }
    
    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      console.error(`Registration error: User already exists with email ${email}`);
      return next(new ApiError('User already exists with this email', 400));
    }
    
    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password || 'AlgoWizzzz2025', salt);
    
    // Create new user
    const newUser = new User({
      name,
      email,
      password: hashedPassword
    });
    
    // Save user to database
    console.log('Saving new user to database');
    const savedUser = await newUser.save();
    console.log(`User created with ID: ${savedUser._id}`);
    
    // Create JWT token
    const token = jwt.sign(
      { userId: savedUser._id },
      process.env.JWT_SECRET || 'algowizzzz-secret-key',
      { expiresIn: '1d' }
    );
    
    // Return user info and token (excluding password)
    console.log('Registration successful, sending response');
    res.status(201).json({
      token,
      user: {
        id: savedUser._id,
        name: savedUser.name,
        email: savedUser.email
      }
    });
  } catch (error) {
    console.error('Registration error:', error.message);
    console.error('Error stack:', error.stack);
    next(new ApiError(
      process.env.NODE_ENV === 'production' 
        ? 'Server error during registration' 
        : `Server error during registration: ${error.message}`,
      500,
      error.message
    ));
  }
});

// Login user
router.post('/login', ensureJsonResponse, logRequestDetails, async (req, res, next) => {
  try {
    console.log('Processing login request');
    const { email, password } = req.body;
    
    // Validate required fields
    if (!email) {
      console.error('Login error: Missing email');
      return next(new ApiError('Email is required', 400));
    }
    
    if (!password) {
      console.error('Login error: Missing password');
      return next(new ApiError('Password is required', 400));
    }
    
    // Check if user exists
    const user = await User.findOne({ email });
    if (!user) {
      console.error(`Login error: No user found with email ${email}`);
      return next(new ApiError('Invalid credentials', 400));
    }
    
    // Validate password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      console.error(`Login error: Invalid password for user ${email}`);
      return next(new ApiError('Invalid credentials', 400));
    }
    
    // Create JWT token
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET || 'algowizzzz-secret-key',
      { expiresIn: '1d' }
    );
    
    console.log(`User ${email} logged in successfully`);
    
    // Return user info and token
    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Login error:', error.message);
    console.error('Error stack:', error.stack);
    next(new ApiError(
      process.env.NODE_ENV === 'production' 
        ? 'Server error during login' 
        : `Server error during login: ${error.message}`,
      500,
      error.message
    ));
  }
});

// Get current user (protected route)
router.get('/me', async (req, res, next) => {
  try {
    // Get token from header
    const token = req.header('x-auth-token');
    
    if (!token) {
      return next(new ApiError('No token, authorization denied', 401));
    }
    
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'algowizzzz-secret-key');
    
    // Get user from database
    const user = await User.findById(decoded.userId).select('-password');
    if (!user) {
      return next(new ApiError('User not found', 404));
    }
    
    res.json(user);
  } catch (error) {
    console.error('Auth error:', error);
    next(new ApiError('Token is not valid', 401, error.message));
  }
});

// Logout (client-side only for now)
router.post('/logout', (req, res) => {
  // JWT tokens are stateless, so we don't need to do anything server-side
  // The client should remove the token from storage
  res.json({ message: 'Logged out successfully' });
});

module.exports = router;
