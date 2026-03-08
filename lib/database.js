const fs = require('fs-extra');
const path = require('path');
const CryptoJS = require('crypto-js');

class Database {
    constructor() {
        this.dataPath = path.join(__dirname, '..', 'data');
        this.key = process.env.DB_ENCRYPTION_KEY || 'default-key-change-in-prod-32b!';
        this.cache = new Map();
        this.init();
    }

    async init() {
        await fs.ensureDir(this.dataPath);
        
        const collections = [
            'users', 'bots', 'verifications', 'chats', 
            'servers', 'nodes', 'activities', 'admins'
        ];
        
        for (const col of collections) {
            await this.ensureCollection(col);
        }

        // Create default admin
        const admins = await this.find('admins');
        if (admins.length === 0) {
            await this.insert('admins', {
                id: 'admin-001',
                username: process.env.ADMIN_USERNAME || 'Ndii',
                password: this.hashPassword(process.env.ADMIN_PASSWORD || 'admin123'),
                name: 'Ndii Admin',
                number: process.env.ADMIN_NUMBER || '6287717274346@s.whatsapp.net',
                role: 'superadmin',
                isActive: true,
                createdAt: Date.now()
            });
        }
    }

    async ensureCollection(name) {
        const filePath = path.join(this.dataPath, `${name}.json.enc`);
        if (!(await fs.pathExists(filePath))) {
            await this.save(name, []);
        }
    }

    encrypt(data) {
        return CryptoJS.AES.encrypt(JSON.stringify(data), this.key, {
            mode: CryptoJS.GCM,
            padding: CryptoJS.Pkcs7,
            iv: CryptoJS.lib.WordArray.random(16)
        }).toString();
    }

    decrypt(encrypted) {
        try {
            const decrypted = CryptoJS.AES.decrypt(encrypted, this.key, {
                mode: CryptoJS.GCM,
                padding: CryptoJS.Pkcs7
            }).toString(CryptoJS.enc.Utf8);
            return JSON.parse(decrypted);
        } catch (e) {
            return [];
        }
    }

    async load(name) {
        if (this.cache.has(name)) return this.cache.get(name);
        
        const filePath = path.join(this.dataPath, `${name}.json.enc`);
        if (!(await fs.pathExists(filePath))) return [];
        
        const encrypted = await fs.readFile(filePath, 'utf8');
        const data = this.decrypt(encrypted);
        this.cache.set(name, data);
        return data;
    }

    async save(name, data) {
        const filePath = path.join(this.dataPath, `${name}.json.enc`);
        await fs.writeFile(filePath, this.encrypt(data));
        this.cache.set(name, data);
    }

    // CRUD Operations
    async find(collection, query = {}) {
        const data = await this.load(collection);
        if (Object.keys(query).length === 0) return data;
        return data.filter(item => {
            for (const [key, value] of Object.entries(query)) {
                if (item[key] !== value) return false;
            }
            return true;
        });
    }

    async findOne(collection, query) {
        const results = await this.find(collection, query);
        return results[0] || null;
    }

    async insert(collection, doc) {
        const data = await this.load(collection);
        if (!doc.id) doc.id = `ndi-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        doc.createdAt = Date.now();
        doc.updatedAt = Date.now();
        data.push(doc);
        await this.save(collection, data);
        return doc;
    }

    async update(collection, query, update) {
        const data = await this.load(collection);
        const index = data.findIndex(item => {
            for (const [key, value] of Object.entries(query)) {
                if (item[key] !== value) return false;
            }
            return true;
        });
        
        if (index !== -1) {
            data[index] = { ...data[index], ...update, updatedAt: Date.now() };
            await this.save(collection, data);
            return data[index];
        }
        return null;
    }

    async delete(collection, query) {
        let data = await this.load(collection);
        const initialLength = data.length;
        data = data.filter(item => {
            for (const [key, value] of Object.entries(query)) {
                if (item[key] === value) return false;
            }
            return true;
        });
        
        if (data.length !== initialLength) {
            await this.save(collection, data);
            return true;
        }
        return false;
    }

    hashPassword(password) {
        return CryptoJS.SHA256(password + this.key).toString();
    }

    verifyPassword(password, hash) {
        return this.hashPassword(password) === hash;
    }

    generateId() {
        return `ndi-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    }
}

module.exports = new Database();
