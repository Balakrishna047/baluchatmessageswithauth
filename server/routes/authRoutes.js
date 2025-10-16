import express from 'express';
import { AuthService } from '../auth/auth.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

const router = express.Router();

// Register new user
router.post('/register', async (req, res) => {
  try {
    const { username, password, email, userType } = req.body;

    if (!username || !password || !email) {
      return res.status(400).json({ 
        success: false,
        error: 'Username, password, and email are required' 
      });
    }

    const result = await AuthService.register(username, password, email, userType);
    
    res.status(201).json({
      success: true,
      message: 'Registration successful',
      data: result
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// Login user
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ 
        success: false,
        error: 'Username and password are required' 
      });
    }

    const result = await AuthService.login(username, password);
    
    res.json({
      success: true,
      message: 'Login successful',
      data: result
    });
  } catch (error) {
    res.status(401).json({
      success: false,
      error: error.message
    });
  }
});

// Verify token
router.post('/verify', authenticateToken, async (req, res) => {
  try {
    res.json({
      success: true,
      message: 'Token is valid',
      user: req.user
    });
  } catch (error) {
    res.status(401).json({
      success: false,
      error: error.message
    });
  }
});

export default router;