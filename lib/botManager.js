const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs-extra');
const path = require('path');
const db = require('./database');
const { spawn } = require('child_process');

class BotManager {
    constructor() {
        this.bots = new Map(); // Active bot instances
        this.qrCodes = new Map();
        this.pairingCodes = new Map();
        this.logs = new Map();
        this.io = null;
        this.basePath = path.join(__dirname, '..', 'bots');
    }

    setIO(io) {
        this.io = io;
    }

    getBotPath(userId, botId) {
        return path.join(this.basePath, userId, botId);
    }

    async createBot(data) {
        const { userId, name, nodeVersion = '18', pairingCode = null } = data;
        
        const bot = await db.insert('bots', {
            userId,
            name,
            nodeVersion,
            status: 'creating',
            pairingCode: pairingCode || null,
            phoneConnected: null,
            isRunning: false,
            createdAt: Date.now()
        });

        // Create directory
        const botPath = this.getBotPath(userId, bot.id);
        await fs.ensureDir(botPath);

        // Create package.json
        await this.createPackageJson(botPath, name, nodeVersion);

        // Create index.js (kosongan - user isi sendiri atau pakai template)
        await this.createEmptyBot(botPath, bot.id);

        // If pairing code provided, auto connect
        if (pairingCode) {
            setTimeout(() => this.initWhatsApp(userId, bot.id, pairingCode), 1000);
        }

        return bot;
    }

    async createPackageJson(botPath, name, nodeVersion) {
        const pkg = {
            name: name.toLowerCase().replace(/\s+/g, '-'),
            version: "1.0.0",
            description: "WhatsApp Bot - NdiiClouD Panel",
            main: "index.js",
            scripts: {
                start: "node index.js",
                dev: "nodemon index.js"
            },
            engines: {
                node: `>=${nodeVersion}.0.0`
            },
            dependencies: {
                "@whiskeysockets/baileys": "^6.6.0",
                "pino": "^8.17.0",
                "qrcode-terminal": "^0.12.0",
                "fs-extra": "^11.2.0",
                "axios": "^1.6.2"
            },
            devDependencies: {
                "nodemon": "^3.0.2"
            }
        };

        await fs.writeJson(path.join(botPath, 'package.json'), pkg, { spaces: 2 });
    }

    async createEmptyBot(botPath, botId) {
        const code = `/**
 * 🤖 Bot WhatsApp - NdiiClouD Panel
 * Bot ID: ${botId}
 * 
 * INSTRUKSI:
 * 1. Edit file ini sesuai kebutuhan Anda
 * 2. Gunakan case.js untuk handler commands
 * 3. Gunakan settings.js untuk konfigurasi
 */

const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');

// Load settings
let settings = {};
try {
    settings = require('./settings.js');
} catch (e) {
    console.log('Settings not found, using default');
}

// Load case handler
let caseHandler = null;
try {
    caseHandler = require('./case.js');
} catch (e) {
    console.log('Case handler not loaded');
}

const startBot = async () => {
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
    
    const sock = makeWASocket({
        printQRInTerminal: true,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ['NdiiClouD Bot', 'Chrome', '1.0.0']
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startBot();
        } else if (connection === 'open') {
            console.log('✅ Bot connected!');
            // Notify panel
            if (process.send) {
                process.send({ type: 'connected', phone: sock.user.id });
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async (m) => {
        if (m.type !== 'notify') return;
        
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
        
        console.log(\\`[\\${from}] \\${text}\\`);

        // Handle with case.js if exists
        if (caseHandler) {
            await caseHandler(sock, msg, from, text);
        } else {
            // Default handler
            if (text.toLowerCase() === '!ping') {
                await sock.sendMessage(from, { text: 'Pong! 🏓' });
            }
        }
    });

    return sock;
};

startBot().catch(console.error);

// Keep alive for panel
process.on('message', (msg) => {
    if (msg.type === 'stop') {
        console.log('Stopping bot...');
        process.exit(0);
    }
});
`;

        await fs.writeFile(path.join(botPath, 'index.js'), code);

        // Create empty case.js
        const caseCode = `/**
 * 📁 case.js - Command Handler
 * 
 * Tambahkan command handler Anda di sini
 */

module.exports = async (sock, msg, from, text) => {
    const args = text.trim().split(/ +/);
    const command = args.shift().toLowerCase();
    
    switch(command) {
        case '!ping':
            await sock.sendMessage(from, { text: 'Pong! 🏓' });
            break;
            
        case '!menu':
            await sock.sendMessage(from, { 
                text: \`🤖 *Menu Bot*
                
!ping - Cek bot
!menu - Tampilkan menu

_Edit case.js untuk menambah fitur_\\` 
            });
            break;
            
        default:
            // Command tidak dikenal
            break;
    }
};
`;

        await fs.writeFile(path.join(botPath, 'case.js'), caseCode);

        // Create settings.js
        const settingsCode = `/**
 * ⚙️ settings.js - Konfigurasi Bot
 */

module.exports = {
    botName: 'NdiiClouD Bot',
    prefix: '!',
    ownerNumber: '',
    autoRead: true,
    autoTyping: false,
    
    // Tambahkan konfigurasi lainnya
};
`;

        await fs.writeFile(path.join(botPath, 'settings.js'), settingsCode);
    }

    async initWhatsApp(userId, botId, pairingCode = null) {
        const botPath = this.getBotPath(userId, botId);
        const authPath = path.join(botPath, 'auth_info');

        try {
            const { state, saveCreds } = await useMultiFileAuthState(authPath);
            
            const sock = makeWASocket({
                printQRInTerminal: false,
                auth: state,
                logger: pino({ level: 'silent' }),
                browser: ['NdiiClouD Bot', 'Chrome', '1.0.0']
            });

            // Handle pairing code
            if (pairingCode && !sock.authState.creds.registered) {
                setTimeout(async () => {
                    const code = await sock.requestPairingCode(pairingCode);
                    this.pairingCodes.set(botId, code);
                    
                    if (this.io) {
                        this.io.to(`bot:${botId}`).emit('pairing_code', { code });
                    }
                }, 3000);
            }

            sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;

                if (qr) {
                    this.qrCodes.set(botId, qr);
                    if (this.io) {
                        this.io.to(`bot:${botId}`).emit('qr', { qr });
                    }
                }

                if (connection === 'open') {
                    this.qrCodes.delete(botId);
                    this.pairingCodes.delete(botId);
                    
                    await db.update('bots', { id: botId }, {
                        status: 'connected',
                        phoneConnected: sock.user.id,
                        isRunning: true
                    });

                    if (this.io) {
                        this.io.to(`bot:${botId}`).emit('connected', {
                            phone: sock.user.id,
                            name: sock.user.name
                        });
                    }
                }

                if (connection === 'close') {
                    const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                    
                    await db.update('bots', { id: botId }, {
                        status: shouldReconnect ? 'reconnecting' : 'disconnected',
                        isRunning: false
                    });

                    if (this.io) {
                        this.io.to(`bot:${botId}`).emit('disconnected');
                    }

                    if (shouldReconnect) {
                        setTimeout(() => this.initWhatsApp(userId, botId), 5000);
                    }
                }
            });

            sock.ev.on('creds.update', saveCreds);

            this.bots.set(botId, { sock, userId, startTime: Date.now() });

        } catch (error) {
            console.error('WhatsApp init error:', error);
            await db.update('bots', { id: botId }, { status: 'error', error: error.message });
        }
    }

    async startNodeBot(userId, botId) {
        const botPath = this.getBotPath(userId, botId);
        const bot = await db.findOne('bots', { id: botId });

        if (!await fs.pathExists(botPath)) {
            return { success: false, error: 'Bot files not found' };
        }

        // Kill existing process
        await this.stopNodeBot(botId);

        try {
            const child = spawn('node', ['index.js'], {
                cwd: botPath,
                stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
                env: {
                    ...process.env,
                    NODE_VERSION: bot.nodeVersion,
                    BOT_ID: botId
                }
            });

            let processLogs = [];

            child.stdout.on('data', (data) => {
                const log = data.toString();
                processLogs.push({ type: 'out', data: log, time: Date.now() });
                this.broadcastLog(botId, 'stdout', log);
            });

            child.stderr.on('data', (data) => {
                const log = data.toString();
                processLogs.push({ type: 'err', data: log, time: Date.now() });
                this.broadcastLog(botId, 'stderr', log);
            });

            child.on('message', (msg) => {
                if (msg.type === 'connected') {
                    db.update('bots', { id: botId }, {
                        phoneConnected: msg.phone,
                        status: 'connected'
                    });
                }
            });

            child.on('close', (code) => {
                this.broadcastLog(botId, 'system', `Process exited with code ${code}`);
                db.update('bots', { id: botId }, { isRunning: false, status: 'stopped' });
            });

            this.logs.set(botId, processLogs);

            // Save process reference
            const existing = this.bots.get(botId);
            this.bots.set(botId, { ...existing, process: child, nodeRunning: true });

            await db.update('bots', { id: botId }, { isRunning: true, status: 'running' });

            return { success: true };

        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async stopNodeBot(botId) {
        const botData = this.bots.get(botId);
        if (!botData?.process) return { success: false, error: 'Not running' };

        try {
            botData.process.send({ type: 'stop' });
            
            setTimeout(() => {
                if (!botData.process.killed) {
                    botData.process.kill('SIGTERM');
                    setTimeout(() => {
                        if (!botData.process.killed) {
                            botData.process.kill('SIGKILL');
                        }
                    }, 3000);
                }
            }, 5000);

            botData.nodeRunning = false;
            this.bots.set(botId, botData);

            return { success: true };

        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async restartNodeBot(userId, botId) {
        await this.stopNodeBot(botId);
        await new Promise(r => setTimeout(r, 2000));
        return await this.startNodeBot(userId, botId);
    }

    broadcastLog(botId, type, data) {
        if (!this.io) return;
        
        const logs = this.logs.get(botId) || [];
        logs.push({ type, data, time: Date.now() });
        if (logs.length > 1000) logs.shift();
        this.logs.set(botId, logs);

        this.io.to(`bot:${botId}`).emit('log', { type, data, time: Date.now() });
    }

    getLogs(botId, lines = 100) {
        const logs = this.logs.get(botId) || [];
        return logs.slice(-lines);
    }

    async getStatus(botId) {
        const bot = await db.findOne('bots', { id: botId });
        const botData = this.bots.get(botId);
        
        return {
            ...bot,
            nodeRunning: botData?.nodeRunning || false,
            whatsappConnected: !!botData?.sock?.user,
            uptime: botData?.startTime ? Date.now() - botData.startTime : 0
        };
    }

    async updateFile(userId, botId, fileName, content) {
        const botPath = this.getBotPath(userId, botId);
        const filePath = path.join(botPath, fileName);
        
        // Security: only allow specific files
        const allowedFiles = ['index.js', 'case.js', 'settings.js', 'package.json'];
        if (!allowedFiles.includes(fileName)) {
            throw new Error('File not allowed');
        }

        await fs.writeFile(filePath, content);
        return { success: true };
    }

    async getFile(userId, botId, fileName) {
        const botPath = this.getBotPath(userId, botId);
        const filePath = path.join(botPath, fileName);
        
        if (!await fs.pathExists(filePath)) return null;
        
        return await fs.readFile(filePath, 'utf8');
    }
}

module.exports = new BotManager();
