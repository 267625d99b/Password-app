const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const HOST = '0.0.0.0';
const DATA_DIR = path.join(__dirname, 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const VAULT_FILE = path.join(DATA_DIR, 'vault.enc');

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function readConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch { return null; }
}

function writeConfig(c) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(c, null, 2));
}

function deriveKey(masterPassword, salt) {
  return crypto.pbkdf2Sync(masterPassword, salt, 600000, 32, 'sha256');
}

function encrypt(text, key) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return JSON.stringify({ iv: iv.toString('hex'), data: encrypted, tag: authTag });
}

function decrypt(encryptedStr, key) {
  try {
    const { iv, data, tag } = JSON.parse(encryptedStr);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(tag, 'hex'));
    let decrypted = decipher.update(data, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch { return null; }
}

function loadVault(masterPassword) {
  if (!fs.existsSync(VAULT_FILE)) return [];
  const encrypted = fs.readFileSync(VAULT_FILE, 'utf8');
  const config = readConfig();
  if (!config) return [];
  const key = deriveKey(masterPassword, Buffer.from(config.salt, 'hex'));
  const decrypted = decrypt(encrypted, key);
  if (!decrypted) return null;
  return JSON.parse(decrypted);
}

function saveVault(accounts, masterPassword) {
  const config = readConfig();
  if (!config) return false;
  const key = deriveKey(masterPassword, Buffer.from(config.salt, 'hex'));
  const encrypted = encrypt(JSON.stringify(accounts), key);
  fs.writeFileSync(VAULT_FILE, encrypted);
  return true;
}

app.post('/api/init', (req, res) => {
  const { masterPassword } = req.body;
  if (!masterPassword || masterPassword.length < 4) {
    return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 4 أحرف على الأقل' });
  }
  if (readConfig()) {
    return res.status(400).json({ error: 'تمت التهيئة مسبقًا' });
  }
  const salt = crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(masterPassword + salt).digest('hex');
  writeConfig({ salt, hash, createdAt: new Date().toISOString() });
  const key = deriveKey(masterPassword, Buffer.from(salt, 'hex'));
  saveVault([], masterPassword);
  const token = crypto.randomBytes(32).toString('hex');
  res.json({ success: true, token });
});

app.post('/api/login', (req, res) => {
  const { masterPassword } = req.body;
  const config = readConfig();
  if (!config) return res.status(400).json({ error: 'لم يتم تهيئة التطبيق بعد' });
  const hash = crypto.createHash('sha256').update(masterPassword + config.salt).digest('hex');
  if (hash !== config.hash) return res.status(401).json({ error: 'كلمة المرور غير صحيحة' });
  const token = crypto.randomBytes(32).toString('hex');
  res.json({ success: true, token, masterPassword });
});

app.get('/api/check', (req, res) => {
  res.json({ initialized: readConfig() !== null });
});

app.get('/api/accounts', (req, res) => {
  const mp = req.headers['x-master-password'];
  if (!mp) return res.status(401).json({ error: 'غير مصرح' });
  const accounts = loadVault(mp);
  if (accounts === null) return res.status(500).json({ error: 'فشل فك التشفير' });
  res.json(accounts);
});

app.post('/api/accounts', (req, res) => {
  const mp = req.headers['x-master-password'];
  if (!mp) return res.status(401).json({ error: 'غير مصرح' });
  const accounts = loadVault(mp);
  if (accounts === null) return res.status(500).json({ error: 'فشل فك التشفير' });
  const { category, email, username, password, notes } = req.body;
  const account = {
    id: crypto.randomUUID(),
    category: category || 'أخرى',
    email: email || '',
    username: username || '',
    password: password || '',
    notes: notes || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  accounts.push(account);
  saveVault(accounts, mp);
  res.json(account);
});

app.put('/api/accounts/:id', (req, res) => {
  const mp = req.headers['x-master-password'];
  if (!mp) return res.status(401).json({ error: 'غير مصرح' });
  const accounts = loadVault(mp);
  if (accounts === null) return res.status(500).json({ error: 'فشل فك التشفير' });
  const idx = accounts.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'غير موجود' });
  const { category, email, username, password, notes } = req.body;
  accounts[idx] = { ...accounts[idx], category, email, username, password, notes, updatedAt: new Date().toISOString() };
  saveVault(accounts, mp);
  res.json(accounts[idx]);
});

app.delete('/api/accounts/:id', (req, res) => {
  const mp = req.headers['x-master-password'];
  if (!mp) return res.status(401).json({ error: 'غير مصرح' });
  const accounts = loadVault(mp);
  if (accounts === null) return res.status(500).json({ error: 'فشل فك التشفير' });
  const idx = accounts.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'غير موجود' });
  accounts.splice(idx, 1);
  saveVault(accounts, mp);
  res.json({ success: true });
});

app.get('/api/export', (req, res) => {
  const mp = req.headers['x-master-password'];
  if (!mp) return res.status(401).json({ error: 'غير مصرح' });
  const accounts = loadVault(mp);
  if (accounts === null) return res.status(500).json({ error: 'فشل فك التشفير' });
  const backup = { version: 1, exportedAt: new Date().toISOString(), accounts };
  res.json(backup);
});

app.post('/api/import', (req, res) => {
  const mp = req.headers['x-master-password'];
  if (!mp) return res.status(401).json({ error: 'غير مصرح' });
  const { accounts } = req.body;
  if (!Array.isArray(accounts)) return res.status(400).json({ error: 'بيانات غير صالحة' });
  const existing = loadVault(mp);
  if (existing === null) return res.status(500).json({ error: 'فشل فك التشفير' });
  const merged = [...existing];
  for (const acc of accounts) {
    merged.push({
      id: crypto.randomUUID(),
      category: acc.category || 'أخرى',
      email: acc.email || '',
      username: acc.username || '',
      password: acc.password || '',
      notes: acc.notes || '',
      createdAt: acc.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }
  saveVault(merged, mp);
  res.json({ success: true, count: merged.length });
});

function getLocalIP() {
  const os = require('os');
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return 'localhost';
}

app.listen(PORT, HOST, () => {
  const ip = getLocalIP();
  console.log(`✅ Password Manager`);
  console.log(`   محلي:     http://localhost:${PORT}`);
  console.log(`   شبكة:     http://${ip}:${PORT}`);
  console.log(`   افتح الرابط من جوالك على نفس الشبكة`);
});
