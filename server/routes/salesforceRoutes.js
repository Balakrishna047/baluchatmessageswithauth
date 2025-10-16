
import express from 'express';
import { AuthService } from '../auth/auth.js';

const router = express.Router();

/**
 * POST /api/salesforce/register
 * Register Salesforce user directly
 */
router.post('/register', async (req, res) => {
  try {
    const { salesforceUserId, username, email, name, organizationId } = req.body;

    if (!salesforceUserId || !username || !email) {
      return res.status(400).json({
        success: false,
        error: 'Salesforce User ID, username, and email are required'
      });
    }

    // Create user with Salesforce context
    const password = `sf_${salesforceUserId}_${Date.now()}`; // Auto-generated password
    
    const result = await AuthService.register(username, password, email, {
      salesforceUserId,
      name,
      organizationId,
      userType: 'salesforce',
      source: 'salesforce_lwc'
    });

    console.log(`✅ Salesforce user registered: ${username} (${salesforceUserId})`);

    res.status(201).json({
      success: true,
      message: 'Salesforce user registered successfully',
      data: result
    });

  } catch (error) {
    console.error('❌ Salesforce registration error:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/salesforce/login
 * Login Salesforce user directly
 */
router.post('/login', async (req, res) => {
  try {
    const { salesforceUserId, username, email, name, organizationId } = req.body;

    if (!salesforceUserId || !username) {
      return res.status(400).json({
        success: false,
        error: 'Salesforce User ID and username are required'
      });
    }

    // Check if user exists, if not create them
    let user = AuthService.getUserBySalesforceId(salesforceUserId);
    
    if (!user) {
      // Auto-register Salesforce user
      const password = `sf_${salesforceUserId}_${Date.now()}`;
      const result = await AuthService.register(username, password, email, {
        salesforceUserId,
        name,
        organizationId,
        userType: 'salesforce',
        source: 'salesforce_lwc'
      });
      user = result.user;
    } else {
      // Update last login
      user.lastLogin = new Date().toISOString();
    }

    // Generate token
    const token = AuthService.generateToken(user);

    console.log(`✅ Salesforce user logged in: ${username} (${salesforceUserId})`);

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        user: {
          username: user.username,
          email: user.email,
          name: user.name,
          userType: user.userType,
          source: user.source,
          salesforceUserId: user.salesforceUserId
        }
      }
    });

  } catch (error) {
    console.error('❌ Salesforce login error:', error);
    res.status(401).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/salesforce/users
 * Get all Salesforce users in chat
 */
router.get('/users', async (req, res) => {
  try {
    const salesforceUsers = AuthService.getSalesforceUsers();
    
    res.json({
      success: true,
      count: salesforceUsers.length,
      users: salesforceUsers
    });

  } catch (error) {
    console.error('❌ Error fetching Salesforce users:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch users'
    });
  }
});

router.post('/auth', async (req, res) => {
  try {
    const { userId, username, email, name, photoUrl } = req.body;

    if (!userId || !username || !email || !name) {
      return res.status(400).json({
        success: false,
        error: 'Missing required Salesforce user data'
      });
    }

    // SalesforceAuth.validateSalesforceUser(req.body);

    const result = AuthService.generateSalesforceToken({
      userId,
      username,
      email,
      name,
      photoUrl
    });

    res.json({
      success: true,
      message: 'Salesforce authentication successful',
      data: result
    });

  } catch (error) {
    console.error('Salesforce auth error:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

router.post('/verify', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'Token is required'
      });
    }

    const decoded = AuthService.verifySalesforceToken(token);

    res.json({
      success: true,
      data: decoded
    });

  } catch (error) {
    res.status(401).json({
      success: false,
      error: error.message
    });
  }
});

router.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'Salesforce Integration',
    status: 'active',
    timestamp: new Date().toISOString()
  });
});

export default router;
