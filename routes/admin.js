const express = require('express');
const router = express.Router();
const db = require('../lib/database');
const verification = require('../lib/verification');
const botManager = require('../lib/botManager');
const chatSystem = require('../lib/chatSystem');

const requireAdmin = async (req, res, next) => {
    if (!req.session.user) return res.redirect('/login');
    const user = await db.findOne('users', { id: req.session.user.id });
    if (user.role !== 'admin' && user.role !== 'superadmin') {
        return res.status(403).send('Forbidden');
    }
    next();
};

// Admin dashboard
router.get('/admin', requireAdmin, async (req, res) => {
    const stats = {
        users: (await db.find('users')).length,
        bots: (await db.find('bots')).length,
        activeBots: (await db.find('bots', { isRunning: true })).length,
        pendingVerifications: (await verification.getPendingVerifications()).length,
        unreadChats: (await chatSystem.getAllChats()).reduce((a, c) => a + c.unread, 0)
    };

    const recentUsers = (await db.find('users'))
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 10);

    res.render('admin', {
        user: req.session.user,
        stats,
        recentUsers
    });
});

// Verifications
router.get('/admin/verifications', requireAdmin, async (req, res) => {
    const pending = await verification.getPendingVerifications();
    res.render('admin-verifications', {
        user: req.session.user,
        verifications: pending
    });
});

router.post('/api/admin/verify', requireAdmin, async (req, res) => {
    const { verificationId, decision, notes } = req.body;
    const result = await verification.reviewVerification(
        verificationId,
        req.session.user.id,
        decision,
        notes
    );
    res.json(result);
});

// All bots (admin view)
router.get('/admin/bots', requireAdmin, async (req, res) => {
    const bots = await db.find('bots');
    for (const bot of bots) {
        bot.user = await db.findOne('users', { id: bot.userId });
        bot.status = await botManager.getStatus(bot.id);
    }
    
    res.render('admin-bots', {
        user: req.session.user,
        bots
    });
});

// Chats
router.get('/admin/chats', requireAdmin, async (req, res) => {
    const chats = await chatSystem.getAllChats();
    res.render('admin-chats', {
        user: req.session.user,
        chats
    });
});

// Get specific chat
router.get('/api/admin/chats/:userId', requireAdmin, async (req, res) => {
    const messages = await chatSystem.getMessages(req.params.userId, 100);
    await chatSystem.markAsRead(req.params.userId);
    res.json({ success: true, messages });
});

// Send message as admin
router.post('/api/admin/chats/:userId', requireAdmin, async (req, res) => {
    const { message, type = 'text' } = req.body;
    
    const msg = await chatSystem.saveMessage({
        userId: req.params.userId,
        sender: 'admin',
        message,
        type
    });

    // Emit to user if online
    const io = req.app.get('io');
    io.to(`chat:${req.params.userId}`).emit('new-message', msg);

    res.json({ success: true, message: msg });
});

// Create user (admin)
router.post('/api/admin/users', requireAdmin, async (req, res) => {
    const { phone, password, name, role = 'user' } = req.body;
    
    const user = await db.insert('users', {
        phone,
        password: db.hashPassword(password),
        name,
        role,
        isVerified: true,
        isActive: true,
        createdBy: req.session.user.id
    });

    res.json({ success: true, user });
});

module.exports = router;
