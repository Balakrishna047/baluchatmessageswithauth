class SecureChatClient {
    constructor() {
        this.ws = null;
        this.token = null;
        this.user = null;
        this.currentRoom = 'general';
        this.isConnected = false;
        this.serverUrl = window.location.origin;

        this.initializeEventListeners();
    }

    initializeEventListeners() {
        // Enter key support for message input
        document.getElementById('messageInput')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendMessage();
            }
        });
    }

    async register(username, email, password) {
        try {
            const response = await fetch(`${this.serverUrl}/api/auth/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, email, password })
            });

            const data = await response.json();

            if (data.success) {
                this.token = data.data.token;
                this.user = data.data.user;
                this.showMessage('Registration successful!', 'success');
                setTimeout(() => this.showChat(), 1000);
            } else {
                this.showMessage(data.error, 'error');
            }
        } catch (error) {
            this.showMessage('Registration failed: ' + error.message, 'error');
        }
    }

    async login(username, password) {
        try {
            const response = await fetch(`${this.serverUrl}/api/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (data.success) {
                this.token = data.data.token;
                this.user = data.data.user;
                this.showMessage('Login successful!', 'success');
                setTimeout(() => this.showChat(), 1000);
            } else {
                this.showMessage(data.error, 'error');
            }
        } catch (error) {
            this.showMessage('Login failed: ' + error.message, 'error');
        }
    }

    showChat() {
        document.getElementById('authSection').style.display = 'none';
        document.getElementById('chatSection').style.display = 'flex';
        document.getElementById('usernameDisplay').textContent = this.user.username;
        
        this.connectWebSocket();
        this.joinRoom(this.currentRoom);
    }

    connectWebSocket() {
        try {
            const wsUrl = this.serverUrl.replace(/^http/, 'ws');
            this.ws = new WebSocket(`${wsUrl}?token=${this.token}`);

            this.ws.onopen = () => {
                this.isConnected = true;
                this.addSystemMessage('Connected to chat server');
            };

            this.ws.onmessage = (event) => {
                const message = JSON.parse(event.data);
                this.handleWebSocketMessage(message);
            };

            this.ws.onclose = () => {
                this.isConnected = false;
                this.addSystemMessage('Disconnected from chat server');
            };

            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.addSystemMessage('Connection error occurred');
            };

        } catch (error) {
            this.showMessage('WebSocket connection failed: ' + error.message, 'error');
        }
    }

    handleWebSocketMessage(message) {
        switch (message.type) {
            case 'connection':
                this.addSystemMessage(message.message);
                break;
                
            case 'system':
                this.addSystemMessage(message.message);
                break;
                
            case 'chat':
                this.addChatMessage(message.sender, message.content, message.timestamp);
                break;
                
            case 'error':
                this.showMessage('Error: ' + message.message, 'error');
                break;
        }
    }

    joinRoom(room) {
        this.currentRoom = room;
        document.getElementById('roomDisplay').textContent = room;
        
        if (this.ws && this.isConnected) {
            this.ws.send(JSON.stringify({
                type: 'join',
                room: room
            }));
        }
    }

    sendMessage() {
        const messageInput = document.getElementById('messageInput');
        const content = messageInput.value.trim();

        if (!content) return;

        if (this.ws && this.isConnected) {
            this.ws.send(JSON.stringify({
                type: 'chat',
                content: content
            }));
            
            messageInput.value = '';
        } else {
            this.showMessage('Not connected to chat server', 'error');
        }
    }

    addSystemMessage(content) {
        this.addMessage({
            type: 'system',
            content: content,
            timestamp: new Date().toISOString()
        });
    }

    addChatMessage(sender, content, timestamp) {
        this.addMessage({
            type: 'chat',
            sender: sender,
            content: content,
            timestamp: timestamp
        });
    }

    addMessage(message) {
        const messagesDiv = document.getElementById('messages');
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${message.type}`;

        if (message.type === 'system') {
            messageDiv.innerHTML = `
                <div style="color: #666; font-style: italic;">${message.content}</div>
                <div class="timestamp">${new Date(message.timestamp).toLocaleTimeString()}</div>
            `;
        } else {
            messageDiv.innerHTML = `
                <div class="message-header">
                    <span class="sender">${message.sender}</span>
                </div>
                <div class="content">${this.escapeHtml(message.content)}</div>
                <div class="timestamp">${new Date(message.timestamp).toLocaleTimeString()}</div>
            `;
        }

        messagesDiv.appendChild(messageDiv);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

    escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    showMessage(message, type) {
        const messageDiv = document.getElementById('authMessage');
        messageDiv.innerHTML = `<div class="${type}">${message}</div>`;
    }

    logout() {
        if (this.ws) {
            this.ws.close();
        }
        
        this.token = null;
        this.user = null;
        this.isConnected = false;
        
        document.getElementById('chatSection').style.display = 'none';
        document.getElementById('authSection').style.display = 'block';
        document.getElementById('messages').innerHTML = '';
        document.getElementById('authMessage').innerHTML = '';
        
        this.showLogin();
    }

    showLogin() {
        document.getElementById('loginForm').style.display = 'block';
        document.getElementById('registerForm').style.display = 'none';
    }

    showRegister() {
        document.getElementById('loginForm').style.display = 'none';
        document.getElementById('registerForm').style.display = 'block';
    }
}

// Global instance
const chatClient = new SecureChatClient();

// Global functions for HTML onclick handlers
function login() {
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    
    if (!username || !password) {
        chatClient.showMessage('Please fill in all fields', 'error');
        return;
    }
    
    chatClient.login(username, password);
}

function register() {
    const username = document.getElementById('registerUsername').value;
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    
    if (!username || !email || !password) {
        chatClient.showMessage('Please fill in all fields', 'error');
        return;
    }
    
    chatClient.register(username, email, password);
}

function showLogin() {
    chatClient.showLogin();
}

function showRegister() {
    chatClient.showRegister();
}

function sendMessage() {
    chatClient.sendMessage();
}

function handleKeyPress(event) {
    if (event.key === 'Enter') {
        sendMessage();
    }
}

function logout() {
    chatClient.logout();
}