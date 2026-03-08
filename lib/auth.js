const crypto = require('crypto');
const db = require('./database');

class NdiiCaptcha {
    constructor() {
        this.challenges = new Map();
        this.verifiedSessions = new Map();
    }

    // Generate challenge matematika dengan gambar
    generateChallenge(sessionId) {
        const operations = [
            { type: 'add', symbol: '+', fn: (a, b) => a + b },
            { type: 'subtract', symbol: '-', fn: (a, b) => a - b },
            { type: 'multiply', symbol: '×', fn: (a, b) => a * b }
        ];

        const op = operations[Math.floor(Math.random() * operations.length)];
        let a, b;

        switch(op.type) {
            case 'add':
                a = Math.floor(Math.random() * 50) + 1;
                b = Math.floor(Math.random() * 50) + 1;
                break;
            case 'subtract':
                a = Math.floor(Math.random() * 50) + 25;
                b = Math.floor(Math.random() * 25) + 1;
                break;
            case 'multiply':
                a = Math.floor(Math.random() * 12) + 2;
                b = Math.floor(Math.random() * 12) + 2;
                break;
        }

        const answer = op.fn(a, b);
        const challengeId = crypto.randomBytes(16).toString('hex');
        
        // Encrypt answer
        const encryptedAnswer = crypto.createHash('sha256').update(answer.toString() + sessionId).digest('hex');

        this.challenges.set(challengeId, {
            encryptedAnswer,
            expires: Date.now() + 5 * 60 * 1000, // 5 minutes
            attempts: 0
        });

        return {
            challengeId,
            question: `${a} ${op.symbol} ${b} = ?`,
            svg: this.generateSVG(a, op.symbol, b)
        };
    }

    generateSVG(a, symbol, b) {
        const colors = ['#00d4ff', '#7b2cbf', '#ff006e', '#00f5d4', '#fee440'];
        const color1 = colors[Math.floor(Math.random() * colors.length)];
        const color2 = colors[Math.floor(Math.random() * colors.length)];
        
        return `
        <svg width="300" height="100" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style="stop-color:${color1};stop-opacity:0.3" />
                    <stop offset="100%" style="stop-color:${color2};stop-opacity:0.3" />
                </linearGradient>
                <filter id="noise">
                    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" />
                    <feDisplacementMap in="SourceGraphic" scale="5" />
                </filter>
            </defs>
            
            <rect width="300" height="100" fill="url(#grad1)" rx="10"/>
            
            <!-- Noise pattern -->
            <rect width="300" height="100" fill="transparent" filter="url(#noise)" opacity="0.1"/>
            
            <!-- Math equation -->
            <text x="150" y="60" font-family="Arial, sans-serif" font-size="32" 
                  font-weight="bold" text-anchor="middle" fill="#fff" 
                  style="text-shadow: 2px 2px 4px rgba(0,0,0,0.5);">
                ${a} ${symbol} ${b} = ?
            </text>
            
            <!-- Random lines to prevent OCR -->
            ${Array(5).fill(0).map(() => `
                <line x1="${Math.random() * 300}" y1="${Math.random() * 100}" 
                      x2="${Math.random() * 300}" y2="${Math.random() * 100}" 
                      stroke="${colors[Math.floor(Math.random() * colors.length)]}" 
                      stroke-width="1" opacity="0.3"/>
            `).join('')}
            
            <!-- Dots -->
            ${Array(20).fill(0).map(() => `
                <circle cx="${Math.random() * 300}" cy="${Math.random() * 100}" 
                        r="${Math.random() * 2}" fill="#fff" opacity="0.2"/>
            `).join('')}
        </svg>`;
    }

    verifyChallenge(challengeId, answer, sessionId) {
        const challenge = this.challenges.get(challengeId);
        
        if (!challenge) return { valid: false, error: 'Challenge expired' };
        if (Date.now() > challenge.expires) {
            this.challenges.delete(challengeId);
            return { valid: false, error: 'Challenge expired' };
        }
        if (challenge.attempts >= 3) {
            this.challenges.delete(challengeId);
            return { valid: false, error: 'Too many attempts' };
        }

        challenge.attempts++;
        
        const hashedAnswer = crypto.createHash('sha256').update(answer.toString() + sessionId).digest('hex');
        
        if (hashedAnswer === challenge.encryptedAnswer) {
            this.challenges.delete(challengeId);
            this.verifiedSessions.set(sessionId, true);
            return { valid: true };
        }

        return { valid: false, error: 'Incorrect answer' };
    }

    isVerified(sessionId) {
        return this.verifiedSessions.has(sessionId);
    }

    clearVerification(sessionId) {
        this.verifiedSessions.delete(sessionId);
    }
}

class AuthManager {
    constructor() {
        this.captcha = new NdiiCaptcha();
        this.sessions = new Map();
    }

    async registerUser(userData) {
        const { phone, password, name } = userData;
        
        // Check if phone exists
        const existing = await db.findOne('users', { phone });
        if (existing) {
            return { success: false, error: 'Phone number already registered' };
        }

        const user = await db.insert('users', {
            phone,
            password: db.hashPassword(password),
            name,
            isVerified: false,
            isActive: false, // Must verify social media first
            role: 'user',
            createdAt: Date.now()
        });

        return { success: true, userId: user.id };
    }

    async loginUser(phone, password, sessionId) {
        const user = await db.findOne('users', { phone });
        
        if (!user) return { success: false, error: 'Invalid credentials' };
        if (!db.verifyPassword(password, user.password)) {
            return { success: false, error: 'Invalid credentials' };
        }
        if (!user.isActive) {
            return { success: false, error: 'Account not verified. Please complete social media verification.' };
        }

        // Generate session token
        const token = crypto.randomBytes(32).toString('hex');
        this.sessions.set(token, {
            userId: user.id,
            phone: user.phone,
            createdAt: Date.now()
        });

        return { 
            success: true, 
            token,
            user: {
                id: user.id,
                phone: user.phone,
                name: user.name,
                role: user.role
            }
        };
    }

    verifyToken(token) {
        const session = this.sessions.get(token);
        if (!session) return null;
        
        // Check expiration (24 hours)
        if (Date.now() - session.createdAt > 24 * 60 * 60 * 1000) {
            this.sessions.delete(token);
            return null;
        }
        
        return session;
    }

    logout(token) {
        this.sessions.delete(token);
    }
}

module.exports = { AuthManager, NdiiCaptcha: new NdiiCaptcha() };
