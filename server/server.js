
import cors from 'cors';
import path from 'path';
import express from 'express';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Routes
import authRoutes from './routes/authRoutes.js';
import salesforceRoutes from './routes/salesforceRoutes.js';

// Middleware
import { authenticateToken } from './middleware/authMiddleware.js';

// WebSocket
import { WebSocketHandler } from './websocket/websocketHandler.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;

// Simple CORS - Salesforce Named Credential handles auth
app.use(cors({
  origin: '*', // Named Credential will handle security
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, '../client/public')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/salesforce', salesforceRoutes);

// Public health check
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    service: 'Baluchat Server',
    timestamp: new Date().toISOString()
  });
});

// Protected health check
app.get('/api/health', authenticateToken, (req, res) => {
  res.status(200).json({ 
    status: 'OK',
    user: req.user.username,
    timestamp: new Date().toISOString()
  });
});

// Serve client
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/public/index.html'));
});

// Start server with error handling
const server = app.listen(PORT, () => {
  console.log(`🚀 Chat server running on port ${PORT}`);
  console.log(`📍 API: http://localhost:${PORT}/api`);
  console.log(`📍 Health: http://localhost:${PORT}/health`);
  console.log(`🔷 Salesforce Ready: Named Credential Integration`);
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use!`);
    console.error(`💡 Try: npx kill-port ${PORT}`);
    console.error(`💡 Or change PORT in .env file`);
    process.exit(1);
  } else {
    console.error('❌ Server error:', err);
    process.exit(1);
  }
});

// Initialize WebSocket
const wsHandler = new WebSocketHandler(server);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

export default app;
export { wsHandler };
