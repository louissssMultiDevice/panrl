const express = require('express');
const router = express.Router();
const db = require('../lib/database');
const botManager = require('../lib/botManager');
const chatSystem = require('../lib/chatSystem');
const verification = require('../lib/verification');

// Middleware
const requireAuth = (req, res, next) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
};

const requireAdmin = async (req, res, next) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const user = await db.findOne('users', { id: req.session.user.id });
    if (user.role !== 'admin' && user.role !== 'superadmin') {
        return res.status(403).json({ error: 'Forbidden' });
    }
    
    next();
};

// ============ USER API ============

// Get current user
router.get('/user/me', requireAuth, async (req, res) => {
    const user = await db.findOne('users', { id: req.session.user.id });
    res.json({ success: true, user });
});

// Update user profile
router.put('/user/me', requireAuth, async (req, res) => {
    const { name, email } = req.body;
    
    await db.update('users', { id: req.session.user.id }, {
        $set: { name, email }
    });
    
    res.json({ success: true });
});

// Change password
router.put('/user/password', requireAuth, async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    
    const user = await db.findOne('users', { id: req.session.user.id });
    
    if (!db.verifyPassword(currentPassword, user.password)) {
        return res.status(400).json({ error: 'Current password is incorrect' });
    }
    
    await db.update('users', { id: req.session.user.id }, {
        $set: { password: db.hashPassword(newPassword) }
    });
    
    res.json({ success: true });
});

// ============ BOT API ============

// List all bots for user
router.get('/bots', requireAuth, async (req, res) => {
    const bots = await db.find('bots', { userId: req.session.user.id });
    res.json({ success: true, bots });
});

// Get bot details
router.get('/bots/:id', requireAuth, async (req, res) => {
    const bot = await db.findOne('bots', { id: req.params.id });
    
    if (!bot || bot.userId !== req.session.user.id) {
        return res.status(404).json({ error: 'Bot not found' });
    }
    
    const status = await botManager.getStatus(bot.id);
    
    res.json({ success: true, bot: { ...bot, ...status } });
});

// Create bot
router.post('/bots', requireAuth, async (req, res) => {
    const { name, nodeVersion, pairingCode } = req.body;
    
    // Check user limits
    const userBots = await db.find('bots', { userId: req.session.user.id });
    const user = await db.findOne('users', { id: req.session.user.id });
    const maxBots = user.role === 'admin' ? 10 : 3;
    
    if (userBots.length >= maxBots) {
        return res.status(400).json({ error: `Maximum ${maxBots} bots allowed` });
    }
    
    const bot = await botManager.createBot({
        userId: req.session.user.id,
        name,
        nodeVersion: nodeVersion || '18',
        pairingCode
    });
    
    res.json({ success: true, bot });
});

// Delete bot
router.delete('/bots/:id', requireAuth, async (req, res) => {
    const bot = await db.findOne('bots', { id: req.params.id });
    
    if (!bot || bot.userId !== req.session.user.id) {
        return res.status(404).json({ error: 'Bot not found' });
    }
    
    // Stop if running
    await botManager.stopNodeBot(bot.id);
    
    // Delete from database
    await db.deleteById('bots', bot.id);
    
    // Delete files
    const botPath = botManager.getBotPath(req.session.user.id, bot.id);
    await require('fs-extra').remove(botPath);
    
    res.json({ success: true });
});

// Bot power controls
router.post('/bots/:id/start', requireAuth, async (req, res) => {
    const bot = await db.findOne('bots', { id: req.params.id });
    
    if (!bot || bot.userId !== req.session.user.id) {
        return res.status(404).json({ error: 'Bot not found' });
    }
    
    const result = await botManager.startNodeBot(req.session.user.id, bot.id);
    res.json(result);
});

router.post('/bots/:id/stop', requireAuth, async (req, res) => {
    const bot = await db.findOne('bots', { id: req.params.id });
    
    if (!bot || bot.userId !== req.session.user.id) {
        return res.status(404).json({ error: 'Bot not found' });
    }
    
    const result = await botManager.stopNodeBot(bot.id);
    res.json(result);
});

router.post('/bots/:id/restart', requireAuth, async (req, res) => {
    const bot = await db.findOne('bots', { id: req.params.id });
    
    if (!bot || bot.userId !== req.session.user.id) {
        return res.status(404).json({ error: 'Bot not found' });
    }
    
    const result = await botManager.restartNodeBot(req.session.user.id, bot.id);
    res.json(result);
});

// Get bot logs
router.get('/bots/:id/logs', requireAuth, async (req, res) => {
    const bot = await db.findOne('bots', { id: req.params.id });
    
    if (!bot || bot.userId !== req.session.user.id) {
        return res.status(404).json({ error: 'Bot not found' });
    }
    
    const lines = parseInt(req.query.lines) || 100;
    const logs = botManager.getLogs(bot.id, lines);
    
    res.json({ success: true, logs });
});

// Get bot file
router.get('/bots/:id/files/*', requireAuth, async (req, res) => {
    const bot = await db.findOne('bots', { id: req.params.id });
    
    if (!bot || bot.userId !== req.session.user.id) {
        return res.status(404).json({ error: 'Bot not found' });
    }
    
    const filePath = req.params[0];
    const content = await botManager.getFile(req.session.user.id, bot.id, filePath);
    
    res.json({ success: true, content });
});

// Update bot file
router.put('/bots/:id/files/*', requireAuth, async (req, res) => {
    const bot = await db.findOne('bots', { id: req.params.id });
    
    if (!bot || bot.userId !== req.session.user.id) {
        return res.status(404).json({ error: 'Bot not found' });
    }
    
    const filePath = req.params[0];
    const { content } = req.body;
    
    await botManager.updateFile(req.session.user.id, bot.id, filePath, content);
    
    res.json({ success: true });
});

// ============ CHAT API ============

// Get chat messages
router.get('/chats/:userId', requireAuth, async (req, res) => {
    // Users can only access their own chats
    if (req.session.user.id !== req.params.userId && req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden' });
    }
    
    const messages = await chatSystem.getMessages(req.params.userId, 100);
    res.json({ success: true, messages });
});

// Send message (REST API fallback)
router.post('/chats/:userId', requireAuth, async (req, res) => {
    const { message, type = 'text', fileName, filePath } = req.body;
    
    const msg = await chatSystem.saveMessage({
        userId: req.params.userId,
        sender: req.session.user.role === 'admin' ? 'admin' : 'user',
        message,
        type,
        fileName,
        filePath
    });
    
    // Emit via socket if available
    const io = req.app.get('io');
    if (io) {
        io.to(`chat:${req.params.userId}`).emit('new-message', msg);
    }
    
    res.json({ success: true, message: msg });
});

// Mark as read
router.post('/chats/:userId/read', requireAuth, async (req, res) => {
    await chatSystem.markAsRead(req.params.userId);
    res.json({ success: true });
});

// ============ VERIFICATION API ============

// Get verification status
router.get('/verifications/status', requireAuth, async (req, res) => {
    const status = await verification.getVerificationStatus(req.session.user.id);
    res.json({ success: true, status });
});

// Submit verification
router.post('/verifications', requireAuth, async (req, res) => {
    // Handled by multer in main routes
    res.json({ success: true });
});

// ============ ADMIN API ============

// Get all users
router.get('/admin/users', requireAdmin, async (req, res) => {
    const users = await db.find('users');
    res.json({ success: true, users });
});

// Get all bots
router.get('/admin/bots', requireAdmin, async (req, res) => {
    const bots = await db.find('bots');
    
    // Add user info
    for (const bot of bots) {
        bot.user = await db.findOne('users', { id: bot.userId });
    }
    
    res.json({ success: true, bots });
});

// Get pending verifications
router.get('/admin/verifications/pending', requireAdmin, async (req, res) => {
    const pending = await verification.getPendingVerifications();
    res.json({ success: true, verifications: pending });
});

// Review verification
router.post('/admin/verifications/:id/review', requireAdmin, async (req, res) => {
    const { decision, notes } = req.body;
    
    const result = await verification.reviewVerification(
        req.params.id,
        req.session.user.id,
        decision,
        notes
    );
    
    res.json(result);
});

// Get system stats
router.get('/admin/stats', requireAdmin, async (req, res) => {
    const stats = await db.getStats();
    
    // Add runtime stats
    stats.runtime = {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        nodeVersion: process.version
    };
    
    res.json({ success: true, stats });
});

// Create backup
router.post('/admin/backup', requireAdmin, async (req, res) => {
    const backupId = await db.backup();
    res.json({ success: true, backupId });
});

// Get all chats (admin)
router.get('/admin/chats', requireAdmin, async (req, res) => {
    const chats = await chatSystem.getAllChats();
    res.json({ success: true, chats });
});

// Impersonate user (admin only)
router.post('/admin/impersonate/:userId', requireAdmin, async (req, res) => {
    const user = await db.findOne('users', { id: req.params.userId });
    
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    // Save admin session
    req.session.adminId = req.session.user.id;
    req.session.user = {
        id: user.id,
        name: user.name,
        phone: user.phone,
        role: user.role,
        impersonated: true
    };
    
    res.json({ success: true });
});

// Stop impersonating
router.post('/admin/unimpersonate', requireAuth, async (req, res) => {
    if (!req.session.adminId) {
        return res.status(400).json({ error: 'Not impersonating' });
    }
    
    const admin = await db.findOne('admins', { id: req.session.adminId });
    
    req.session.user = {
        id: admin.id,
        name: admin.name,
        username: admin.username,
        role: admin.role
    };
    
    delete req.session.adminId;
    
    res.json({ success: true });
});

// ============ PUBLIC API ============

// Health check
router.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: Date.now(),
        version: '3.0.0'
    });
});

// Get node versions
router.get('/node-versions', (req, res) => {
    const versions = process.env.NODE_VERSIONS?.split(',') || ['18', '20'];
    res.json({ versions });
});

module.exports = router;
