require('dotenv').config();
const express = require('express');
const session = require('express-session');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');
const multer = require('multer');
const compression = require('compression');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const fs = require('fs-extra');

const db = require('./lib/database');
const { AuthManager, NdiiCaptcha } = require('./lib/auth');
const verification = require('./lib/verification');
const chatSystem = require('./lib/chatSystem');
const botManager = require('./lib/botManager');

const app = express();
const http = createServer(app);
const io = new Server(http, {
    cors: { origin: "*" },
    maxHttpBufferSize: 1e8 // 100MB for file uploads
});

const auth = new AuthManager();

// Security middleware
app.use(helmet({
    contentSecurityPolicy: false
}));
app.use(compression());

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100
});
app.use(limiter);

// Body parsing
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Session
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Multer setup
const upload = multer({ storage: multer.memoryStorage() });

// ============ MIDDLEWARE ============
const requireAuth = (req, res, next) => {
    if (!req.session.user) return res.redirect('/login');
    next();
};

const requireVerified = async (req, res, next) => {
    if (!req.session.user) return res.redirect('/login');
    const user = await db.findOne('users', { id: req.session.user.id });
    if (!user.isActive) return res.redirect('/verify');
    next();
};

const requireAdmin = async (req, res, next) => {
    if (!req.session.user) return res.redirect('/login');
    const user = await db.findOne('users', { id: req.session.user.id });
    if (user.role !== 'admin' && user.role !== 'superadmin') {
        return res.status(403).send('Forbidden');
    }
    next();
};

// ============ SOCKET.IO ============
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // Chat system
    socket.on('join-chat', (userId) => {
        socket.join(`chat:${userId}`);
    });

    socket.on('send-message', async (data) => {
        const message = await chatSystem.saveMessage(data);
        io.to(`chat:${data.userId}`).emit('new-message', message);
        io.to('admin-chat').emit('new-message', message);
    });

    socket.on('admin-join', () => {
        socket.join('admin-chat');
    });

    // Bot console
    socket.on('subscribe-bot', (botId) => {
        socket.join(`bot:${botId}`);
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

// Make io accessible to routes
app.set('io', io);

// ============ ROUTES ============

// Landing / Login
app.get('/', (req, res) => {
    if (req.session.user) {
        return res.redirect(req.session.user.role === 'admin' ? '/admin' : '/dashboard');
    }
    res.render('index', { 
        error: null,
        captcha: NdiiCaptcha.generateChallenge(req.sessionID)
    });
});

app.get('/login', (req, res) => {
    res.render('index', { 
        error: null,
        captcha: NdiiCaptcha.generateChallenge(req.sessionID)
    });
});

app.post('/login', async (req, res) => {
    const { phone, password, captchaId, captchaAnswer } = req.body;

    // Verify captcha
    const captchaValid = NdiiCaptcha.verifyChallenge(captchaId, captchaAnswer, req.sessionID);
    if (!captchaValid.valid) {
        return res.render('index', {
            error: captchaValid.error,
            captcha: NdiiCaptcha.generateChallenge(req.sessionID)
        });
    }

    const result = await auth.loginUser(phone, password, req.sessionID);
    
    if (!result.success) {
        return res.render('index', {
            error: result.error,
            captcha: NdiiCaptcha.generateChallenge(req.sessionID)
        });
    }

    req.session.user = result.user;
    
    if (!result.user.isVerified) {
        return res.redirect('/verify');
    }
    
    res.redirect(result.user.role === 'admin' ? '/admin' : '/dashboard');
});

// Register
app.post('/register', upload.array('verification', 3), async (req, res) => {
    const { phone, password, name } = req.body;
    
    const result = await auth.registerUser({ phone, password, name });
    
    if (!result.success) {
        return res.json({ success: false, error: result.error });
    }

    res.json({ success: true, userId: result.userId });
});

// Verification Page
app.get('/verify', requireAuth, async (req, res) => {
    const status = await verification.getVerificationStatus(req.session.user.id);
    res.render('verify', {
        user: req.session.user,
        platforms: status,
        required: verification.requiredPlatforms
    });
});

app.post('/verify', requireAuth, upload.array('proof', 5), async (req, res) => {
    try {
        const { platform } = req.body;
        const result = await verification.submitVerification(
            req.session.user.id,
            req.files,
            platform
        );
        res.json({ success: true, verification: result });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// Dashboard
app.get('/dashboard', requireVerified, async (req, res) => {
    const user = await db.findOne('users', { id: req.session.user.id });
    const bots = await db.find('bots', { userId: user.id });
    const servers = await db.find('servers', { userId: user.id });
    
    res.render('dashboard', {
        user,
        bots,
        servers,
        nodeVersions: process.env.NODE_VERSIONS.split(',')
    });
});

// Admin Panel
app.get('/admin', requireAdmin, async (req, res) => {
    const stats = {
        users: (await db.find('users')).length,
        bots: (await db.find('bots')).length,
        servers: (await db.find('servers')).length,
        pendingVerifications: (await verification.getPendingVerifications()).length
    };
    
    const pendingVerifications = await verification.getPendingVerifications();
    
    res.render('admin', {
        user: req.session.user,
        stats,
        verifications: pendingVerifications
    });
});

// Chat
app.get('/chat', requireAuth, async (req, res) => {
    const messages = await chatSystem.getMessages(req.session.user.id);
    res.render('chat', {
        user: req.session.user,
        messages
    });
});

// File upload route for chat
app.post('/api/upload-chat', requireAuth, upload.single('file'), async (req, res) => {
    try {
        const result = await chatSystem.saveFile(req.file, req.session.user.id);
        res.json({ success: true, ...result });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// API Routes untuk admin bot
app.get('/api/admin/bot-status', async (req, res) => {
    // Endpoint untuk admin bot cek status
    const stats = {
        users: (await db.find('users')).length,
        activeBots: (await db.find('bots', { isRunning: true })).length,
        pendingVerifications: (await verification.getPendingVerifications()).length
    };
    res.json(stats);
});

// Get bot info untuk admin bot
app.get('/api/bot-info/:phone', async (req, res) => {
    const user = await db.findOne('users', { phone: req.params.phone });
    if (!user) return res.json({ error: 'User not found' });
    
    const bots = await db.find('bots', { userId: user.id });
    const servers = await db.find('servers', { userId: user.id });
    
    res.json({
        user: {
            id: user.id,
            name: user.name,
            phone: user.phone,
            isActive: user.isActive
        },
        bots: bots.map(b => ({
            id: b.id,
            name: b.name,
            status: b.status,
            phoneConnected: b.phoneConnected
        })),
        servers: servers
    });
});


// API Routes

// Create Bot
app.post('/api/bots/create', requireVerified, async (req, res) => {
    const { name, nodeVersion, pairingCode } = req.body;
    
    const bot = await botManager.createBot({
        userId: req.session.user.id,
        name,
        nodeVersion: nodeVersion || '18',
        pairingCode, // If provided, use pairing code instead of QR
        status: 'creating'
    });

    res.json({ success: true, bot });
});

// Get Bot Status
app.get('/api/bots/:id/status', requireVerified, async (req, res) => {
    const bot = await db.findOne('bots', { id: req.params.id });
    if (!bot || bot.userId !== req.session.user.id) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    
    const status = await botManager.getStatus(bot.id);
    res.json({ success: true, status });
});

// Admin API - Review Verification
app.post('/api/admin/verify', requireAdmin, async (req, res) => {
    const { verificationId, decision, notes } = req.body;
    const result = await verification.reviewVerification(
        verificationId,
        req.session.user.id,
        decision,
        notes
    );
    res.json(result);
});

// Get Captcha
app.get('/api/captcha', (req, res) => {
    const challenge = NdiiCaptcha.generateChallenge(req.sessionID);
    res.json(challenge);
});

// Logout
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// Error handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

// Start server
const PORT = process.env.PORT || 8080;
http.listen(PORT, async () => {
    console.log(`
    ╔══════════════════════════════════════════════════════════╗
    ║                                                          ║
    ║           🤖 NdiiClouD Panel v3.0 🤖                    ║
    ║      Full Stack WhatsApp Bot Hosting Platform           ║
    ║                                                          ║
    ╠══════════════════════════════════════════════════════════╣
    ║  🌐 Port: ${PORT}                                        ║
    ║  🔐 Security: NdiiCaptcha + AES-256 Encryption          ║
    ║  📱 WhatsApp: Integrated Admin Bot                      ║
    ║  ✅ Verification: IG/YT/WA Required                     ║
    ║  💬 Chat: Real-time Support System                      ║
    ║                                                          ║
    ╚══════════════════════════════════════════════════════════╝
    `);
    
    // Start admin bot
    require('./admin-bot/index').start();
});
