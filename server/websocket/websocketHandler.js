
import { WebSocketServer, WebSocket } from 'ws';
import { authenticateWebSocket } from '../middleware/authMiddleware.js';
import { v4 as uuidv4 } from 'uuid';

export class WebSocketHandler {
  constructor(server) {
    this.wss = new WebSocketServer({ server });
    this.clients = new Map();
    this.rooms = new Map();

    this.wss.on('connection', (ws, req) => {
      this.handleConnection(ws, req);
    });

    console.log('✅ WebSocket server initialized');
  }

  async handleConnection(ws, req) {
    try {
      // Extract token from query string
      const url = new URL(req.url, `http://${req.headers.host}`);
      const token = url.searchParams.get('token');

      if (!token) {
        throw new Error('No token provided');
      }

      const user = authenticateWebSocket(token);
      const clientId = uuidv4();

      console.log(`✅ Authenticated client connected: ${clientId} (User: ${user.username}, Type: ${user.userType || 'standard'})`);

      // Store client with user info
      this.clients.set(clientId, {
        ws,
        user,
        clientId,
        currentRoom: null
      });

      this.setupMessageHandlers(clientId, ws);
      this.setupCloseHandlers(clientId, ws);

      // Send welcome message
      this.sendMessage(ws, {
        type: 'connection',
        clientId,
        user: user.username,
        userType: user.userType || 'standard',
        message: 'Authenticated and connected to chat server',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('❌ WebSocket authentication failed:', error.message);
      this.sendError(ws, 'Authentication failed: ' + error.message);
      ws.close(1008, 'Authentication failed');
    }
  }

  setupMessageHandlers(clientId, ws) {
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleMessage(clientId, message);
      } catch (error) {
        console.error('❌ Error parsing message:', error);
        this.sendError(ws, 'Invalid message format');
      }
    });
  }

  setupCloseHandlers(clientId, ws) {
    ws.on('close', () => {
      const client = this.clients.get(clientId);
      if (client && client.currentRoom) {
        this.leaveRoom(clientId, client.currentRoom);
      }
      this.clients.delete(clientId);
      console.log(`👋 Client disconnected: ${clientId}`);
    });

    ws.on('error', (error) => {
      console.error(`❌ WebSocket error for client ${clientId}:`, error);
    });
  }

  handleMessage(clientId, message) {
    const client = this.clients.get(clientId);
    if (!client) return;

    console.log(`📨 Message from ${client.user.username}:`, message);

    switch (message.type) {
      case 'join':
        this.handleJoinRoom(clientId, message.room);
        break;
      case 'leave':
        this.handleLeaveRoom(clientId, message.room);
        break;
      case 'chat':
        this.handleChatMessage(clientId, message);
        break;
      case 'typing':
        this.handleTyping(clientId, message);
        break;
      default:
        this.sendError(client.ws, 'Unknown message type');
    }
  }

  handleJoinRoom(clientId, roomName) {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Leave current room if any
    if (client.currentRoom) {
      this.leaveRoom(clientId, client.currentRoom);
    }

    // Join new room
    if (!this.rooms.has(roomName)) {
      this.rooms.set(roomName, new Set());
    }

    this.rooms.get(roomName).add(clientId);
    client.currentRoom = roomName;

    console.log(`👤 ${client.user.username} joined room: ${roomName}`);

    // Notify user
    this.sendMessage(client.ws, {
      type: 'room_joined',
      room: roomName,
      message: `You joined ${roomName}`,
      timestamp: new Date().toISOString()
    });

    // Notify others in room
    this.broadcastToRoom(roomName, {
      type: 'user_joined',
      user: client.user.username,
      userType: client.user.userType || 'standard',
      room: roomName,
      message: `${client.user.username} joined the room`,
      timestamp: new Date().toISOString()
    }, clientId);
  }

  handleLeaveRoom(clientId, roomName) {
    this.leaveRoom(clientId, roomName);
  }

  leaveRoom(clientId, roomName) {
    const client = this.clients.get(clientId);
    if (!client) return;

    const room = this.rooms.get(roomName);
    if (room) {
      room.delete(clientId);
      
      // Notify others
      this.broadcastToRoom(roomName, {
        type: 'user_left',
        user: client.user.username,
        userType: client.user.userType || 'standard',
        room: roomName,
        message: `${client.user.username} left the room`,
        timestamp: new Date().toISOString()
      });

      // Clean up empty rooms
      if (room.size === 0) {
        this.rooms.delete(roomName);
      }
    }

    client.currentRoom = null;
    console.log(`👋 ${client.user.username} left room: ${roomName}`);
  }

  handleChatMessage(clientId, message) {
    const client = this.clients.get(clientId);
    if (!client || !client.currentRoom) {
      this.sendError(client.ws, 'You must join a room first');
      return;
    }

    const chatMessage = {
      type: 'chat',
      sender: client.user.username,
      userType: client.user.userType || 'standard',
      content: message.content,
      room: client.currentRoom,
      timestamp: new Date().toISOString()
    };

    console.log(`💬 Chat message in ${client.currentRoom} from ${client.user.username}: ${message.content}`);

    // Broadcast to all in room including sender
    this.broadcastToRoom(client.currentRoom, chatMessage);
  }

  handleTyping(clientId, message) {
    const client = this.clients.get(clientId);
    if (!client || !client.currentRoom) return;

    this.broadcastToRoom(client.currentRoom, {
      type: 'typing',
      user: client.user.username,
      userType: client.user.userType || 'standard',
      isTyping: message.isTyping,
      room: client.currentRoom,
      timestamp: new Date().toISOString()
    }, clientId);
  }

  broadcastToRoom(roomName, message, excludeClientId = null) {
    const room = this.rooms.get(roomName);
    if (!room) return;

    room.forEach(clientId => {
      if (clientId !== excludeClientId) {
        const client = this.clients.get(clientId);
        if (client) {
          this.sendMessage(client.ws, message);
        }
      }
    });
  }

  sendMessage(ws, message) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  sendError(ws, errorMessage) {
    this.sendMessage(ws, {
      type: 'error',
      error: errorMessage,
      timestamp: new Date().toISOString()
    });
  }

  broadcast(message, excludeClientId = null) {
    this.clients.forEach((client, clientId) => {
      if (clientId !== excludeClientId) {
        this.sendMessage(client.ws, message);
      }
    });
  }
}
