const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DATA_DIR = '/tmp/vault-data';
const VAULT_FILE = path.join(DATA_DIR, 'vault.enc');

function ensureDataDir() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch (err) {
    console.error('Failed to create data directory:', err);
  }
}

function readConfig() {
  try {
    const configPath = path.join(DATA_DIR, 'config.json');
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
    return null;
  } catch (err) {
    console.error('Error reading config:', err);
    return null;
  }
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
  } catch (err) {
    console.error('Decryption error:', err);
    return null;
  }
}

function loadVault(masterPassword) {
  try {
    if (!fs.existsSync(VAULT_FILE)) {
      return [];
    }
    const encrypted = fs.readFileSync(VAULT_FILE, 'utf8');
    const config = readConfig();
    if (!config) return [];
    const key = deriveKey(masterPassword, Buffer.from(config.salt, 'hex'));
    const decrypted = decrypt(encrypted, key);
    if (!decrypted) return null;
    return JSON.parse(decrypted);
  } catch (err) {
    console.error('Error loading vault:', err);
    return null;
  }
}

function saveVault(accounts, masterPassword) {
  try {
    ensureDataDir();
    const config = readConfig();
    if (!config) return false;
    const key = deriveKey(masterPassword, Buffer.from(config.salt, 'hex'));
    const encrypted = encrypt(JSON.stringify(accounts), key);
    fs.writeFileSync(VAULT_FILE, encrypted);
    return true;
  } catch (err) {
    console.error('Error saving vault:', err);
    return false;
  }
}

module.exports = (req, res) => {
  // تفعيل CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, X-Master-Password'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'طريقة غير مسموحة' });
  }

  try {
    const mp = req.headers['x-master-password'];

    if (!mp) {
      return res.status(401).json({ error: 'غير مصرح' });
    }

    const { accounts: importedAccounts } = req.body;

    if (!Array.isArray(importedAccounts)) {
      return res.status(400).json({ error: 'بيانات غير صالحة' });
    }

    const existing = loadVault(mp);
    if (existing === null) {
      return res.status(500).json({ error: 'فشل فك التشفير' });
    }

    const merged = [...existing];

    for (const acc of importedAccounts) {
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

    if (!saveVault(merged, mp)) {
      return res.status(500).json({ error: 'فشل في استيراد البيانات' });
    }

    res.status(200).json({
      success: true,
      count: merged.length
    });
  } catch (error) {
    console.error('Error in /api/import:', error);
    res.status(500).json({ error: error.message || 'خطأ في الخادم' });
  }
};
