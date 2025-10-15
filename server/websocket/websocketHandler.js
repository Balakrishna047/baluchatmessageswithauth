import { WebSocketServer } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { authenticateWebSocket } from '../middleware/authMiddleware.js';

export class WebSocketHandler {
  constructor(server) {
    this.wss = new WebSocketServer({ 
      server,
      perMessageDeflate: false
    });
    this.clients = new Map();
    this.userRooms = new Map();
    
    this.setupWebSocket();
  }

  setupWebSocket() {
    this.wss.on('connection', (ws, req) => {
      this.handleConnection(ws, req);
    });
  }

  async handleConnection(ws, req) {
    try {
      // Extract token from query string or headers
      const url = new URL(req.url, `http://${req.headers.host}`);
      const token = url.searchParams.get('token');

      const user = authenticateWebSocket(token);
      const clientId = uuidv4();

      console.log(`✅ Authenticated client connected: ${clientId} (User: ${user.username})`);

      // Store client with user info
      this.clients.set(clientId, {
        ws,
        user,
        clientId
      });

      this.setupMessageHandlers(clientId, ws);
      this.setupCloseHandlers(clientId, ws);

      // Send welcome message
      this.sendMessage(ws, {
        type: 'connection',
        clientId,
        user: user.username,
        message: 'Authenticated and connected to chat server',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('❌ WebSocket authentication failed:', error.message);
      ws.close(1008, 'Authentication failed');
    }
  }

  setupMessageHandlers(clientId, ws) {
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data);
        this.handleMessage(clientId, message);
      } catch (error) {
        console.error('❌ Error parsing message:', error);
        this.sendError(ws, 'Invalid message format');
      }
    });

    ws.on('error', (error) => {
      console.error(`❌ WebSocket error for client ${clientId}:`, error);
    });
  }

  setupCloseHandlers(clientId, ws) {
    ws.on('close', () => {
      console.log(`❌ Client disconnected: ${clientId}`);
      const userRoom = this.userRooms.get(clientId);
      if (userRoom) {
        this.userRooms.delete(clientId);
      }
      this.clients.delete(clientId);
    });
  }

  handleMessage(clientId, message) {
    const client = this.clients.get(clientId);
    if (!client) return;

    const { ws, user } = client;

    switch (message.type) {
      case 'join':
        this.userRooms.set(clientId, message.room);
        console.log(`📍 User ${user.username} joined room: ${message.room}`);
        this.sendMessage(ws, {
          type: 'system',
          message: `Joined room: ${message.room}`,
          timestamp: new Date().toISOString()
        });
        break;

      case 'chat':
        const room = this.userRooms.get(clientId);
        if (!room) {
          this.sendError(ws, 'Join a room first');
          return;
        }

        const chatMessage = {
          type: 'chat',
          messageId: uuidv4(),
          sender: user.username,
          content: message.content,
          timestamp: new Date().toISOString(),
          room: room
        };

        this.broadcastToRoom(room, chatMessage, clientId);
        console.log(`📨 Message from ${user.username} in room ${room}: ${message.content}`);
        break;

      default:
        this.sendError(ws, 'Unknown message type');
    }
  }

  broadcastToRoom(room, message, excludeClientId = null) {
    let delivered = 0;
    
    this.clients.forEach((client, clientId) => {
      if (clientId !== excludeClientId && this.userRooms.get(clientId) === room) {
        if (client.ws.readyState === WebSocket.OPEN) {
          this.sendMessage(client.ws, message);
          delivered++;
        }
      }
    });
    
    console.log(`📤 Message delivered to ${delivered} clients in room ${room}`);
  }

  sendMessage(ws, message) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  sendError(ws, errorMessage) {
    this.sendMessage(ws, {
      type: 'error',
      message: errorMessage,
      timestamp: new Date().toISOString()
    });
  }
}
