require('dotenv').config();
const WebSocket = require('ws');
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const app = express();

// CORS Configuration
app.use(cors({
    origin: [
        'https://baluchatmessages.onrender.com',
        'http://localhost:3000',
        'https://devrabbititsolutions8-dev-ed.develop.lightning.force.com',
        'https://devrabbititsolutions8-dev-ed.develop.my.salesforce.com'
    ],
    credentials: true,
    methods: ['GET', 'POST']
}));

app.use(express.json());

const PORT = process.env.PORT || 10000;
const JWT_SECRET = process.env.JWT_SECRET || 'baluchat-secret-key-2024';

// In-memory storage
const clients = new Map();
const userRooms = new Map();
const activeUsers = new Map();

// User database
const users = [
    {
        id: 'ext-001',
        username: 'external',
        password: bcrypt.hashSync('external123', 10),
        name: 'External User',
        role: 'external',
        email: 'external@example.com'
    },
    {
        id: 'admin-001',
        username: 'admin',
        password: bcrypt.hashSync('admin123', 10),
        name: 'Admin User',
        role: 'admin',
        email: 'admin@example.com'
    }
];

// ======================
// AUTHENTICATION ENDPOINTS
// ======================

// External user login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        console.log('🔐 Login attempt:', username);

        if (!username || !password) {
            return res.status(400).json({ 
                success: false, 
                error: 'Username and password required' 
            });
        }

        // Find user
        const user = users.find(u => u.username === username);
        if (!user) {
            return res.status(401).json({ 
                success: false, 
                error: 'Invalid credentials' 
            });
        }

        // Check password
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ 
                success: false, 
                error: 'Invalid credentials' 
            });
        }

        // Generate JWT token
        const token = jwt.sign(
            {
                userId: user.id,
                username: user.username,
                name: user.name,
                role: user.role,
                email: user.email
            },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        console.log(`✅ User logged in: ${user.name}`);

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                username: user.username,
                name: user.name,
                role: user.role,
                email: user.email
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Internal server error' 
        });
    }
});

// Salesforce user token generation
app.post('/api/auth/salesforce-token', (req, res) => {
    try {
        const { userId, username, name, email } = req.body;

        console.log('🔐 Salesforce auth request:', { userId, username });

        if (!userId || !username) {
            return res.status(400).json({ 
                success: false, 
                error: 'User ID and username required' 
            });
        }

        // Generate JWT for Salesforce user
        const token = jwt.sign(
            {
                userId: userId,
                username: username,
                name: name || 'Salesforce User',
                email: email || `${username}@salesforce.com`,
                role: 'salesforce',
                source: 'salesforce'
            },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        console.log(`✅ Salesforce user authenticated: ${name}`);

        res.json({
            success: true,
            token,
            user: {
                id: userId,
                username: username,
                name: name,
                email: email,
                role: 'salesforce'
            }
        });

    } catch (error) {
        console.error('Salesforce token error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Internal server error' 
        });
    }
});

// Verify token
app.post('/api/auth/verify', (req, res) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({ valid: false, error: 'Token required' });
        }

        const user = jwt.verify(token, JWT_SECRET);
        res.json({ valid: true, user });

    } catch (error) {
        res.status(401).json({ valid: false, error: 'Invalid token' });
    }
});

// ======================
// HEALTH & INFO
// ======================

app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        service: 'Baluchatmessage Server',
        version: '2.0.0',
        timestamp: new Date().toISOString(),
        connections: clients.size,
        activeUsers: activeUsers.size,
        environment: process.env.NODE_ENV || 'development'
    });
});

app.get('/api/info', (req, res) => {
    const rooms = Array.from(new Set(Array.from(userRooms.values())));
    res.json({
        server: 'Baluchatmessage',
        activeRooms: rooms,
        totalConnections: clients.size,
        uptime: process.uptime()
    });
});

// ======================
// WEB SOCKET SERVER
// ======================

const server = app.listen(PORT, () => {
    console.log(`🚀 Baluchatmessage server running on port ${PORT}`);
    console.log(`🔐 JWT Authentication: ENABLED`);
    console.log(`🌐 CORS: Enabled for multiple origins`);
});

const wss = new WebSocket.Server({ 
    server,
    verifyClient: (info, done) => {
        try {
            const url = new URL(info.req.url, `http://${info.req.headers.host}`);
            const token = url.searchParams.get('token');
            
            if (!token) {
                console.log('❌ WebSocket connection rejected: No token');
                done(false, 401, 'Authentication token required');
                return;
            }

            const user = jwt.verify(token, JWT_SECRET);
            info.req.user = user;
            console.log(`✅ WebSocket auth: ${user.name} (${user.role})`);
            done(true);
            
        } catch (error) {
            console.log('❌ WebSocket auth failed:', error.message);
            done(false, 401, 'Invalid authentication token');
        }
    }
});

wss.on('connection', (ws, req) => {
    const clientId = uuidv4();
    const user = req.user;
    
    console.log(`✅ ${user.role.toUpperCase()} connected: ${user.name} (${clientId})`);
    
    clients.set(clientId, ws);
    activeUsers.set(clientId, user);

    // Send welcome message
    ws.send(JSON.stringify({
        type: 'connection',
        clientId: clientId,
        user: user,
        message: `Welcome to Baluchat, ${user.name}!`,
        timestamp: new Date().toISOString(),
        serverInfo: {
            name: 'Baluchatmessage',
            version: '2.0.0'
        }
    }));

    // Handle messages
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            handleMessage(clientId, message, user);
        } catch (error) {
            console.error('Message parse error:', error);
            sendError(ws, 'Invalid message format');
        }
    });

    // Handle disconnect
    ws.on('close', () => {
        console.log(`❌ User disconnected: ${user.name}`);
        
        const room = userRooms.get(clientId);
        if (room) {
            broadcastToRoom(room, {
                type: 'user-left',
                user: user,
                timestamp: new Date().toISOString()
            }, clientId);
        }
        
        cleanupClient(clientId);
    });

    ws.on('error', (error) => {
        console.error(`WebSocket error for ${user.name}:`, error);
    });
});

function handleMessage(clientId, message, user) {
    const ws = clients.get(clientId);
    if (!ws) return;

    switch (message.type) {
        case 'join':
            handleJoinRoom(clientId, message.room, user, ws);
            break;
            
        case 'chat':
            handleChatMessage(clientId, message, user, ws);
            break;

        case 'typing':
            handleTypingIndicator(clientId, message, user, ws);
            break;

        default:
            sendError(ws, 'Unknown message type');
    }
}

function handleJoinRoom(clientId, roomId, user, ws) {
    const previousRoom = userRooms.get(clientId);
    if (previousRoom) {
        broadcastToRoom(previousRoom, {
            type: 'user-left',
            user: user,
            timestamp: new Date().toISOString()
        }, clientId);
    }

    userRooms.set(clientId, roomId);
    console.log(`📍 ${user.name} joined room: ${roomId}`);
    
    // Notify room
    broadcastToRoom(roomId, {
        type: 'user-joined',
        user: user,
        timestamp: new Date().toISOString()
    }, clientId);

    ws.send(JSON.stringify({
        type: 'system',
        message: `Joined room: ${roomId}`,
        room: roomId,
        timestamp: new Date().toISOString()
    }));
}

function handleChatMessage(clientId, message, user, ws) {
    const room = userRooms.get(clientId);
    if (!room) {
        sendError(ws, 'Join a room first');
        return;
    }

    const chatMessage = {
        type: 'chat',
        messageId: uuidv4(),
        sender: user,
        content: message.content,
        timestamp: new Date().toISOString(),
        room: room
    };
    
    broadcastToRoom(room, chatMessage, clientId);
    console.log(`💬 ${user.name} in ${room}: ${message.content}`);
}

function handleTypingIndicator(clientId, message, user, ws) {
    const room = userRooms.get(clientId);
    if (room) {
        broadcastToRoom(room, {
            type: 'typing',
            user: user,
            isTyping: message.isTyping,
            timestamp: new Date().toISOString()
        }, clientId);
    }
}

function broadcastToRoom(room, message, excludeClientId = null) {
    let delivered = 0;
    clients.forEach((ws, clientId) => {
        if (clientId !== excludeClientId && userRooms.get(clientId) === room) {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(message));
                delivered++;
            }
        }
    });
    console.log(`📤 Message delivered to ${delivered} clients in ${room}`);
}

function sendError(ws, errorMessage) {
    ws.send(JSON.stringify({
        type: 'error',
        message: errorMessage,
        timestamp: new Date().toISOString()
    }));
}

function cleanupClient(clientId) {
    clients.delete(clientId);
    userRooms.delete(clientId);
    activeUsers.delete(clientId);
}

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 Shutting down gracefully...');
    wss.close();
    server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });
});

module.exports = app;