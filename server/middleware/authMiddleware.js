import { AuthService } from '../auth/auth.js';

export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = AuthService.verifyToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

export const authenticateWebSocket = (token) => {
  if (!token) {
    throw new Error('Authentication token required');
  }

  try {
    return AuthService.verifyToken(token);
  } catch (error) {
    throw new Error('Invalid WebSocket token');
  }
};