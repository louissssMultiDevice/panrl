const express = require('express');
const router = express.Router();
const multer = require('multer');
const { AuthManager, NdiiCaptcha } = require('../lib/auth');
const db = require('../lib/database');
const verification = require('../lib/verification');

const upload = multer({ storage: multer.memoryStorage() });
const auth = new AuthManager();

// Login page
router.get('/login', (req, res) => {
    if (req.session.user) return res.redirect('/dashboard');
    res.render('index', { 
        error: null,
        captcha: NdiiCaptcha.generateChallenge(req.sessionID)
    });
});

// Login POST
router.post('/login', async (req, res) => {
    const { phone, password, captchaId, captchaAnswer } = req.body;

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
router.post('/register', upload.array('proofs', 5), async (req, res) => {
    try {
        const { name, phone, password } = req.body;
        
        // Register user
        const result = await auth.registerUser({ name, phone, password });
        
        if (!result.success) {
            return res.json({ success: false, error: result.error });
        }

        // Submit verifications for each platform
        if (req.files && req.files.length > 0) {
            const platforms = ['instagram', 'youtube', 'whatsapp'];
            
            for (let i = 0; i < Math.min(req.files.length, platforms.length); i++) {
                await verification.submitVerification(
                    result.userId,
                    [req.files[i]],
                    platforms[i]
                );
            }
        }

        res.json({ success: true, message: 'Registration successful. Waiting for verification.' });

    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// Logout
router.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// Refresh captcha API
router.get('/captcha', (req, res) => {
    const challenge = NdiiCaptcha.generateChallenge(req.sessionID);
    res.json(challenge);
});

module.exports = router;
