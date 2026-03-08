/**
 * NdiiClouD Panel v3.0 - Complete JavaScript
 * Single file JS untuk semua fungsionalitas
 */

// ============ CONFIGURATION ============
const CONFIG = {
    API_BASE: '',
    SOCKET_NAMESPACE: '',
    REFRESH_INTERVAL: 30000,
    MAX_RETRY: 3,
    DEBOUNCE_DELAY: 300
};

// ============ UTILITY FUNCTIONS ============
const Utils = {
    // DOM Helpers
    $: (selector) => document.querySelector(selector),
    $$: (selector) => document.querySelectorAll(selector),
    
    // Create element with attributes
    createElement: (tag, attrs = {}, children = []) => {
        const el = document.createElement(tag);
        Object.entries(attrs).forEach(([key, val]) => {
            if (key === 'class') el.className = val;
            else if (key === 'text') el.textContent = val;
            else if (key === 'html') el.innerHTML = val;
            else el.setAttribute(key, val);
        });
        children.forEach(child => el.appendChild(child));
        return el;
    },

    // Debounce function
    debounce: (fn, delay = CONFIG.DEBOUNCE_DELAY) => {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => fn(...args), delay);
        };
    },

    // Throttle function
    throttle: (fn, limit) => {
        let inThrottle;
        return (...args) => {
            if (!inThrottle) {
                fn(...args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    },

    // Format bytes
    formatBytes: (bytes, decimals = 2) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
    },

    // Format date
    formatDate: (timestamp, format = 'short') => {
        const date = new Date(timestamp);
        const options = format === 'short' 
            ? { day: '2-digit', month: 'short', year: 'numeric' }
            : { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' };
        return date.toLocaleDateString('id-ID', options);
    },

    // Format relative time
    timeAgo: (timestamp) => {
        const seconds = Math.floor((Date.now() - timestamp) / 1000);
        const intervals = {
            tahun: 31536000,
            bulan: 2592000,
            minggu: 604800,
            hari: 86400,
            jam: 3600,
            menit: 60,
            detik: 1
        };
        
        for (const [unit, secondsInUnit] of Object.entries(intervals)) {
            const interval = Math.floor(seconds / secondsInUnit);
            if (interval >= 1) return `${interval} ${unit} yang lalu`;
        }
        return 'baru saja';
    },

    // Escape HTML
    escapeHtml: (text) => {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    // Copy to clipboard
    copyToClipboard: async (text) => {
        try {
            await navigator.clipboard.writeText(text);
            Toast.success('Copied to clipboard!');
        } catch (err) {
            Toast.error('Failed to copy');
        }
    },

    // Generate random ID
    generateId: () => `ndi-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,

    // Local storage with encryption simulation
    storage: {
        set: (key, value) => localStorage.setItem(key, JSON.stringify(value)),
        get: (key) => {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : null;
        },
        remove: (key) => localStorage.removeItem(key),
        clear: () => localStorage.clear()
    }
};

// ============ TOAST NOTIFICATION SYSTEM ============
const Toast = {
    container: null,

    init() {
        this.container = Utils.createElement('div', { class: 'toast-container' });
        document.body.appendChild(this.container);
    },

    show(message, type = 'info', duration = 5000) {
        if (!this.container) this.init();

        const toast = Utils.createElement('div', {
            class: `toast ${type}`,
            html: `
                <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : type === 'warning' ? 'exclamation-triangle' : 'info-circle'}"></i>
                <span>${message}</span>
            `
        });

        this.container.appendChild(toast);

        // Auto remove
        setTimeout(() => {
            toast.style.animation = 'fadeOut 0.3s forwards';
            setTimeout(() => toast.remove(), 300);
        }, duration);

        return toast;
    },

    success: (msg) => Toast.show(msg, 'success'),
    error: (msg) => Toast.show(msg, 'error'),
    warning: (msg) => Toast.show(msg, 'warning'),
    info: (msg) => Toast.show(msg, 'info')
};

// ============ MODAL SYSTEM ============
const Modal = {
    active: null,

    show(id) {
        const modal = Utils.$(`#${id}`);
        if (!modal) return;
        
        this.active = modal;
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        
        // Focus trap
        const focusable = modal.querySelectorAll('button, input, select, textarea');
        if (focusable.length) focusable[0].focus();
    },

    hide(id) {
        const modal = id ? Utils.$(`#${id}`) : this.active;
        if (!modal) return;
        
        modal.classList.remove('active');
        document.body.style.overflow = '';
        this.active = null;
    },

    toggle(id) {
        const modal = Utils.$(`#${id}`);
        if (modal?.classList.contains('active')) {
            this.hide(id);
        } else {
            this.show(id);
        }
    }
};

// ============ API CLIENT ============
const API = {
    async request(endpoint, options = {}) {
        const url = `${CONFIG.API_BASE}${endpoint}`;
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            },
            credentials: 'same-origin'
        };

        try {
            const response = await fetch(url, { ...defaultOptions, ...options });
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || `HTTP ${response.status}`);
            }
            
            return data;
        } catch (error) {
            Toast.error(error.message);
            throw error;
        }
    },

    get: (endpoint) => API.request(endpoint, { method: 'GET' }),
    
    post: (endpoint, body) => API.request(endpoint, {
        method: 'POST',
        body: JSON.stringify(body)
    }),
    
    put: (endpoint, body) => API.request(endpoint, {
        method: 'PUT',
        body: JSON.stringify(body)
    }),
    
    delete: (endpoint) => API.request(endpoint, { method: 'DELETE' }),

    upload: (endpoint, formData) => API.request(endpoint, {
        method: 'POST',
        body: formData,
        headers: {} // Let browser set content-type with boundary
    })
};

// ============ SOCKET.IO HANDLER ============
const Socket = {
    io: null,
    connected: false,
    reconnectAttempts: 0,

    init() {
        if (typeof io === 'undefined') {
            console.error('Socket.IO not loaded');
            return;
        }

        this.io = io(CONFIG.SOCKET_NAMESPACE);

        this.io.on('connect', () => {
            this.connected = true;
            this.reconnectAttempts = 0;
            console.log('Socket connected');
        });

        this.io.on('disconnect', () => {
            this.connected = false;
            console.log('Socket disconnected');
        });

        this.io.on('error', (err) => {
            console.error('Socket error:', err);
        });

        return this.io;
    },

    emit(event, data) {
        if (this.connected) {
            this.io.emit(event, data);
        }
    },

    on(event, callback) {
        if (this.io) {
            this.io.on(event, callback);
        }
    },

    join(room) {
        this.emit('join', room);
    },

    leave(room) {
        this.emit('leave', room);
    }
};

// ============ BOT MANAGER ============
const BotManager = {
    currentBotId: null,
    logs: [],

    async create(name, nodeVersion, pairingCode = null) {
        try {
            const data = await API.post('/api/bots/create', {
                name,
                nodeVersion,
                pairingCode
            });
            
            Toast.success('Bot created successfully!');
            return data.bot;
        } catch (err) {
            throw err;
        }
    },

    async start(botId) {
        try {
            const data = await API.post(`/api/bots/${botId}/start`);
            if (data.success) {
                Toast.success('Bot started');
                this.updateStatus(botId, 'running');
            }
            return data;
        } catch (err) {
            throw err;
        }
    },

    async stop(botId) {
        try {
            const data = await API.post(`/api/bots/${botId}/stop`);
            if (data.success) {
                Toast.success('Bot stopped');
                this.updateStatus(botId, 'stopped');
            }
            return data;
        } catch (err) {
            throw err;
        }
    },

    async restart(botId) {
        try {
            await this.stop(botId);
            await new Promise(r => setTimeout(r, 2000));
            return await this.start(botId);
        } catch (err) {
            throw err;
        }
    },

    async getStatus(botId) {
        try {
            const data = await API.get(`/api/bots/${botId}/status`);
            return data.status;
        } catch (err) {
            return null;
        }
    },

    async getLogs(botId, lines = 100) {
        try {
            const data = await API.get(`/api/bots/${botId}/logs?lines=${lines}`);
            return data.logs;
        } catch (err) {
            return [];
        }
    },

    async getFile(botId, filename) {
        try {
            const data = await API.get(`/api/bots/${botId}/files/${filename}`);
            return data.content;
        } catch (err) {
            return null;
        }
    },

    async saveFile(botId, filename, content) {
        try {
            const data = await API.post(`/api/bots/${botId}/files/${filename}`, { content });
            if (data.success) Toast.success('File saved');
            return data;
        } catch (err) {
            throw err;
        }
    },

    openConsole(botId) {
        this.currentBotId = botId;
        Modal.show('consoleModal');
        Socket.join(`bot:${botId}`);
        
        // Load existing logs
        this.getLogs(botId, 50).then(logs => {
            const output = Utils.$('#consoleOutput');
            output.innerHTML = '';
            logs.forEach(log => this.appendConsole(log.type, log.data));
        });
    },

    appendConsole(type, data) {
        const output = Utils.$('#consoleOutput');
        if (!output) return;

        const line = Utils.createElement('div', {
            class: `console-line ${type}`,
            text: `[${new Date().toLocaleTimeString()}] ${data}`
        });

        output.appendChild(line);
        output.scrollTop = output.scrollHeight;

        // Keep only last 500 lines
        while (output.children.length > 500) {
            output.removeChild(output.firstChild);
        }
    },

    updateStatus(botId, status) {
        const card = Utils.$(`#bot-${botId}`);
        if (!card) return;

        const badge = card.querySelector('.status-badge');
        if (badge) {
            badge.className = `status-badge ${status}`;
            badge.textContent = status;
        }

        // Update buttons
        const startBtn = card.querySelector('[onclick^="startBot"]');
        const stopBtn = card.querySelector('[onclick^="stopBot"]');
        
        if (startBtn) startBtn.disabled = status === 'running';
        if (stopBtn) stopBtn.disabled = status !== 'running';
    },

    initSocketListeners() {
        Socket.on('log', (data) => {
            if (this.currentBotId === data.botId) {
                this.appendConsole(data.type, data.data);
            }
        });

        Socket.on('qr', (data) => {
            this.appendConsole('system', 'QR Code received! Please scan with WhatsApp.');
            // Show QR modal if needed
        });

        Socket.on('pairing_code', (data) => {
            this.appendConsole('system', `Pairing Code: ${data.code}`);
            Toast.info(`Pairing Code: ${data.code}`);
        });

        Socket.on('connected', (data) => {
            this.appendConsole('success', `Connected! Phone: ${data.phone}`);
            this.updateStatus(this.currentBotId, 'running');
        });

        Socket.on('disconnected', () => {
            this.appendConsole('error', 'Disconnected from WhatsApp');
            this.updateStatus(this.currentBotId, 'stopped');
        });
    }
};

// ============ FILE MANAGER ============
const FileManager = {
    currentPath: '/',

    async list(botId, path = '/') {
        try {
            const data = await API.get(`/api/bots/${botId}/files?path=${encodeURIComponent(path)}`);
            this.renderFileList(data.files);
            return data.files;
        } catch (err) {
            return [];
        }
    },

    renderFileList(files) {
        const container = Utils.$('#fileList');
        if (!container) return;

        container.innerHTML = files.map(file => `
            <div class="file-item" onclick="FileManager.open('${file.name}')">
                <div class="file-icon">
                    <i class="fas fa-${file.isDirectory ? 'folder' : 'file'}"></i>
                </div>
                <div class="file-info">
                    <div class="file-name">${file.name}</div>
                    <div class="file-meta">${Utils.formatBytes(file.size)} • ${Utils.formatDate(file.modified)}</div>
                </div>
                <div class="file-actions">
                    <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation(); FileManager.download('${file.name}')">
                        <i class="fas fa-download"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="event.stopPropagation(); FileManager.delete('${file.name}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');
    },

    openEditor(botId, filename) {
        BotManager.getFile(botId, filename).then(content => {
            Utils.$('#codeEditor').value = content || '';
            Utils.$('#editorFileName').textContent = filename;
            Modal.show('editorModal');
        });
    },

    saveCurrentFile() {
        const botId = BotManager.currentBotId;
        const filename = Utils.$('#editorFileName').textContent;
        const content = Utils.$('#codeEditor').value;
        
        BotManager.saveFile(botId, filename, content).then(() => {
            Modal.hide('editorModal');
        });
    }
};

// ============ CHAT SYSTEM ============
const Chat = {
    userId: null,
    messages: [],

    init(userId) {
        this.userId = userId;
        Socket.join(`chat:${userId}`);
        
        Socket.on('new-message', (msg) => {
            this.appendMessage(msg);
        });

        this.loadMessages();
    },

    async loadMessages() {
        try {
            const data = await API.get(`/api/chats/${this.userId}`);
            this.messages = data.messages;
            this.renderMessages();
        } catch (err) {
            console.error('Failed to load messages:', err);
        }
    },

    renderMessages() {
        const container = Utils.$('#chatMessages');
        if (!container) return;

        container.innerHTML = '';
        this.messages.forEach(msg => this.appendMessage(msg));
        this.scrollToBottom();
    },

    appendMessage(msg) {
        const container = Utils.$('#chatMessages');
        if (!container) return;

        const div = Utils.createElement('div', {
            class: `message ${msg.sender}`,
            html: `
                <div class="message-bubble">
                    ${Utils.escapeHtml(msg.message)}
                    ${msg.filePath ? `
                        <div class="file-message">
                            <i class="fas fa-file"></i>
                            <a href="${msg.filePath}" target="_blank">${msg.fileName}</a>
                        </div>
                    ` : ''}
                </div>
                <div class="message-time">${Utils.formatDate(msg.createdAt, 'long')}</div>
            `
        });

        container.appendChild(div);
        this.scrollToBottom();
    },

    scrollToBottom() {
        const container = Utils.$('#chatMessages');
        if (container) container.scrollTop = container.scrollHeight;
    },

    sendMessage(text) {
        if (!text.trim()) return;

        Socket.emit('send-message', {
            userId: this.userId,
            sender: 'user',
            message: text,
            type: 'text'
        });

        Utils.$('#messageInput').value = '';
    },

    async sendFile(file) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('userId', this.userId);

        try {
            const data = await API.upload('/api/upload-chat', formData);
            
            Socket.emit('send-message', {
                userId: this.userId,
                sender: 'user',
                message: 'Sent a file',
                type: 'file',
                fileName: data.fileName,
                filePath: data.filePath
            });
        } catch (err) {
            Toast.error('Failed to send file');
        }
    }
};

// ============ CAPTCHA SYSTEM ============
const Captcha = {
    async refresh() {
        try {
            const data = await API.get('/api/captcha');
            
            const svgContainer = Utils.$('.captcha-svg');
            const idInput = Utils.$('input[name="captchaId"]');
            
            if (svgContainer) svgContainer.innerHTML = data.svg;
            if (idInput) idInput.value = data.challengeId;
            
            // Clear answer
            const answerInput = Utils.$('input[name="captchaAnswer"]');
            if (answerInput) answerInput.value = '';
            
        } catch (err) {
            console.error('Failed to refresh captcha:', err);
        }
    }
};

// ============ THEME TOGGLE ============
const Theme = {
    current: 'dark',

    init() {
        const saved = Utils.storage.get('theme');
        if (saved) this.set(saved);
    },

    set(theme) {
        this.current = theme;
        document.documentElement.setAttribute('data-theme', theme);
        Utils.storage.set('theme', theme);
    },

    toggle() {
        this.set(this.current === 'dark' ? 'light' : 'dark');
    }
};

// ============ INITIALIZATION ============
document.addEventListener('DOMContentLoaded', () => {
    // Initialize Socket
    Socket.init();
    
    // Initialize Bot Manager listeners
    BotManager.initSocketListeners();
    
    // Initialize Theme
    Theme.init();
    
    // Close modal on outside click
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            Modal.hide();
        }
    });
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') Modal.hide();
    });
    
    console.log('🤖 NdiiClouD Panel v3.0 Initialized');
});

// ============ GLOBAL FUNCTIONS ============
window.showModal = (id) => Modal.show(id);
window.hideModal = (id) => Modal.hide(id);
window.toggleModal = (id) => Modal.toggle(id);

window.startBot = (id) => BotManager.start(id);
window.stopBot = (id) => BotManager.stop(id);
window.restartBot = (id) => BotManager.restart(id);
window.openConsole = (id) => BotManager.openConsole(id);
window.openEditor = (id, file) => FileManager.openEditor(id, file);
window.saveFile = () => FileManager.saveCurrentFile();
window.refreshCaptcha = () => Captcha.refresh();

// Form handlers
window.handleCreateBot = async (e) => {
    e.preventDefault();
    const form = e.target;
    
    try {
        const bot = await BotManager.create(
            form.name.value,
            form.nodeVersion.value,
            form.pairingCode.value || null
        );
        
        Modal.hide('createModal');
        location.reload();
    } catch (err) {
        // Error already toasted
    }
};

window.handleSendMessage = (e) => {
    if (e.key === 'Enter') {
        Chat.sendMessage(e.target.value);
    }
};

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Utils, Toast, Modal, API, Socket, BotManager, Chat };
}
