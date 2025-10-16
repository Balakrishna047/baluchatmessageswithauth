
import cors from 'cors';
import path from 'path';
import authRoutes from './routes/authRoutes.js';
import salesforceRoutes from './routes/salesforceRoutes.js';
import { authenticateToken } from './middleware/authMiddleware.js';
import { WebSocketHandler } from './websocket/websocketHandler.js';
import { fileURLToPath } from 'url';
import express from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;

// Enhanced CORS for Salesforce
const corsOptions = {
  origin: function (origin, callback) {
    // Allow Salesforce domains and localhost
    const allowedOrigins = [
      /\.force\.com$/,
      /\.salesforce\.com$/,
      /\.lightning\.force\.com$/,
      /\.visualforce\.com$/,
      'http://localhost:3000',
      'http://localhost:8080',
      'https://baluchatmessage.onrender.com'
    ];
    
    if (!origin || allowedOrigins.some(pattern => 
      typeof pattern === 'string' ? pattern === origin : pattern.test(origin)
    )) {
      callback(null, true);
    } else {
      callback(null, true); // Allow all for WebSocket compatibility
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../client/public')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/salesforce', salesforceRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    service: 'Baluchatmessage Server',
    version: '2.0',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    websocket: 'Active',
    salesforceIntegration: 'Enabled'
  });
});

// Protected health check
app.get('/api/health', authenticateToken, (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    service: 'Baluchatmessage Server',
    user: req.user.username,
    source: req.user.source,
    userType: req.user.userType,
    timestamp: new Date().toISOString()
  });
});

// Serve client
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/public/index.html'));
});

// Start HTTP server
const server = app.listen(PORT, () => {
  console.log(`🚀 Baluchatmessage server running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`📍 Salesforce API: http://localhost:${PORT}/api/salesforce`);
  console.log(`📍 Auth API: http://localhost:${PORT}/api/auth`);
  console.log(`📍 WebSocket: ws://localhost:${PORT}`);
  console.log(`🔷 Salesforce Integration: ENABLED`);
});

// Initialize WebSocket with authentication
const wsHandler = new WebSocketHandler(server);

// Export for testing
export { wsHandler };

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

export default app;
