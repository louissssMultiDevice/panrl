const db = require('./database');
const fs = require('fs-extra');
const path = require('path');

class ChatSystem {
    constructor() {
        this.uploadDir = path.join(__dirname, '..', 'public', 'uploads', 'chats');
        this.activeUsers = new Map();
    }

    async saveMessage(data) {
        const { userId, sender, message, type = 'text', fileName = null, filePath = null } = data;
        
        const msg = await db.insert('chats', {
            userId,
            sender, // 'user' atau 'admin'
            message,
            type, // text, image, video, file
            fileName,
            filePath,
            isRead: sender === 'admin', // Auto read jika dari admin
            createdAt: Date.now()
        });

        return msg;
    }

    async getMessages(userId, limit = 50) {
        const allMessages = await db.find('chats', { userId });
        return allMessages
            .sort((a, b) => b.createdAt - a.createdAt)
            .slice(0, limit)
            .reverse();
    }

    async getUnreadCount(userId) {
        const messages = await db.find('chats', { userId, sender: 'user', isRead: false });
        return messages.length;
    }

    async markAsRead(userId) {
        const messages = await db.find('chats', { userId, isRead: false });
        for (const msg of messages) {
            await db.update('chats', { id: msg.id }, { isRead: true });
        }
    }

    async getAllChats() {
        // Group by userId
        const allMessages = await db.find('chats');
        const userIds = [...new Set(allMessages.map(m => m.userId))];
        
        const chats = [];
        for (const userId of userIds) {
            const user = await db.findOne('users', { id: userId });
            const lastMessage = allMessages
                .filter(m => m.userId === userId)
                .sort((a, b) => b.createdAt - a.createdAt)[0];
            const unread = await this.getUnreadCount(userId);
            
            chats.push({
                userId,
                userName: user?.name || 'Unknown',
                userPhone: user?.phone || '-',
                lastMessage,
                unread,
                updatedAt: lastMessage?.createdAt
            });
        }
        
        return chats.sort((a, b) => b.updatedAt - a.updatedAt);
    }

    async saveFile(file, userId) {
        await fs.ensureDir(this.uploadDir);
        const userDir = path.join(this.uploadDir, userId);
        await fs.ensureDir(userDir);

        const ext = path.extname(file.originalname);
        const fileName = `chat-${Date.now()}${ext}`;
        const filePath = path.join(userDir, fileName);

        await fs.writeFile(filePath, file.buffer);

        return {
            fileName: file.originalname,
            filePath: `/uploads/chats/${userId}/${fileName}`,
            size: file.size
        };
    }

    setUserOnline(userId, socketId) {
        this.activeUsers.set(userId, socketId);
    }

    setUserOffline(userId) {
        this.activeUsers.delete(userId);
    }

    isOnline(userId) {
        return this.activeUsers.has(userId);
    }

    getSocketId(userId) {
        return this.activeUsers.get(userId);
    }
}

module.exports = new ChatSystem();
