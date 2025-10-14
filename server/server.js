require('dotenv').config();
const WebSocket = require('ws');
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

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
app.use(express.static('public')); // Serve static files for login page

const PORT = process.env.PORT || 10000;
const JWT_SECRET = process.env.JWT_SECRET || 'baluchat-secret-key-2024';

// In-memory storage with TTL for security
const clients = new Map();
const userRooms = new Map();
const activeUsers = new Map();
const tokenBlacklist = new Map(); // Simple in-memory blacklist

// Token cleanup interval
setInterval(() => {
    const now = Date.now();
    for (const [token, expiry] of tokenBlacklist.entries()) {
        if (now > expiry) {
            tokenBlacklist.delete(token);
        }
    }
}, 60 * 60 * 1000); // Clean every hour

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
// SECURITY MIDDLEWARE
// ======================

const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const MAX_LOGIN_ATTEMPTS = 5;

function checkRateLimit(ip, endpoint) {
    const key = `${ip}:${endpoint}`;
    const now = Date.now();
    const windowStart = now - RATE_LIMIT_WINDOW;
    
    if (!rateLimitMap.has(key)) {
        rateLimitMap.set(key, []);
    }
    
    const attempts = rateLimitMap.get(key).filter(time => time > windowStart);
    rateLimitMap.set(key, attempts);
    
    if (attempts.length >= MAX_LOGIN_ATTEMPTS) {
        return false;
    }
    
    attempts.push(now);
    return true;
}

// Token validation middleware
function authenticateToken(req, res, next) {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({ 
                success: false, 
                error: 'Access token required' 
            });
        }

        // Check if token is blacklisted
        if (tokenBlacklist.has(token)) {
            return res.status(401).json({ 
                success: false, 
                error: 'Token revoked' 
            });
        }

        const user = jwt.verify(token, JWT_SECRET);
        req.user = user;
        next();
        
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ 
                success: false, 
                error: 'Token expired' 
            });
        }
        return res.status(403).json({ 
            success: false, 
            error: 'Invalid token' 
        });
    }
}

// ======================
// AUTHENTICATION ENDPOINTS
// ======================

// Serve login page
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// External user login with rate limiting
app.post('/api/auth/login', async (req, res) => {
    try {
        const clientIP = req.ip || req.connection.remoteAddress;
        
        // Check rate limit
        if (!checkRateLimit(clientIP, 'login')) {
            return res.status(429).json({ 
                success: false, 
                error: 'Too many login attempts. Please try again later.' 
            });
        }

        const { username, password } = req.body;

        console.log('🔐 Login attempt:', username, 'from IP:', clientIP);

        if (!username || !password) {
            return res.status(400).json({ 
                success: false, 
                error: 'Username and password required' 
            });
        }

        // Find user
        const user = users.find(u => u.username === username);
        if (!user) {
            console.log('❌ Login failed: User not found');
            return res.status(401).json({ 
                success: false, 
                error: 'Invalid credentials' 
            });
        }

        // Check password
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            console.log('❌ Login failed: Invalid password');
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

        console.log(`✅ User logged in: ${user.name} (${user.role})`);

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

// Logout endpoint
app.post('/api/auth/logout', authenticateToken, (req, res) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        
        // Add token to blacklist (valid for remaining token time)
        const decoded = jwt.decode(token);
        const expiryTime = decoded.exp * 1000; // Convert to milliseconds
        tokenBlacklist.set(token, expiryTime);
        
        console.log(`✅ User logged out: ${req.user.name}`);
        
        res.json({
            success: true,
            message: 'Successfully logged out'
        });
        
    } catch (error) {
        console.error('Logout error:', error);
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

// Verify token endpoint
app.post('/api/auth/verify', authenticateToken, (req, res) => {
    res.json({ 
        valid: true, 
        user: req.user 
    });
});

// Refresh token endpoint
app.post('/api/auth/refresh', authenticateToken, (req, res) => {
    try {
        // Create new token with same user data
        const newToken = jwt.sign(
            {
                userId: req.user.userId,
                username: req.user.username,
                name: req.user.name,
                role: req.user.role,
                email: req.user.email
            },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        console.log(`🔄 Token refreshed for: ${req.user.name}`);

        res.json({
            success: true,
            token: newToken,
            user: req.user
        });

    } catch (error) {
        console.error('Token refresh error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Internal server error' 
        });
    }
});

// ======================
// PROTECTED ROUTES
// ======================

app.get('/api/profile', authenticateToken, (req, res) => {
    res.json({
        success: true,
        user: req.user
    });
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

app.get('/api/info', authenticateToken, (req, res) => {
    const rooms = Array.from(new Set(Array.from(userRooms.values())));
    res.json({
        server: 'Baluchatmessage',
        activeRooms: rooms,
        totalConnections: clients.size,
        uptime: process.uptime(),
        authenticatedUser: req.user.name
    });
});

// ======================
// WEB SOCKET SERVER WITH ENHANCED AUTH
// ======================

const server = app.listen(PORT, () => {
    console.log(`🚀 Baluchatmessage server running on port ${PORT}`);
    console.log(`🔐 JWT Authentication: ENABLED`);
    console.log(`🌐 CORS: Enabled for multiple origins`);
    console.log(`🔒 Security: Rate limiting, Token blacklisting, Input validation`);
});

const wss = new WebSocket.Server({ 
    server,
    verifyClient: (info, done) => {
        try {
            const url = new URL(info.req.url, `http://${info.req.headers.host}`);
            const token = url.searchParams.get('token');
            
            if (!token) {
                console.log('❌ WebSocket connection rejected: No token');
                return done(false, 401, 'Authentication token required');
            }

            // Check token blacklist
            if (tokenBlacklist.has(token)) {
                console.log('❌ WebSocket connection rejected: Token revoked');
                return done(false, 401, 'Token revoked');
            }

            const user = jwt.verify(token, JWT_SECRET);
            info.req.user = user;
            console.log(`✅ WebSocket auth: ${user.name} (${user.role})`);
            done(true);
            
        } catch (error) {
            let errorMessage = 'Authentication failed';
            
            if (error.name === 'TokenExpiredError') {
                errorMessage = 'Token expired';
                console.log('❌ WebSocket auth failed: Token expired');
            } else if (error.name === 'JsonWebTokenError') {
                errorMessage = 'Invalid token';
                console.log('❌ WebSocket auth failed: Invalid token');
            } else {
                console.log('❌ WebSocket auth failed:', error.message);
            }
            
            done(false, 401, errorMessage);
        }
    }
});

wss.on('connection', (ws, req) => {
    const clientId = uuidv4();
    const user = req.user;
    
    console.log(`✅ ${user.role.toUpperCase()} connected: ${user.name} (${clientId})`);
    
    clients.set(clientId, ws);
    activeUsers.set(clientId, user);

    // Send welcome message with connection info
    ws.send(JSON.stringify({
        type: 'connection_established',
        clientId: clientId,
        user: user,
        message: `Welcome to Baluchat, ${user.name}!`,
        timestamp: new Date().toISOString(),
        serverInfo: {
            name: 'Baluchatmessage',
            version: '2.0.0',
            secure: true
        }
    }));

    // Handle messages with error handling
    ws.on('message', (data) => {
        try {
            // Validate message size
            if (data.length > 5000) {
                sendError(ws, 'Message too large');
                return;
            }

            const message = JSON.parse(data);
            
            // Validate message structure
            if (!message.type || typeof message.type !== 'string') {
                sendError(ws, 'Invalid message format');
                return;
            }
            
            handleMessage(clientId, message, user);
            
        } catch (error) {
            console.error('Message processing error:', error);
            sendError(ws, 'Invalid message format');
        }
    });

    // Handle disconnect
    ws.on('close', (code, reason) => {
        console.log(`❌ User disconnected: ${user.name} (Code: ${code}, Reason: ${reason || 'No reason'})`);
        
        const room = userRooms.get(clientId);
        if (room) {
            broadcastToRoom(room, {
                type: 'user_left',
                user: user,
                timestamp: new Date().toISOString(),
                message: `${user.name} has left the room`
            }, clientId);
        }
        
        cleanupClient(clientId);
    });

    ws.on('error', (error) => {
        console.error(`WebSocket error for ${user.name}:`, error);
        cleanupClient(clientId);
    });

    // Heartbeat to detect dead connections
    let isAlive = true;
    const heartbeatInterval = setInterval(() => {
        if (!isAlive) {
            console.log(`💔 Heartbeat failed for: ${user.name}`);
            ws.terminate();
            cleanupClient(clientId);
            return;
        }
        
        isAlive = false;
        ws.ping();
    }, 30000);

    ws.on('pong', () => {
        isAlive = true;
    });

    ws.on('close', () => {
        clearInterval(heartbeatInterval);
    });
});

function handleMessage(clientId, message, user) {
    const ws = clients.get(clientId);
    if (!ws) return;

    switch (message.type) {
        case 'join_room':
            handleJoinRoom(clientId, message.room, user, ws);
            break;
            
        case 'chat_message':
            handleChatMessage(clientId, message, user, ws);
            break;

        case 'typing_indicator':
            handleTypingIndicator(clientId, message, user, ws);
            break;

        case 'ping':
            // Respond to ping
            ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
            break;

        default:
            sendError(ws, 'Unknown message type');
    }
}

function handleJoinRoom(clientId, roomId, user, ws) {
    // Validate room ID
    if (!roomId || typeof roomId !== 'string' || roomId.length > 50) {
        sendError(ws, 'Invalid room ID');
        return;
    }

    const previousRoom = userRooms.get(clientId);
    if (previousRoom) {
        broadcastToRoom(previousRoom, {
            type: 'user_left',
            user: user,
            timestamp: new Date().toISOString(),
            message: `${user.name} has left the room`
        }, clientId);
    }

    userRooms.set(clientId, roomId);
    console.log(`📍 ${user.name} joined room: ${roomId}`);
    
    // Notify room
    broadcastToRoom(roomId, {
        type: 'user_joined',
        user: user,
        timestamp: new Date().toISOString(),
        message: `${user.name} has joined the room`
    }, clientId);

    ws.send(JSON.stringify({
        type: 'room_joined',
        message: `Successfully joined room: ${roomId}`,
        room: roomId,
        timestamp: new Date().toISOString()
    }));
}

function handleChatMessage(clientId, message, user, ws) {
    const room = userRooms.get(clientId);
    if (!room) {
        sendError(ws, 'You must join a room first');
        return;
    }

    // Validate message content
    if (!message.content || typeof message.content !== 'string' || message.content.trim().length === 0) {
        sendError(ws, 'Message content cannot be empty');
        return;
    }

    if (message.content.length > 1000) {
        sendError(ws, 'Message too long (max 1000 characters)');
        return;
    }

    const chatMessage = {
        type: 'chat_message',
        messageId: uuidv4(),
        sender: user,
        content: message.content.trim(),
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
            type: 'typing_indicator',
            user: user,
            isTyping: message.isTyping === true,
            timestamp: new Date().toISOString()
        }, clientId);
    }
}

function broadcastToRoom(room, message, excludeClientId = null) {
    let delivered = 0;
    let failed = 0;
    
    clients.forEach((ws, clientId) => {
        if (clientId !== excludeClientId && userRooms.get(clientId) === room) {
            if (ws.readyState === WebSocket.OPEN) {
                try {
                    ws.send(JSON.stringify(message));
                    delivered++;
                } catch (error) {
                    console.error(`Failed to send message to client ${clientId}:`, error);
                    failed++;
                }
            }
        }
    });
    
    if (delivered > 0 || failed > 0) {
        console.log(`📤 Message delivered to ${delivered} clients in ${room} (${failed} failed)`);
    }
}

function sendError(ws, errorMessage, errorCode = 'GENERAL_ERROR') {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'error',
            code: errorCode,
            message: errorMessage,
            timestamp: new Date().toISOString()
        }));
    }
}

function cleanupClient(clientId) {
    const user = activeUsers.get(clientId);
    if (user) {
        console.log(`🧹 Cleaning up client: ${user.name}`);
    }
    
    clients.delete(clientId);
    userRooms.delete(clientId);
    activeUsers.delete(clientId);
}

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 Shutting down gracefully...');
    
    // Notify all clients
    clients.forEach((ws, clientId) => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'system',
                message: 'Server is shutting down for maintenance',
                timestamp: new Date().toISOString()
            }));
        }
    });
    
    setTimeout(() => {
        wss.close();
        server.close(() => {
            console.log('✅ Server closed gracefully');
            process.exit(0);
        });
    }, 1000);
});

module.exports = app;