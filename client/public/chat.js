class SecureChatClient {
    constructor() {
        this.ws = null;
        this.token = null;
        this.user = null;
        this.currentRoom = 'general';
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.typingTimeout = null;
        this.isTyping = false;
        
        // UPDATED: Use production URL
        this.serverUrl = window.location.hostname === 'localhost' 
            ? 'http://localhost:10000' 
            : 'https://baluchatmessage.onrender.com';
        
        // WebSocket URL
        this.wsUrl = window.location.hostname === 'localhost'
            ? 'ws://localhost:10000'
            : 'wss://baluchatmessage.onrender.com';

        this.initializeEventListeners();
        this.checkSalesforceToken();
    }

    initializeEventListeners() {
        // Enter key support for message input
        const messageInput = document.getElementById('messageInput');
        if (messageInput) {
            messageInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.sendMessage();
                }
            });

            // Typing indicator
            messageInput.addEventListener('input', () => {
                this.handleTyping();
            });
        }
    }

    // NEW: Check for Salesforce token in URL
    checkSalesforceToken() {
        const urlParams = new URLSearchParams(window.location.search);
        const sfToken = urlParams.get('sfToken');
        
        if (sfToken) {
            this.salesforceLogin(sfToken);
        }
    }

    // NEW: Salesforce login method
    async salesforceLogin(salesforceToken) {
        try {
            const response = await fetch(`${this.serverUrl}/api/auth/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: salesforceToken })
            });

            const data = await response.json();

            if (data.success) {
                this.token = salesforceToken;
                this.user = data.data;
                this.showMessage('Salesforce authentication successful!', 'success');
                setTimeout(() => {
                    this.showChat();
                    this.showSalesforceBadge();
                }, 1000);
            } else {
                this.showMessage('Salesforce authentication failed', 'error');
            }
        } catch (error) {
            console.error('Salesforce login error:', error);
            this.showMessage('Salesforce authentication failed', 'error');
        }
    }

    // NEW: Show Salesforce badge
    showSalesforceBadge() {
        const userBadge = document.getElementById('userBadge');
        const salesforceBadge = document.getElementById('salesforceBadge');
        
        if (this.user && this.user.source === 'salesforce') {
            if (userBadge) userBadge.style.display = 'block';
            if (salesforceBadge) salesforceBadge.style.display = 'inline-block';
        }
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
        this.showSalesforceBadge();
    }

    connectWebSocket() {
        try {
            const wsUrl = this.wsUrl;
            this.ws = new WebSocket(`${wsUrl}?token=${this.token}`);

            this.ws.onopen = () => {
                this.isConnected = true;
                this.reconnectAttempts = 0;
                this.updateConnectionStatus('connected');
                this.addSystemMessage('Connected to chat server');
            };

            this.ws.onmessage = (event) => {
                const message = JSON.parse(event.data);
                this.handleWebSocketMessage(message);
            };

            this.ws.onclose = () => {
                this.isConnected = false;
                this.updateConnectionStatus('disconnected');
                this.addSystemMessage('Disconnected from chat server');
                this.attemptReconnect();
            };

            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.updateConnectionStatus('disconnected');
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
            
            case 'chat':
                this.displayMessage(message);
                break;
            
            case 'system':
                this.addSystemMessage(message.content || message.message);
                break;
            
            case 'error':
                this.addSystemMessage(message.message, 'error');
                break;
            
            case 'typing_indicator':
                this.showTypingIndicator(message.users);
                break;
            
            case 'typing_clear':
                this.hideTypingIndicator();
                break;
            
            case 'pong':
                // Handle ping/pong for connection health
                break;
            
            default:
                console.log('Unknown message type:', message.type);
        }
    }

    attemptReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            setTimeout(() => {
                console.log(`Reconnecting... Attempt ${this.reconnectAttempts}`);
                this.connectWebSocket();
            }, 3000);
        } else {
            this.addSystemMessage('Connection lost. Please refresh the page.', 'error');
        }
    }

    joinRoom(room) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            console.error('WebSocket not connected');
            return;
        }

        this.currentRoom = room;
        this.ws.send(JSON.stringify({
            type: 'join',
            room: room
        }));

        // Clear messages when joining new room
        document.getElementById('messagesContainer').innerHTML = '';
        this.addSystemMessage(`Joined room: ${room}`);
    }

    sendMessage() {
        const input = document.getElementById('messageInput');
        const content = input.value.trim();

        if (!content || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
            return;
        }

        this.ws.send(JSON.stringify({
            type: 'chat',
            content: content
        }));

        // Display sent message immediately
        this.displayMessage({
            type: 'chat',
            sender: {
                username: this.user.username,
                name: this.user.name || this.user.username,
                source: this.user.source,
                role: this.user.role
            },
            content: content,
            timestamp: new Date().toISOString()
        }, true);

        input.value = '';
        this.stopTyping();
    }

    displayMessage(message, isSent = false) {
        const container = document.getElementById('messagesContainer');
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${isSent ? 'sent' : 'received'}`;

        const senderBadge = message.sender.source === 'salesforce' 
            ? '<span class="badge salesforce-badge" style="font-size: 10px; margin-left: 5px;">⚡ SF</span>'
            : '';

        messageDiv.innerHTML = `
            <div class="message-bubble">
                ${!isSent ? `<div class="message-sender">${message.sender.name || message.sender.username}${senderBadge}</div>` : ''}
                <div class="message-content">${this.escapeHtml(message.content)}</div>
                <div class="message-time">${this.formatTime(message.timestamp)}</div>
            </div>
        `;

        container.appendChild(messageDiv);
        container.scrollTop = container.scrollHeight;
    }

    addSystemMessage(content, type = 'info') {
        const container = document.getElementById('messagesContainer');
        const messageDiv = document.createElement('div');
        messageDiv.className = `system-message ${type}`;
        messageDiv.textContent = content;
        container.appendChild(messageDiv);
        container.scrollTop = container.scrollHeight;
    }

    handleTyping() {
        if (!this.isTyping) {
            this.isTyping = true;
            this.ws.send(JSON.stringify({ type: 'typing_start' }));
        }

        clearTimeout(this.typingTimeout);
        this.typingTimeout = setTimeout(() => {
            this.stopTyping();
        }, 2000);
    }

    stopTyping() {
        if (this.isTyping) {
            this.isTyping = false;
            this.ws.send(JSON.stringify({ type: 'typing_stop' }));
        }
    }

    showTypingIndicator(users) {
        const indicator = document.getElementById('typingIndicator');
        const text = document.getElementById('typingText');
        
        if (users && users.length > 0) {
            const userList = users.join(', ');
            text.textContent = `${userList} ${users.length === 1 ? 'is' : 'are'} typing...`;
            indicator.style.display = 'block';
        }
    }

    hideTypingIndicator() {
        const indicator = document.getElementById('typingIndicator');
        indicator.style.display = 'none';
    }

    updateConnectionStatus(status) {
        const statusElement = document.getElementById('connectionStatus');
        statusElement.className = `connection-status ${status}`;
        statusElement.textContent = status.charAt(0).toUpperCase() + status.slice(1);
    }

    formatTime(timestamp) {
        return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
        this.reconnectAttempts = 0;
        this.isConnected = false;
        
        localStorage.removeItem('chatToken');
        localStorage.removeItem('chatUser');
        
        document.getElementById('chatSection').style.display = 'none';
        document.getElementById('authSection').style.display = 'block';
        document.getElementById('messagesContainer').innerHTML = '';
        document.getElementById('authMessage').innerHTML = '';
        document.getElementById('typingIndicator').style.display = 'none';
        
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

// Add these functions at the end of the file

function changeRoom() {
    const roomSelect = document.getElementById('roomSelect');
    const selectedRoom = roomSelect.value;
    chatClient.currentRoom = selectedRoom;
}

function joinSelectedRoom() {
    const roomSelect = document.getElementById('roomSelect');
    const selectedRoom = roomSelect.value;
    chatClient.joinRoom(selectedRoom);
}