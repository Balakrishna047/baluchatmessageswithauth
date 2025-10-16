import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// In-memory user store (replace with database in production)
const users = new Map();
const salesforceUserIndex = new Map(); // Index by Salesforce User ID

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = '24h';

export class AuthService {
  
  /**
   * Register new user
   */
  static async register(username, password, email, additionalData = {}) {
    try {
      // Check if user already exists
      if (users.has(username)) {
        throw new Error('Username already exists');
      }

      // Check if email already exists
      for (const [, user] of users) {
        if (user.email === email) {
          throw new Error('Email already exists');
        }
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create user object
      const user = {
        username,
        email,
        password: hashedPassword,
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString(),
        userType: additionalData.userType || 'standard',
        source: additionalData.source || 'direct',
        ...additionalData
      };

      // Store user
      users.set(username, user);

      // Index by Salesforce User ID if provided
      if (additionalData.salesforceUserId) {
        salesforceUserIndex.set(additionalData.salesforceUserId, username);
      }

      // Generate token
      const token = this.generateToken(user);

      console.log(`✅ User registered: ${username} (${user.userType})`);

      return {
        token,
        user: {
          username: user.username,
          email: user.email,
          name: user.name,
          userType: user.userType,
          source: user.source,
          salesforceUserId: user.salesforceUserId,
          createdAt: user.createdAt
        }
      };

    } catch (error) {
      console.error('❌ Registration error:', error);
      throw error;
    }
  }

  /**
   * Login user
   */
  static async login(username, password) {
    try {
      const user = users.get(username);

      if (!user) {
        throw new Error('Invalid username or password');
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.password);

      if (!isValidPassword) {
        throw new Error('Invalid username or password');
      }

      // Update last login
      user.lastLogin = new Date().toISOString();

      // Generate token
      const token = this.generateToken(user);

      console.log(`✅ User logged in: ${username}`);

      return {
        token,
        user: {
          username: user.username,
          email: user.email,
          name: user.name,
          userType: user.userType,
          source: user.source,
          salesforceUserId: user.salesforceUserId
        }
      };

    } catch (error) {
      console.error('❌ Login error:', error);
      throw error;
    }
  }

  /**
   * Generate JWT token
   */
  static generateToken(user) {
    return jwt.sign(
      {
        username: user.username,
        email: user.email,
        userType: user.userType,
        source: user.source,
        salesforceUserId: user.salesforceUserId
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
  }

  /**
   * Verify JWT token
   */
  static verifyToken(token) {
    try {
      return jwt.verify(token, JWT_SECRET);
    } catch (error) {
      throw new Error('Invalid or expired token');
    }
  }

  /**
   * Get user by username
   */
  static getUser(username) {
    return users.get(username);
  }

  /**
   * Get user by Salesforce User ID
   */
  static getUserBySalesforceId(salesforceUserId) {
    const username = salesforceUserIndex.get(salesforceUserId);
    return username ? users.get(username) : null;
  }

  /**
   * Get all Salesforce users
   */
  static getSalesforceUsers() {
    const sfUsers = [];
    users.forEach((user) => {
      if (user.userType === 'salesforce') {
        sfUsers.push({
          username: user.username,
          email: user.email,
          name: user.name,
          salesforceUserId: user.salesforceUserId,
          organizationId: user.organizationId,
          lastLogin: user.lastLogin
        });
      }
    });
    return sfUsers;
  }

  /**
   * Get all users
   */
  static getAllUsers() {
    const allUsers = [];
    users.forEach((user) => {
      allUsers.push({
        username: user.username,
        email: user.email,
        userType: user.userType,
        source: user.source,
        lastLogin: user.lastLogin
      });
    });
    return allUsers;
  }
}