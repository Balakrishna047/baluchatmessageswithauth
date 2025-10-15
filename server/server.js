import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import authRoutes from './routes/authRoutes.js';
import { WebSocketHandler } from './websocket/websocketHandler.js';
import { authenticateToken } from './middleware/authMiddleware.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Routes
app.use('/api/auth', authRoutes);

// Protected health check
app.get('/health', authenticateToken, (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    service: 'Chat Server',
    user: req.user.username,
    timestamp: new Date().toISOString()
  });
});

// Serve client (optional - for development)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/public/index.html'));
});

// Start HTTP server
const server = app.listen(PORT, () => {
  console.log(`🚀 Chat server running on port ${PORT}`);
  console.log(`📍 Authentication API: http://localhost:${PORT}/api/auth`);
});

// Initialize WebSocket with authentication
new WebSocketHandler(server);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

export default app;