
import jwt from 'jsonwebtoken';
import fetch from 'node-fetch';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Salesforce OAuth Configuration
const SALESFORCE_CONFIG = {
  clientId: process.env.SALESFORCE_CLIENT_ID || 'YOUR_SALESFORCE_CLIENT_ID',
  clientSecret: process.env.SALESFORCE_CLIENT_SECRET || 'YOUR_SALESFORCE_CLIENT_SECRET',
  redirectUri: process.env.SALESFORCE_REDIRECT_URI || 'https://baluchatmessage.onrender.com/api/auth/salesforce/callback',
  loginUrl: process.env.SALESFORCE_LOGIN_URL || 'https://login.salesforce.com',
  scope: 'api id profile email openid'
};

// Store for Salesforce users (in production, use a database)
const salesforceUsers = new Map();

export class SalesforceAuthService {
  
  /**
   * Generate Salesforce OAuth URL
   */
  static getAuthorizationUrl(state = null) {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: SALESFORCE_CONFIG.clientId,
      redirect_uri: SALESFORCE_CONFIG.redirectUri,
      scope: SALESFORCE_CONFIG.scope,
      state: state || this.generateState()
    });

    return `${SALESFORCE_CONFIG.loginUrl}/services/oauth2/authorize?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   */
  static async exchangeCodeForToken(code) {
    try {
      const tokenUrl = `${SALESFORCE_CONFIG.loginUrl}/services/oauth2/token`;
      
      const params = new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        client_id: SALESFORCE_CONFIG.clientId,
        client_secret: SALESFORCE_CONFIG.clientSecret,
        redirect_uri: SALESFORCE_CONFIG.redirectUri
      });

      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params.toString()
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Token exchange failed: ${error}`);
      }

      const tokenData = await response.json();
      return tokenData;

    } catch (error) {
      console.error('❌ Salesforce token exchange error:', error);
      throw new Error('Failed to exchange authorization code for token');
    }
  }

  /**
   * Get user info from Salesforce
   */
  static async getUserInfo(accessToken, instanceUrl) {
    try {
      const userInfoUrl = `${instanceUrl}/services/oauth2/userinfo`;
      
      const response = await fetch(userInfoUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch user info');
      }

      const userInfo = await response.json();
      return userInfo;

    } catch (error) {
      console.error('❌ Salesforce user info error:', error);
      throw new Error('Failed to fetch user information');
    }
  }

  /**
   * Complete Salesforce authentication flow
   */
  static async authenticateWithSalesforce(code) {
    try {
      // Step 1: Exchange code for token
      const tokenData = await this.exchangeCodeForToken(code);
      
      // Step 2: Get user info
      const userInfo = await this.getUserInfo(tokenData.access_token, tokenData.instance_url);
      
      // Step 3: Create or update user
      const user = {
        salesforceId: userInfo.user_id,
        username: userInfo.preferred_username || userInfo.email,
        email: userInfo.email,
        name: userInfo.name,
        organizationId: userInfo.organization_id,
        userType: 'salesforce',
        source: 'salesforce_oauth',
        instanceUrl: tokenData.instance_url,
        salesforceAccessToken: tokenData.access_token,
        salesforceRefreshToken: tokenData.refresh_token,
        profilePicture: userInfo.picture,
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString()
      };

      // Store user
      salesforceUsers.set(user.salesforceId, user);
      
      // Step 4: Generate our JWT token
      const chatToken = this.generateChatToken(user);
      
      console.log(`✅ Salesforce user authenticated: ${user.email}`);
      
      return {
        token: chatToken,
        user: {
          salesforceId: user.salesforceId,
          username: user.username,
          email: user.email,
          name: user.name,
          userType: user.userType,
          source: user.source,
          profilePicture: user.profilePicture
        }
      };

    } catch (error) {
      console.error('❌ Salesforce authentication error:', error);
      throw error;
    }
  }

  /**
   * Refresh Salesforce access token
   */
  static async refreshAccessToken(refreshToken) {
    try {
      const tokenUrl = `${SALESFORCE_CONFIG.loginUrl}/services/oauth2/token`;
      
      const params = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: SALESFORCE_CONFIG.clientId,
        client_secret: SALESFORCE_CONFIG.clientSecret
      });

      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params.toString()
      });

      if (!response.ok) {
        throw new Error('Token refresh failed');
      }

      const tokenData = await response.json();
      return tokenData;

    } catch (error) {
      console.error('❌ Token refresh error:', error);
      throw new Error('Failed to refresh access token');
    }
  }

  /**
   * Revoke Salesforce token (logout)
   */
  static async revokeToken(token) {
    try {
      const revokeUrl = `${SALESFORCE_CONFIG.loginUrl}/services/oauth2/revoke`;
      
      const params = new URLSearchParams({
        token: token
      });

      await fetch(revokeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params.toString()
      });

      console.log('✅ Salesforce token revoked');

    } catch (error) {
      console.error('❌ Token revoke error:', error);
      throw new Error('Failed to revoke token');
    }
  }

  /**
   * Generate chat JWT token
   */
  static generateChatToken(user) {
    return jwt.sign(
      {
        salesforceId: user.salesforceId,
        username: user.username,
        email: user.email,
        userType: user.userType,
        source: user.source
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
  }

  /**
   * Verify chat token
   */
  static verifyChatToken(token) {
    try {
      return jwt.verify(token, JWT_SECRET);
    } catch (error) {
      throw new Error('Invalid token');
    }
  }

  /**
   * Get Salesforce user by ID
   */
  static getSalesforceUser(salesforceId) {
    return salesforceUsers.get(salesforceId);
  }

  /**
   * Generate random state for OAuth
   */
  static generateState() {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
  }

  /**
   * Get all Salesforce users
   */
  static getAllSalesforceUsers() {
    const users = [];
    salesforceUsers.forEach((user) => {
      users.push({
        salesforceId: user.salesforceId,
        username: user.username,
        email: user.email,
        name: user.name,
        userType: user.userType,
        lastLogin: user.lastLogin
      });
    });
    return users;
  }
}
