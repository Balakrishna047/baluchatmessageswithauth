
import express from 'express';
import { SalesforceAuthService } from '../auth/salesforceAuth.js';

const router = express.Router();

/**
 * GET /api/auth/salesforce/login
 * Redirect to Salesforce OAuth login
 */
router.get('/login', (req, res) => {
  try {
    const state = req.query.state || SalesforceAuthService.generateState();
    const authUrl = SalesforceAuthService.getAuthorizationUrl(state);
    
    console.log('🔷 Redirecting to Salesforce login...');
    
    res.json({
      success: true,
      authUrl: authUrl,
      state: state,
      message: 'Redirect to Salesforce login'
    });

  } catch (error) {
    console.error('❌ Salesforce login error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initiate Salesforce login'
    });
  }
});

/**
 * GET /api/auth/salesforce/callback
 * Handle OAuth callback from Salesforce
 */
router.get('/callback', async (req, res) => {
  try {
    const { code, state, error, error_description } = req.query;

    // Check for OAuth errors
    if (error) {
      console.error('❌ Salesforce OAuth error:', error_description);
      return res.redirect(`/?error=${encodeURIComponent(error_description || error)}`);
    }

    // Check for authorization code
    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'Authorization code not provided'
      });
    }

    console.log('🔷 Processing Salesforce callback...');

    // Authenticate with Salesforce
    const result = await SalesforceAuthService.authenticateWithSalesforce(code);

    // Redirect to client with token
    const redirectUrl = `/?token=${result.token}&username=${encodeURIComponent(result.user.username)}&source=salesforce`;
    res.redirect(redirectUrl);

  } catch (error) {
    console.error('❌ Salesforce callback error:', error);
    res.redirect(`/?error=${encodeURIComponent('Authentication failed')}`);
  }
});

/**
 * POST /api/auth/salesforce/refresh
 * Refresh Salesforce access token
 */
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        error: 'Refresh token required'
      });
    }

    const tokenData = await SalesforceAuthService.refreshAccessToken(refreshToken);
    
    res.json({
      success: true,
      token: tokenData.access_token,
      expiresAt: tokenData.expires_at
    });

  } catch (error) {
    console.error('❌ Salesforce refresh token error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to refresh access token'
    });
  }
});

export default router;
