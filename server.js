const express = require('express');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const crypto = require('crypto');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = 3000;
const DOWNLOAD_DIR = path.join(__dirname, 'downloads');
const CACHE_DIR = path.join(__dirname, 'yt_cache');
const DB_PATH = path.join(__dirname, 'database', 'app.db');

if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
if (!fs.existsSync(path.dirname(DB_PATH))) fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) console.error('Gagal buka database:', err);
});

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS downloads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    url TEXT NOT NULL,
    title TEXT,
    platform TEXT,
    filename TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL
  )`);
});

app.use(express.json());
app.use(express.static('public'));
app.use('/downloads', express.static(DOWNLOAD_DIR));
app.use(session({
  secret: 'rahasia-session-123',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }
}));

function isValidUrl(url) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

function isSupportedPlatform(url) {
  const lowerUrl = url.toLowerCase();
  return (
    lowerUrl.includes('youtube.com') ||
    lowerUrl.includes('youtu.be') ||
    lowerUrl.includes('tiktok.com') ||
    lowerUrl.includes('vt.tiktok.com') ||
    lowerUrl.includes('vm.tiktok.com') ||
    (lowerUrl.includes('instagram.com') && lowerUrl.includes('/reel/'))
  );
}

function detectPlatform(url) {
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes('youtube')) return 'YouTube';
  if (lowerUrl.includes('tiktok') || lowerUrl.includes('vt.tiktok') || lowerUrl.includes('vm.tiktok')) return 'TikTok';
  if (lowerUrl.includes('instagram') && lowerUrl.includes('/reel/')) return 'Instagram Reels';
  return null;
}

const YTDLP_FLAGS = [
  '--no-warnings',
  '--no-progress',
  '--restrict-filenames',
  '--quiet',
  '--cache-dir', CACHE_DIR,
  '--socket-timeout', '10',
  '--fragment-retries', '3',
  '--retries', '3'
];

// Tambahkan cookies.txt jika ada
const COOKIES_PATH = path.join(__dirname, 'cookies.txt');
if (fs.existsSync(COOKIES_PATH)) {
  YTDLP_FLAGS.push('--cookies', COOKIES_PATH);
}

function getFormatArgs(url, format) {
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes('instagram.com') && lowerUrl.includes('/reel/')) {
    return 'best[ext=mp4][height<=720]/best[ext=mp4]/best';
  } else if (lowerUrl.includes('tiktok.com') || lowerUrl.includes('vt.tiktok.com') || lowerUrl.includes('vm.tiktok.com')) {
    if (format === 'video') {
      return 'best[ext=mp4][height<=720]/best[ext=mp4]/best';
    } else if (format === 'audio') {
      return 'bestaudio/best';
    } else {
      return 'best[height<=720]/best';
    }
  } else {
    if (format === 'video') {
      return 'mp4/bestvideo[height<=480]+bestaudio/best[height<=480]/best[height<=480]';
    } else if (format === 'audio') {
      return 'bestaudio/best';
    } else {
      return 'best[height<=480]';
    }
  }
}

app.post('/metadata', (req, res) => {
  const { url } = req.body;
  if (!url || !isValidUrl(url)) {
    return res.status(400).json({
      success: false,
      error: 'URL tidak valid. Pastikan dimulai dengan https://'
    });
  }

  if (!isSupportedPlatform(url)) {
    return res.status(400).json({
      success: false,
      error: 'Hanya YouTube, TikTok, dan Instagram Reels yang didukung'
    });
  }

  const id = crypto.randomBytes(8).toString('hex');
  const outputPath = path.join(DOWNLOAD_DIR, id);

  const formatArg = getFormatArgs(url, 'thumb');
  const args = [
    '-m', 'yt_dlp',
    url,
    '--print-json',
    '--write-thumbnail',
    '--skip-download',
    '-f', formatArg,
    '-o', outputPath + '.%(ext)s'
  ].concat(YTDLP_FLAGS);

  const ytDlp = spawn('python', args, { 
    windowsHide: true,
    stdio: 'pipe'
  });

  let stdout = '', stderr = '';

  ytDlp.stdout.on('data', data => stdout += data);
  ytDlp.stderr.on('data', data => stderr += data);
  
  ytDlp.on('error', (err) => {
    console.error('❌ yt-dlp error:', err.message);
    res.json({ success: false, error: 'yt-dlp gagal. Pastikan: pip install yt-dlp' });
  });

  ytDlp.on('close', (code) => {
    if (code !== 0) {
      console.error('❌ yt-dlp failed:', stderr);
      return res.json({ success: false, error: 'Gagal ambil metadata. Cek URL valid?' });
    }

    try {
      const jsonStr = stdout.trim().split('\n')[0];
      const meta = JSON.parse(jsonStr);
      
      const metadata = {
        success: true,
        title: meta.title || '—',
        channel: meta.channel || meta.uploader || meta.owner_username || '—',
        like_count: meta.like_count ?? 'N/A',
        view_count: meta.view_count ?? 'N/A',
        platform: detectPlatform(url),
        thumbnailUrl: null
      };

      const files = fs.readdirSync(DOWNLOAD_DIR);
      const thumb = files.find(f => f.startsWith(id) && /\.(jpe?g|png|webp)$/i);
      if (thumb) metadata.thumbnailUrl = `/downloads/${thumb}`;

      // ✅ SIMPAN KE SESSION DENGAN SAVE()
      if (req.session) {
        req.session.lastTitle = metadata.title;
        req.session.lastPlatform = metadata.platform;
        
        req.session.save(err => {
          if (err) {
            console.error('Gagal menyimpan session:', err);
            res.json({ success: false, error: 'Gagal menyimpan session' });
          } else {
            res.json(metadata);
          }
        });
        return;
      }

      res.json(metadata);
    } catch (e) {
      console.error('❌ Parse error:', e.message);
      res.json({ success: false, error: 'Gagal parsing metadata' });
    }
  });
});

app.post('/download', (req, res) => {
  const { url, format = 'video' } = req.body;
  const user_id = req.session.user ? req.session.user.id : null;
  
  if (!url || !isValidUrl(url)) {
    return res.status(400).json({
      success: false,
      error: 'URL tidak valid. Pastikan dimulai dengan https://'
    });
  }

  if (!isSupportedPlatform(url)) {
    return res.status(400).json({
      success: false,
      error: 'Hanya YouTube, TikTok, dan Instagram Reels yang didukung'
    });
  }

  let responded = false;
  const sendError = (msg) => { 
    if (!responded) {
      responded = true;
      res.json({ success: false, error: msg });
    }
  };

  const id = crypto.randomBytes(8).toString('hex');
  let outputPath = path.join(DOWNLOAD_DIR, id);
  let args = [];

  const formatArg = getFormatArgs(url, format);
  if (format === 'audio') {
    outputPath += '.mp4';
    args = [
      '-m', 'yt_dlp',
      url,
      '-f', formatArg,
      '-o', outputPath
    ].concat(YTDLP_FLAGS);
  } else if (format === 'thumb') {
    args = [
      '-m', 'yt_dlp',
      url,
      '--write-thumbnail',
      '--skip-download',
      '-f', formatArg,
      '-o', outputPath + '.%(ext)s'
    ].concat(YTDLP_FLAGS);
  } else {
    args = [
      '-m', 'yt_dlp',
      url,
      '-f', formatArg,
      '--merge-output-format', 'mp4',
      '-o', outputPath + '.%(ext)s'
    ].concat(YTDLP_FLAGS);
  }

  const ytDlp = spawn('python', args, { 
    windowsHide: true,
    stdio: 'pipe'
  });
  
  ytDlp.on('error', () => sendError('yt-dlp gagal'));
  
  ytDlp.on('close', (code) => {
    if (responded) return;
    if (code !== 0) return sendError('Download gagal');

    const files = fs.readdirSync(DOWNLOAD_DIR);
    const file = files.filter(f => f.startsWith(id) && !f.endsWith('.part'))[0];
    if (!file) return sendError('File tidak ditemukan');

    // ✅ AMBIL DARI SESSION
    const savedTitle = req.session.lastTitle || '—';
    const savedPlatform = req.session.lastPlatform || detectPlatform(url);

    if (user_id) {
      db.run(`INSERT INTO downloads (user_id, url, title, platform, filename) VALUES (?, ?, ?, ?, ?)`,
        [user_id, url, savedTitle, savedPlatform, file], (err) => {
          if (err) console.error('Gagal simpan history:', err);
        });
    }

    const tempPath = path.join(DOWNLOAD_DIR, file);
    if (format === 'audio') {
      const mp3Path = path.join(DOWNLOAD_DIR, id + '.mp3');
      const ffmpeg = spawn('ffmpeg', [
        '-i', tempPath,
        '-b:a', '128k',
        '-f', 'mp3',
        '-preset', 'fast',
        mp3Path
      ], { 
        windowsHide: true,
        stdio: 'pipe'
      });

      ffmpeg.on('error', () => sendError('FFmpeg gagal'));
      ffmpeg.on('close', (code) => {
        if (code === 0) {
          fs.unlinkSync(tempPath);
          if (user_id) {
            db.run(`UPDATE downloads SET filename = ? WHERE filename = ?`, [id + '.mp3', file]);
          }
          res.json({ success: true, fileName: id + '.mp3', filePath: `/downloads/${id}.mp3` });
        } else {
          sendError('Konversi audio gagal');
        }
      });
    } else {
      res.json({ success: true, fileName: file, filePath: `/downloads/${file}` });
    }
  });
});

app.post('/api/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.json({ success: false, error: 'Username dan password wajib diisi' });

  db.get(`SELECT * FROM users WHERE username = ?`, [username], (err, row) => {
    if (row) return res.json({ success: false, error: 'Username sudah terdaftar' });
    db.run(`INSERT INTO users (username, password) VALUES (?, ?)`, [username, password], function(err) {
      if (err) return res.json({ success: false, error: 'Gagal daftar' });
      req.session.user = { id: this.lastID, username };
      res.json({ success: true });
    });
  });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  db.get(`SELECT * FROM users WHERE username = ? AND password = ?`, [username, password], (err, row) => {
    if (row) {
      req.session.user = { id: row.id, username: row.username };
      res.json({ success: true });
    } else {
      res.json({ success: false, error: 'Username atau password salah' });
    }
  });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

app.get('/api/user', (req, res) => {
  res.json({ user: req.session.user ? req.session.user.username : null });
});

app.get('/api/history', (req, res) => {
  if (!req.session.user) return res.json([]);
  db.all(`SELECT * FROM downloads WHERE user_id = ? ORDER BY timestamp DESC`, [req.session.user.id], (err, rows) => {
    res.json(rows);
  });
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/auth', (req, res) => res.sendFile(path.join(__dirname, 'public', 'auth.html')));

app.listen(PORT, () => {
  console.log(`✅ Server jalan di http://localhost:${PORT}`);
  console.log(`📁 Cache: ${CACHE_DIR}`);
  console.log(`✅ RIWAYAT FIX: Thumbnail kecil, judul benar, platform terdeteksi`);
});
