/**
 * NdiiClouD Database System
 * JSON-based encrypted database with full CRUD operations
 */

const fs = require('fs-extra');
const path = require('path');
const CryptoJS = require('crypto-js');

class Database {
    constructor() {
        this.dataPath = path.join(__dirname, '..', 'data');
        this.cache = new Map();
        this.key = process.env.DB_ENCRYPTION_KEY || 'NdiiClouD-Secure-Default-Key-32B!!';
        
        // Ensure data directory exists
        this.init();
    }

    async init() {
        await fs.ensureDir(this.dataPath);
        
        // Define all collections
        const collections = [
            'users',           // User accounts
            'bots',            // WhatsApp bots
            'servers',         // Server instances
            'verifications',   // Social media verifications
            'chats',           // Chat messages
            'admins',          // Admin accounts
            'nodes',           // Server nodes
            'allocations',     // IP:Port allocations
            'activities',      // Activity logs
            'apikeys',         // API keys
            'backups',         // Backup records
            'settings'         // System settings
        ];

        // Initialize each collection
        for (const collection of collections) {
            await this.ensureCollection(collection);
        }

        // Create default admin if none exists
        await this.createDefaultAdmin();
        
        console.log('✅ Database initialized');
    }

    async ensureCollection(name) {
        const filePath = path.join(this.dataPath, `${name}.json.enc`);
        
        if (!(await fs.pathExists(filePath))) {
            await this.save(name, []);
        }
    }

    // Encryption methods
    encrypt(data) {
        const jsonString = JSON.stringify(data);
        const encrypted = CryptoJS.AES.encrypt(jsonString, this.key, {
            mode: CryptoJS.GCM,
            padding: CryptoJS.Pkcs7,
            iv: CryptoJS.lib.WordArray.random(16)
        });
        
        return encrypted.toString();
    }

    decrypt(encryptedData) {
        try {
            const decrypted = CryptoJS.AES.decrypt(encryptedData, this.key, {
                mode: CryptoJS.GCM,
                padding: CryptoJS.Pkcs7
            });
            
            const jsonString = decrypted.toString(CryptoJS.enc.Utf8);
            return JSON.parse(jsonString);
        } catch (error) {
            console.error('Decryption error:', error);
            return [];
        }
    }

    // File operations
    async load(name) {
        // Check cache first
        if (this.cache.has(name)) {
            return this.cache.get(name);
        }

        const filePath = path.join(this.dataPath, `${name}.json.enc`);
        
        if (!(await fs.pathExists(filePath))) {
            return [];
        }

        try {
            const encrypted = await fs.readFile(filePath, 'utf8');
            const data = this.decrypt(encrypted);
            
            // Update cache
            this.cache.set(name, data);
            return data;
        } catch (error) {
            console.error(`Error loading ${name}:`, error);
            return [];
        }
    }

    async save(name, data) {
        const filePath = path.join(this.dataPath, `${name}.json.enc`);
        
        try {
            const encrypted = this.encrypt(data);
            await fs.writeFile(filePath, encrypted, 'utf8');
            
            // Update cache
            this.cache.set(name, data);
            return true;
        } catch (error) {
            console.error(`Error saving ${name}:`, error);
            throw error;
        }
    }

    // CRUD Operations
    async find(collection, query = {}) {
        const data = await this.load(collection);
        
        if (Object.keys(query).length === 0) {
            return data;
        }

        return data.filter(item => {
            for (const [key, value] of Object.entries(query)) {
                // Handle nested properties with dot notation
                const keys = key.split('.');
                let val = item;
                for (const k of keys) {
                    val = val?.[k];
                }
                
                if (val !== value) return false;
            }
            return true;
        });
    }

    async findOne(collection, query) {
        const results = await this.find(collection, query);
        return results[0] || null;
    }

    async findById(collection, id) {
        return await this.findOne(collection, { id });
    }

    async insert(collection, document) {
        const data = await this.load(collection);
        
        // Generate ID if not provided
        if (!document.id) {
            document.id = this.generateId();
        }
        
        // Add timestamps
        const now = Date.now();
        document.createdAt = now;
        document.updatedAt = now;
        
        // Add to data
        data.push(document);
        
        // Save
        await this.save(collection, data);
        
        return document;
    }

    async insertMany(collection, documents) {
        const data = await this.load(collection);
        const now = Date.now();
        
        const inserted = documents.map(doc => {
            if (!doc.id) doc.id = this.generateId();
            doc.createdAt = now;
            doc.updatedAt = now;
            return doc;
        });
        
        data.push(...inserted);
        await this.save(collection, data);
        
        return inserted;
    }

    async update(collection, query, update, options = {}) {
        const data = await this.load(collection);
        let modifiedCount = 0;
        
        for (let i = 0; i < data.length; i++) {
            const item = data[i];
            let match = true;
            
            for (const [key, value] of Object.entries(query)) {
                if (item[key] !== value) {
                    match = false;
                    break;
                }
            }
            
            if (match) {
                // Apply update
                if (options.$set) {
                    Object.assign(item, options.$set, { updatedAt: Date.now() });
                } else {
                    Object.assign(item, update, { updatedAt: Date.now() });
                }
                
                modifiedCount++;
                
                if (!options.multi) break;
            }
        }
        
        if (modifiedCount > 0) {
            await this.save(collection, data);
        }
        
        return { modifiedCount };
    }

    async updateOne(collection, query, update, options = {}) {
        const result = await this.update(collection, query, update, { ...options, multi: false });
        return result.modifiedCount > 0;
    }

    async updateById(collection, id, update) {
        return await this.updateOne(collection, { id }, update);
    }

    async delete(collection, query, options = {}
        const data = await this.load(collection);
        const initialLength = data.length;
        
        const newData = data.filter(item => {
            for (const [key, value] of Object.entries(query)) {
                if (item[key] === value) return false;
            }
            return true;
        });
        
        const deletedCount = initialLength - newData.length;
        
        if (deletedCount > 0) {
            await this.save(collection, newData);
        }
        
        return { deletedCount };
    }

    async deleteOne(collection, query) {
        const result = await this.delete(collection, query);
        return result.deletedCount > 0;
    }

    async deleteById(collection, id) {
        return await this.deleteOne(collection, { id });
    }

    // Aggregation
    async aggregate(collection, pipeline) {
        let data = await this.load(collection);
        
        for (const stage of pipeline) {
            if (stage.$match) {
                data = data.filter(item => {
                    for (const [key, value] of Object.entries(stage.$match)) {
                        if (item[key] !== value) return false;
                    }
                    return true;
                });
            }
            
            if (stage.$sort) {
                const [key, order] = Object.entries(stage.$sort)[0];
                data.sort((a, b) => {
                    if (order === 1) return a[key] - b[key];
                    return b[key] - a[key];
                });
            }
            
            if (stage.$limit) {
                data = data.slice(0, stage.$limit);
            }
            
            if (stage.$skip) {
                data = data.slice(stage.$skip);
            }
        }
        
        return data;
    }

    // Count documents
    async count(collection, query = {}) {
        const data = await this.find(collection, query);
        return data.length;
    }

    // Check existence
    async exists(collection, query) {
        const result = await this.findOne(collection, query);
        return !!result;
    }

    // Utility methods
    generateId() {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substr(2, 9);
        return `ndi-${timestamp}-${random}`;
    }

    generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    hashPassword(password) {
        return CryptoJS.SHA256(password + this.key).toString();
    }

    verifyPassword(password, hash) {
        return this.hashPassword(password) === hash;
    }

    // Create default admin
    async createDefaultAdmin() {
        const admins = await this.find('admins');
        
        if (admins.length === 0) {
            const admin = {
                id: 'admin-001',
                username: process.env.ADMIN_USERNAME || 'Ndii',
                password: this.hashPassword(process.env.ADMIN_PASSWORD || 'NdiiClouD2024!'),
                name: 'Ndii Admin',
                email: 'admin@ndiicloud.my.id',
                phone: process.env.ADMIN_NUMBER || '6287717274346',
                number: process.env.ADMIN_NUMBER ? `${process.env.ADMIN_NUMBER}@s.whatsapp.net` : '6287717274346@s.whatsapp.net',
                role: 'superadmin',
                isActive: true,
                isVerified: true,
                permissions: ['*'],
                createdAt: Date.now(),
                lastLogin: null
            };
            
            await this.insert('admins', admin);
            console.log('✅ Default admin created');
        }
    }

    // Backup and restore
    async backup() {
        const backupId = this.generateId();
        const backupDir = path.join(this.dataPath, 'backups');
        await fs.ensureDir(backupDir);
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = path.join(backupDir, `backup-${timestamp}.json`);
        
        const allData = {};
        const collections = ['users', 'bots', 'servers', 'verifications', 'chats', 'admins'];
        
        for (const col of collections) {
            allData[col] = await this.load(col);
        }
        
        await fs.writeJson(backupPath, {
            id: backupId,
            timestamp: Date.now(),
            data: allData
        });
        
        // Save backup record
        await this.insert('backups', {
            id: backupId,
            path: backupPath,
            timestamp: Date.now(),
            size: (await fs.stat(backupPath)).size
        });
        
        return backupId;
    }

    async restore(backupId) {
        const backup = await this.findOne('backups', { id: backupId });
        if (!backup) throw new Error('Backup not found');
        
        const data = await fs.readJson(backup.path);
        
        for (const [collection, documents] of Object.entries(data.data)) {
            await this.save(collection, documents);
        }
        
        return true;
    }

    // Cache management
    clearCache(collection = null) {
        if (collection) {
            this.cache.delete(collection);
        } else {
            this.cache.clear();
        }
    }

    // Stats
    async getStats() {
        const collections = ['users', 'bots', 'servers', 'verifications', 'chats'];
        const stats = {};
        
        for (const col of collections) {
            const data = await this.load(col);
            stats[col] = {
                count: data.length,
                size: JSON.stringify(data).length
            };
        }
        
        return stats;
    }
}

// Export singleton instance
module.exports = new Database();

