const fs = require('fs-extra');
const path = require('path');
const sharp = require('sharp');
const db = require('./database');

class VerificationSystem {
    constructor() {
        this.uploadDir = path.join(__dirname, '..', 'public', 'uploads', 'verifications');
        this.requiredPlatforms = {
            instagram: {
                username: 'its.me_ndii',
                name: 'Instagram',
                icon: 'fab fa-instagram',
                color: '#E4405F',
                checkText: ['its.me_ndii', 'following', 'follow']
            },
            youtube: {
                channel: 'NdiiClouD',
                name: 'YouTube',
                icon: 'fab fa-youtube',
                color: '#FF0000',
                checkText: ['NdiiClouD', 'subscribed', 'subscribe']
            },
            whatsapp: {
                channel: '0029VazclOxBVJl7jkbqnW1e',
                name: 'WhatsApp Channel',
                icon: 'fab fa-whatsapp',
                color: '#25D366',
                checkText: ['NdiiClouD', 'joined', 'follow']
            }
        };
    }

    async submitVerification(userId, files, platform) {
        await fs.ensureDir(this.uploadDir);
        
        const user = await db.findOne('users', { id: userId });
        if (!user) throw new Error('User not found');

        const verificationId = `vrf-${Date.now()}`;
        const userDir = path.join(this.uploadDir, userId);
        await fs.ensureDir(userDir);

        const savedFiles = [];
        
        for (const file of files) {
            const ext = path.extname(file.originalname).toLowerCase();
            const filename = `${verificationId}-${platform}${ext}`;
            const filepath = path.join(userDir, filename);

            // Process image - compress and add watermark
            if (ext.match(/\.(jpg|jpeg|png)$/)) {
                await sharp(file.buffer)
                    .resize(1200, null, { withoutEnlargement: true })
                    .jpeg({ quality: 85 })
                    .composite([{
                        input: Buffer.from(`NdiiClouD Verification\n${new Date().toISOString()}\nUser: ${userId}`),
                        gravity: 'southeast',
                        blend: 'over'
                    }])
                    .toFile(filepath);
            } else {
                await fs.writeFile(filepath, file.buffer);
            }

            savedFiles.push({
                filename,
                path: `/uploads/verifications/${userId}/${filename}`,
                originalName: file.originalname,
                platform
            });
        }

        // Save verification record
        const verification = await db.insert('verifications', {
            userId,
            platform,
            files: savedFiles,
            status: 'pending', // pending, approved, rejected
            submittedAt: Date.now(),
            reviewedAt: null,
            reviewedBy: null,
            notes: null
        });

        return verification;
    }

    async reviewVerification(verificationId, adminId, decision, notes = '') {
        const verification = await db.findOne('verifications', { id: verificationId });
        if (!verification) throw new Error('Verification not found');

        await db.update('verifications', { id: verificationId }, {
            status: decision,
            reviewedAt: Date.now(),
            reviewedBy: adminId,
            notes
        });

        // If approved, update user
        if (decision === 'approved') {
            const userVerifications = await db.find('verifications', { 
                userId: verification.userId,
                status: 'approved'
            });

            // Check if all platforms verified
            const verifiedPlatforms = new Set(userVerifications.map(v => v.platform));
            const requiredPlatforms = Object.keys(this.requiredPlatforms);
            
            const allVerified = requiredPlatforms.every(p => verifiedPlatforms.has(p));
            
            if (allVerified) {
                await db.update('users', { id: verification.userId }, {
                    isVerified: true,
                    isActive: true,
                    verifiedAt: Date.now()
                });
            }
        }

        return { success: true };
    }

    getVerificationStatus(userId) {
        const platforms = Object.keys(this.requiredPlatforms);
        return Promise.all(platforms.map(async platform => {
            const verifications = await db.find('verifications', { userId, platform });
            const approved = verifications.find(v => v.status === 'approved');
            const pending = verifications.find(v => v.status === 'pending');
            
            return {
                platform,
                name: this.requiredPlatforms[platform].name,
                icon: this.requiredPlatforms[platform].icon,
                color: this.requiredPlatforms[platform].color,
                status: approved ? 'approved' : pending ? 'pending' : 'required',
                submittedAt: pending?.submittedAt || approved?.submittedAt || null
            };
        }));
    }

    async getPendingVerifications() {
        return await db.find('verifications', { status: 'pending' });
    }

    // AI-like verification (simulated)
    async autoVerify(verificationId) {
        const verification = await db.findOne('verifications', { id: verificationId });
        if (!verification) return { success: false };

        const platform = this.requiredPlatforms[verification.platform];
        const checks = platform.checkText;

        // Simulate AI checking (in production, use actual OCR/AI)
        // For demo, manual approval required
        return { 
            success: true, 
            autoApproved: false,
            confidence: 0,
            message: 'Manual review required for accuracy'
        };
    }
}

module.exports = new VerificationSystem();
