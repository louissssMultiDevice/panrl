<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <title>Verifikasi - NdiiClouD Panel</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        :root {
            --primary: #00d4ff;
            --secondary: #7b2cbf;
            --accent: #ff006e;
            --dark: #0a0a0f;
            --darker: #050508;
            --success: #00f5d4;
            --warning: #fee440;
            --glass: rgba(255, 255, 255, 0.05);
        }
        
        body {
            font-family: 'Segoe UI', system-ui, sans-serif;
            background: var(--darker);
            color: #fff;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        
        .container {
            width: 100%;
            max-width: 800px;
        }
        
        .header {
            text-align: center;
            margin-bottom: 40px;
        }
        
        .header h1 {
            font-size: 32px;
            margin-bottom: 8px;
            background: linear-gradient(135deg, var(--primary), var(--secondary));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        
        .header p {
            color: rgba(255,255,255,0.6);
        }
        
        .verification-grid {
            display: grid;
            gap: 20px;
        }
        
        .platform-card {
            background: var(--glass);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 16px;
            padding: 24px;
            display: flex;
            align-items: center;
            gap: 20px;
            transition: all 0.3s;
        }
        
        .platform-card:hover {
            border-color: var(--primary);
            transform: translateY(-2px);
        }
        
        .platform-card.approved {
            border-color: var(--success);
            background: rgba(0, 245, 212, 0.05);
        }
        
        .platform-card.pending {
            border-color: var(--warning);
            background: rgba(254, 228, 64, 0.05);
        }
        
        .platform-icon {
            width: 60px; height: 60px;
            border-radius: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 28px;
        }
        
        .platform-info {
            flex: 1;
        }
        
        .platform-info h3 {
            margin-bottom: 4px;
        }
        
        .platform-info p {
            font-size: 14px;
            color: rgba(255,255,255,0.6);
        }
        
        .platform-status {
            text-align: right;
        }
        
        .status-badge {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 13px;
            font-weight: 600;
        }
        
        .status-badge.approved {
            background: rgba(0, 245, 212, 0.2);
            color: var(--success);
        }
        
        .status-badge.pending {
            background: rgba(254, 228, 64, 0.2);
            color: var(--warning);
        }
        
        .status-badge.required {
            background: rgba(255, 0, 110, 0.2);
            color: var(--accent);
        }
        
        .upload-area {
            margin-top: 12px;
            padding: 16px;
            border: 2px dashed rgba(255,255,255,0.2);
            border-radius: 12px;
            text-align: center;
            cursor: pointer;
            transition: all 0.3s;
        }
        
        .upload-area:hover {
            border-color: var(--primary);
            background: rgba(0, 212, 255, 0.05);
        }
        
        .btn {
            padding: 12px 24px;
            border-radius: 10px;
            border: none;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s;
        }
        
        .btn-primary {
            background: linear-gradient(135deg, var(--primary), var(--secondary));
            color: #fff;
        }
        
        .alert {
            background: rgba(255, 0, 110, 0.1);
            border: 1px solid var(--accent);
            color: var(--accent);
            padding: 16px;
            border-radius: 12px;
            margin-bottom: 24px;
            display: flex;
            align-items: center;
            gap: 12px;
        }
        
        .success-message {
            background: rgba(0, 245, 212, 0.1);
            border: 1px solid var(--success);
            color: var(--success);
            padding: 16px;
            border-radius: 12px;
            margin-bottom: 24px;
            text-align: center;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1><i class="fas fa-shield-alt"></i> Verifikasi Akun</h1>
            <p>Lengkapi verifikasi berikut untuk mengaktifkan akun Anda</p>
        </div>
        
        <% 
        const allApproved = platforms.every(p => p.status === 'approved');
        const hasPending = platforms.some(p => p.status === 'pending');
        %>
        
        <% if (allApproved) { %>
            <div class="success-message">
                <i class="fas fa-check-circle"></i> Selamat! Akun Anda telah terverifikasi. Redirecting...
            </div>
            <script>setTimeout(() => location.href = '/dashboard', 2000);</script>
        <% } else if (hasPending) { %>
            <div class="alert">
                <i class="fas fa-clock"></i>
                <div>
                    <strong>Menunggu Verifikasi</strong>
                    <p>Admin sedang meninjau bukti Anda. Mohon tunggu.</p>
                </div>
            </div>
        <% } %>
        
        <div class="verification-grid">
            <% platforms.forEach(p => { %>
                <div class="platform-card <%= p.status %>">
                    <div class="platform-icon" style="background: <%= p.color %>20; color: <%= p.color %>;">
                        <i class="<%= p.icon %>"></i>
                    </div>
                    <div class="platform-info">
                        <h3><%= p.name %></h3>
                        <p>
                            <% if (p.platform === 'instagram') { %>
                                Follow <strong>@<%= required.instagram.username %></strong>
                            <% } else if (p.platform === 'youtube') { %>
                                Subscribe <strong><%= required.youtube.channel %></strong>
                            <% } else { %>
                                Join Channel WhatsApp
                            <% } %>
                        </p>
                        
                        <% if (p.status === 'required') { %>
                            <form class="upload-form" onsubmit="submitProof(event, '<%= p.platform %>')">
                                <div class="upload-area" onclick="this.querySelector('input').click()">
                                    <i class="fas fa-cloud-upload-alt" style="font-size: 24px; margin-bottom: 8px; display: block;"></i>
                                    <p>Click untuk upload screenshot bukti</p>
                                    <input type="file" name="proof" accept="image/*" required style="display: none;" onchange="handleFile(this)">
                                </div>
                                <button type="submit" class="btn btn-primary" style="margin-top: 12px; width: 100%;">
                                    <i class="fas fa-paper-plane"></i> Kirim Bukti
                                </button>
                            </form>
                        <% } %>
                    </div>
                    <div class="platform-status">
                        <span class="status-badge <%= p.status %>">
                            <% if (p.status === 'approved') { %>
                                <i class="fas fa-check"></i> Terverifikasi
                            <% } else if (p.status === 'pending') { %>
                                <i class="fas fa-clock"></i> Menunggu
                            <% } else { %>
                                <i class="fas fa-times"></i> Belum
                            <% } %>
                        </span>
                    </div>
                </div>
            <% }) %>
        </div>
        
        <div style="text-align: center; margin-top: 32px;">
            <a href="/logout" style="color: rgba(255,255,255,0.5); text-decoration: none;">
                <i class="fas fa-sign-out-alt"></i> Logout
            </a>
        </div>
    </div>
    
    <script>
        function handleFile(input) {
            if (input.files && input.files[0]) {
                const area = input.closest('.upload-area');
                area.innerHTML = `
                    <i class="fas fa-image" style="font-size: 24px; margin-bottom: 8px; display: block; color: var(--success);"></i>
                    <p>${input.files[0].name}</p>
                    <small style="color: rgba(255,255,255,0.5);">Click untuk ganti</small>
                `;
                area.appendChild(input);
            }
        }
        
        async function submitProof(e, platform) {
            e.preventDefault();
            const form = e.target;
            const file = form.querySelector('input[type="file"]').files[0];
            
            if (!file) {
                alert('Pilih file terlebih dahulu!');
                return;
            }
            
            const formData = new FormData();
            formData.append('proof', file);
            formData.append('platform', platform);
            
            try {
                const res = await fetch('/verify', {
                    method: 'POST',
                    body: formData
                });
                
                const result = await res.json();
                
                if (result.success) {
                    alert('Bukti berhasil dikirim! Menunggu verifikasi admin.');
                    location.reload();
                } else {
                    alert(result.error || 'Gagal mengirim bukti');
                }
            } catch (err) {
                alert('Terjadi kesalahan. Coba lagi.');
            }
        }
    </script>
</body>
</html>
