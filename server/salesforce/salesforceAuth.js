
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const JWT_EXPIRES_IN = '24h';

export class SalesforceAuth {
  static validateSalesforceUser(userData) {
    const required = ['userId', 'username', 'email', 'name'];
    const missing = required.filter(field => !userData[field]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required fields: ${missing.join(', ')}`);
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(userData.email)) {
      throw new Error('Invalid email format');
    }

    return true;
  }

  static generateSalesforceToken(salesforceUser) {
    const payload = {
      userId: salesforceUser.userId,
      username: salesforceUser.username,
      email: salesforceUser.email,
      name: salesforceUser.name,
      photoUrl: salesforceUser.photoUrl,
      role: 'salesforce',
      source: 'salesforce',
      iss: 'salesforce-chat-integration',
      sub: salesforceUser.userId,
      aud: 'chat-app',
      sfUserId: salesforceUser.userId
    };

    const token = jwt.sign(payload, JWT_SECRET, { 
      expiresIn: JWT_EXPIRES_IN,
      jwtid: uuidv4()
    });

    return {
      token,
      user: {
        id: salesforceUser.userId,
        username: salesforceUser.username,
        email: salesforceUser.email,
        name: salesforceUser.name,
        photoUrl: salesforceUser.photoUrl,
        role: 'salesforce',
        source: 'salesforce'
      }
    };
  }

  static verifySalesforceToken(token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      
      if (decoded.source !== 'salesforce') {
        throw new Error('Not a Salesforce token');
      }

      return decoded;
    } catch (error) {
      throw new Error(`Salesforce token verification failed: ${error.message}`);
    }
  }
}
