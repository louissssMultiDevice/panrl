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

    async delete(collection, query, options = {}) {
        const data = await this.load(collection);
        const initial
