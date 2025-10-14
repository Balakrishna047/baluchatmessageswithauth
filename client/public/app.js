class BaluChatClient {
    constructor() {
        this.ws = null;
        this.clientId = null;
        this.currentUser = null;
        this.currentRoom = null;
        this.isConnected = false;
        this.typingTimer = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        
        this.serverUrl = 'wss://baluchatmessage.onrender.com';
        
        this.initializeApp();
    }

    initializeApp() {
        this.checkAuthentication();
        this.initializeEventListeners();
    }

    checkAuthentication() {
        const token = localStorage.getItem('baluChatToken');
        const user = localStorage.getItem('baluChatUser');
        
        if (!token || !user) {
            this.showLoginScreen();
            return;
        }
        
        this.currentUser = JSON.parse(user);
        this.showChatInterface();
        this.connectToServer(token);
    }

    connectToServer(token) {
        try {
            this.ws = new WebSocket(`${this.serverUrl}?token=${encodeURIComponent(token)}`);
            
            this.updateConnectionStatus('connecting', 'Connecting to Baluchat...');

            this.ws.onopen = () => {
                console.log('✅ Connected to Baluchat Server');
                this.isConnected = true;
                this.reconnectAttempts = 0;
                this.updateConnectionStatus('connected', 'Connected');
                this.enableInput();
            };

            this.ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    this.handleServerMessage(message);
                } catch (error) {
                    console.error('Error parsing message:', error);
                }
            };

            this.ws.onclose = (event) => {
                console.log('❌ Disconnected from server:', event.code, event.reason);
                this.isConnected = false;
                this.updateConnectionStatus('disconnected', 'Disconnected - Reconnecting...');
                this.disableInput();
                
                this.handleReconnection(token);
            };

            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.updateConnectionStatus('error', 'Connection error');
            };

        } catch (error) {
            console.error('Error creating WebSocket:', error);
            this.updateConnectionStatus('error', 'Connection failed');
        }
    }

    handleServerMessage(message) {
        switch (message.type) {
            case 'connection':
                this.clientId = message.clientId;
                this.addSystemMessage(message.message);
                break;
                
            case 'system':
                this.addSystemMessage(message.message);
                break;
                
            case 'chat':
                this.addChatMessage(message, false);
                break;
                
            case 'user-joined':
                this.addSystemMessage(`${message.user.name} joined the room`);
                break;
                
            case 'user-left':
                this.addSystemMessage(`${message.user.name} left the room`);
                break;
                
            case 'typing':
                this.showTypingIndicator(message.user, message.isTyping);
                break;
                
            case 'error':
                this.addSystemMessage(`Error: ${message.message}`, true);
                break;
        }
    }

    showLoginScreen() {
        document.getElementById('loginScreen').style.display = 'block';
        document.getElementById('chatScreen').style.display = 'none';
    }

    showChatInterface() {
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('chatScreen').style.display = 'block';
        document.getElementById('userName').textContent = this.currentUser.name;
        document.getElementById('userAvatar').textContent = this.currentUser.name.charAt(0).toUpperCase();
    }

    initializeEventListeners() {
        // Send message
        document.getElementById('sendBtn').addEventListener('click', () => {
            this.sendMessage();
        });

        document.getElementById('messageInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendMessage();
            }
        });

        // Typing indicator
        document.getElementById('messageInput').addEventListener('input', () => {
            this.sendTypingIndicator(true);
            clearTimeout(this.typingTimer);
            this.typingTimer = setTimeout(() => {
                this.sendTypingIndicator(false);
            }, 1000);
        });

        // Room management
        document.getElementById('joinRoomBtn').addEventListener('click', () => {
            this.joinRoom();
        });

        // Logout
        document.getElementById('logoutBtn').addEventListener('click', () => {
            this.logout();
        });
    }

    joinRoom() {
        const roomSelect = document.getElementById('roomSelect');
        const room = roomSelect.value;
        
        if (this.ws && this.isConnected) {
            this.ws.send(JSON.stringify({
                type: 'join',
                room: room
            }));
            
            this.currentRoom = room;
            this.clearMessages();
            this.addSystemMessage(`Joining room: ${room}`);
        }
    }

    sendMessage() {
        const input = document.getElementById('messageInput');
        const content = input.value.trim();
        
        if (!content || !this.isConnected || !this.currentRoom) return;
        
        if (this.ws) {
            this.ws.send(JSON.stringify({
                type: 'chat',
                content: content,
                room: this.currentRoom
            }));
            
            // Add to UI immediately
            this.addChatMessage({
                content: content,
                sender: this.currentUser,
                timestamp: new Date().toISOString()
            }, true);
            
            input.value = '';
            this.sendTypingIndicator(false);
        }
    }

    sendTypingIndicator(isTyping) {
        if (this.ws && this.isConnected && this.currentRoom) {
            this.ws.send(JSON.stringify({
                type: 'typing',
                isTyping: isTyping,
                room: this.currentRoom
            }));
        }
    }

    addChatMessage(message, isSent) {
        const messagesContainer = document.getElementById('messagesContainer');
        const messageElement = document.createElement('div');
        messageElement.className = `message ${isSent ? 'sent' : 'received'}`;
        
        const time = new Date(message.timestamp).toLocaleTimeString();
        
        messageElement.innerHTML = `
            <div class="message-bubble">
                ${!isSent ? `<div class="message-sender">${message.sender.name}</div>` : ''}
                <div class="message-content">${this.escapeHtml(message.content)}</div>
                <div class="message-time">${time}</div>
            </div>
        `;
        
        messagesContainer.appendChild(messageElement);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    addSystemMessage(message, isError = false) {
        const messagesContainer = document.getElementById('messagesContainer');
        const messageElement = document.createElement('div');
        messageElement.className = 'system-message' + (isError ? ' error' : '');
        messageElement.textContent = message;
        
        messagesContainer.appendChild(messageElement);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    showTypingIndicator(user, isTyping) {
        const indicator = document.getElementById('typingIndicator');
        const typingUser = document.getElementById('typingUser');
        
        if (isTyping) {
            typingUser.textContent = user.name;
            indicator.style.display = 'block';
        } else {
            indicator.style.display = 'none';
        }
    }

    clearMessages() {
        const messagesContainer = document.getElementById('messagesContainer');
        messagesContainer.innerHTML = '<div class="system-message">Welcome to the chat room!</div>';
    }

    updateConnectionStatus(status, message) {
        const statusElement = document.getElementById('connectionStatus');
        statusElement.textContent = message;
        statusElement.className = `connection-status ${status}`;
    }

    enableInput() {
        document.getElementById('messageInput').disabled = false;
        document.getElementById('sendBtn').disabled = false;
        document.getElementById('joinRoomBtn').disabled = false;
    }

    disableInput() {
        document.getElementById('messageInput').disabled = true;
        document.getElementById('sendBtn').disabled = true;
        document.getElementById('joinRoomBtn').disabled = true;
    }

    handleReconnection(token) {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = Math.min(30000, 1000 * Math.pow(2, this.reconnectAttempts));
            
            setTimeout(() => {
                if (!this.isConnected) {
                    this.connectToServer(token);
                }
            }, delay);
        } else {
            this.addSystemMessage('Unable to reconnect. Please refresh the page.', true);
        }
    }

    logout() {
        if (this.ws) {
            this.ws.close();
        }
        
        localStorage.removeItem('baluChatToken');
        localStorage.removeItem('baluChatUser');
        window.location.href = '/';
    }

    escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    new BaluChatClient();
});