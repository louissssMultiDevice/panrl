const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const db = require('../lib/database');
const botManager = require('../lib/botManager');

class AdminBot {
    constructor() {
        this.sock = null;
        this.qr = null;
        this.isConnected = false;
        this.prefix = '/';
    }

    async start() {
        const { state, saveCreds } = await useMultiFileAuthState('./admin-bot/session');
        
        this.sock = makeWASocket({
            printQRInTerminal: true,
            auth: state,
            logger: pino({ level: 'silent' }),
            browser: ['NdiiClouD Admin', 'Chrome', '1.0.0']
        });

        this.sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                this.qr = qr;
                console.log('📱 Admin Bot QR Code generated');
            }
            
            if (connection === 'close') {
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                if (shouldReconnect) {
                    console.log('🔄 Reconnecting admin bot...');
                    this.start();
                }
            } else if (connection === 'open') {
                this.isConnected = true;
                console.log('✅ Admin Bot Connected:', this.sock.user.id);
                this.sendToAdmin('🤖 *NdiiClouD Admin Bot*\\n\\nBot admin telah aktif!\\nGunakan *!menu* untuk melihat fitur.');
            }
        });

        this.sock.ev.on('creds.update', saveCreds);
        this.sock.ev.on('messages.upsert', (m) => this.handleMessages(m));
    }

    async handleMessages({ messages, type }) {
        if (type !== 'notify') return;
        
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
        const args = text.trim().split(/ +/);
        const command = args.shift().toLowerCase();

        // Check if registered user
        const user = await db.findOne('users', { phone: from.replace('@s.whatsapp.net', '') });
        
        // Admin only commands
        const isAdmin = from === process.env.ADMIN_NUMBER || user?.role === 'admin';

        switch(command) {
            case '!menu':
                await this.sendMenu(from, user, isAdmin);
                break;
                
            case '!listadmin':
                if (!isAdmin) return await this.reply(from, '❌ Admin only!');
                await this.listAdmins(from);
                break;
                
            case '!listuser':
                if (!isAdmin) return await this.reply(from, '❌ Admin only!');
                await this.listUsers(from);
                break;
                
            case '!createuser':
                if (!isAdmin) return await this.reply(from, '❌ Admin only!');
                await this.createUser(from, args);
                break;
                
            case '!createpanel':
                if (!isAdmin) return await this.reply(from, '❌ Admin only!');
                await this.createPanel(from, args);
                break;
                
            case '!delusr':
                if (!isAdmin) return await this.reply(from, '❌ Admin only!');
                await this.deleteUser(from, args);
                break;
                
            case '!delpanel':
                if (!isAdmin) return await this.reply(from, '❌ Admin only!');
                await this.deletePanel(from, args);
                break;
                
            case '!mysrv':
                if (!user) return await this.reply(from, '❌ Anda belum terdaftar!');
                await this.myServers(from, user);
                break;
                
            case '!cekcpu':
                if (!isAdmin) return await this.reply(from, '❌ Admin only!');
                await this.checkCPU(from, args[0]);
                break;
                
            case '!cpu':
                await this.sendCPUCanvas(from);
                break;
                
            case '!status':
                await this.sendStatusCanvas(from);
                break;
                
            case '!owner':
                await this.sendOwnerContact(from);
                break;
                
            case '!sosmed':
                await this.sendSocialMedia(from);
                break;
                
            case '!donate':
                await this.sendDonate(from);
                break;
                
            default:
                if (text.startsWith(this.prefix)) {
                    await this.reply(from, '❓ Command tidak dikenal. Ketik *!menu* untuk bantuan.');
                }
        }
    }

    async sendMenu(to, user, isAdmin) {
        let menu = `🤖 *NdiiClouD Panel Bot*\\n\\n`;
        menu += `👤 *User:* ${user ? user.name : 'Guest'}\\n`;
        menu += `📱 *Nomor:* ${to.replace('@s.whatsapp.net', '')}\\n`;
        menu += `🔰 *Role:* ${isAdmin ? 'Admin' : user ? 'User' : 'Guest'}\\n\\n`;
        
        menu += `📋 *MENU UTAMA:*\\n`;
        menu += `• !mysrv - Lihat server Anda\\n`;
        menu += `• !cpu - Cek CPU usage (Canvas)\\n`;
        menu += `• !status - Status sistem (Canvas)\\n`;
        menu += `• !owner - Kontak owner\\n`;
        menu += `• !sosmed - Sosial media kami\\n`;
        menu += `• !donate - Dukung kami\\n\\n`;
        
        if (isAdmin) {
            menu += `🔐 *ADMIN ONLY:*\\n`;
            menu += `• !listadmin - List admin\\n`;
            menu += `• !listuser - List users\\n`;
            menu += `• !createuser [phone] [pass] [name]\\n`;
            menu += `• !createpanel [userId] [name]\\n`;
            menu += `• !delusr [userId]\\n`;
            menu += `• !delpanel [serverId]\\n`;
            menu += `• !cekcpu [serverId]\\n`;
        }
        
        menu += `\\n📢 *Join Channel:*\\n${process.env.WA_CHANNEL}`;
        
        await this.reply(to, menu);
    }

    async listAdmins(to) {
        const admins = await db.find('admins');
        let text = `👑 *LIST ADMIN*\\n\\n`;
        admins.forEach((admin, i) => {
            text += `${i + 1}. ${admin.name} (@${admin.username})\\n`;
            text += `   📱 ${admin.number}\\n`;
            text += `   🔰 ${admin.role}\\n\\n`;
        });
        await this.reply(to, text);
    }

    async listUsers(to) {
        const users = await db.find('users');
        let text = `👥 *LIST USERS* (${users.length})\\n\\n`;
        users.slice(0, 20).forEach((user, i) => {
            text += `${i + 1}. ${user.name}\\n`;
            text += `   📱 ${user.phone}\\n`;
            text += `   ✅ ${user.isActive ? 'Active' : 'Pending'}\\n\\n`;
        });
        if (users.length > 20) text += `...dan ${users.length - 20} user lainnya\\n`;
        await this.reply(to, text);
    }

    async createUser(to, args) {
        if (args.length < 3) {
            return await this.reply(to, '❌ Format: !createuser [phone] [password] [name]');
        }
        
        const [phone, password, ...nameArr] = args;
        const name = nameArr.join(' ');
        
        const result = await db.insert('users', {
            phone,
            password: db.hashPassword(password),
            name,
            isVerified: true, // Auto verify for admin created
            isActive: true,
            role: 'user',
            createdBy: 'admin-bot',
            createdAt: Date.now()
        });
        
        await this.reply(to, `✅ User *${name}* berhasil dibuat!\\n📱 ${phone}\\n🆔 ${result.id}`);
    }

    async myServers(to, user) {
        const bots = await db.find('bots', { userId: user.id });
        const servers = await db.find('servers', { userId: user.id });
        
        let text = `🖥️ *MY SERVERS*\\n\\n`;
        text += `👤 *${user.name}*\\n`;
        text += `🆔 \`${user.id}\`\\n\\n`;
        
        if (bots.length === 0 && servers.length === 0) {
            text += `❌ Anda belum memiliki server.\\n`;
            text += `🌐 Login ke panel untuk membuat server.`;
        } else {
            text += `🤖 *WhatsApp Bots:* ${bots.length}\\n`;
            bots.forEach((bot, i) => {
                text += `  ${i + 1}. ${bot.name}\\n`;
                text += `     Status: ${bot.status}\\n`;
                text += `     Node: v${bot.nodeVersion}\\n\\n`;
            });
            
            text += `🖥️ *Servers:* ${servers.length}\\n`;
            servers.forEach((srv, i) => {
                text += `  ${i + 1}. ${srv.name}\\n`;
                text += `     Status: ${srv.status}\\n\\n`;
            });
        }
        
        await this.reply(to, text);
    }

    async sendOwnerContact(to) {
        const vcard = `BEGIN:VCARD\\nVERSION:3.0\\nFN:Ndii (Owner)\\nORG:NdiiClouD\\nTEL;waid=${process.env.ADMIN_NUMBER.replace('@s.whatsapp.net', '')}:${process.env.ADMIN_NUMBER.replace('@s.whatsapp.net', '')}\\nEMAIL;TYPE=WORK:admin@ndiicloud.my.id\\nURL;TYPE=WORK:https://instagram.com/its.me_ndii\\nEND:VCARD`;
        
        await this.sock.sendMessage(to, {
            contacts: {
                displayName: 'Ndii (Owner)',
                contacts: [{ vcard }]
            }
        });
        
        // Send with externalAdReply
        await this.sock.sendMessage(to, {
            text: `👤 *Owner Contact*\\n\\nHubungi owner untuk support dan kerja sama!`,
            contextInfo: {
                externalAdReply: {
                    title: 'NdiiClouD Owner',
                    body: 'Tap untuk melihat profil',
                    thumbnailUrl: 'https://via.placeholder.com/400x400/7b2cbf/ffffff?text=Ndii',
                    sourceUrl: 'https://instagram.com/its.me_ndii',
                    mediaType: 1,
                    renderLargerThumbnail: true
                }
            }
        });
    }

    async sendSocialMedia(to) {
        const buttons = [
            {
                buttonId: 'ig',
                buttonText: { displayText: '📸 Instagram' },
                type: 1
            },
            {
                buttonId: 'yt',
                buttonText: { displayText: '📺 YouTube' },
                type: 1
            },
            {
                buttonId: 'wa',
                buttonText: { displayText: '💬 WhatsApp' },
                type: 1
            }
        ];
        
        await this.sock.sendMessage(to, {
            text: `📱 *Sosial Media NdiiClouD*\\n\\nFollow kami untuk update terbaru!`,
            buttons: buttons,
            headerType: 1
        });
    }

    async sendDonate(to) {
        const text = `💝 *Dukung NdiiClouD*\\n\\n`;
        const linktree = `https://linktr.ee/ndiicloud`;
        
        await this.reply(to, `${text}Terima kasih telah menggunakan NdiiClouD!\\n\\nDukungan Anda membantu kami untuk:\\n• Maintenance server\\n• Pengembangan fitur baru\\n• Support 24/7\\n\\n💳 *Donate:* ${linktree}\\n\\n*Semua donasi akan tercatat dan dihargai!* 🙏`);
    }

    async sendCPUCanvas(to) {
        // Generate canvas image
        const { createCanvas } = require('canvas');
        const canvas = createCanvas(800, 400);
        const ctx = canvas.getContext('2d');
        
        // Background
        const gradient = ctx.createLinearGradient(0, 0, 800, 400);
        gradient.addColorStop(0, '#0f172a');
        gradient.addColorStop(1, '#1e293b');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 800, 400);
        
        // Title
        ctx.fillStyle = '#00d4ff';
        ctx.font = 'bold 30px Arial';
        ctx.fillText('NdiiClouD - CPU Usage', 30, 50);
        
        // Draw chart (simulated)
        const data = Array(20).fill(0).map(() => Math.random() * 60 + 20);
        const maxVal = Math.max(...data);
        
        ctx.beginPath();
        ctx.strokeStyle = '#00d4ff';
        ctx.lineWidth = 3;
        
        data.forEach((val, i) => {
            const x = 50 + (i * 35);
            const y = 350 - (val / 100 * 250);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();
        
        // Fill area
        ctx.lineTo(50 + (19 * 35), 350);
        ctx.lineTo(50, 350);
        ctx.fillStyle = 'rgba(0, 212, 255, 0.2)';
        ctx.fill();
        
        // Current usage
        const current = data[data.length - 1].toFixed(1);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 40px Arial';
        ctx.fillText(`${current}%`, 650, 100);
        
        const buffer = canvas.toBuffer('image/png');
        await this.sock.sendMessage(to, {
            image: buffer,
            caption: '📊 *CPU Usage Real-time*\\nNdiiClouD Panel'
        });
    }

    async reply(to, text) {
        await this.sock.sendMessage(to, { text });
    }

    async sendToAdmin(text) {
        await this.sock.sendMessage(process.env.ADMIN_NUMBER, { text });
    }
}

const adminBot = new AdminBot();
module.exports = adminBot;
