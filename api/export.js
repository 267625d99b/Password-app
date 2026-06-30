const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DATA_DIR = '/tmp/vault-data';
const VAULT_FILE = path.join(DATA_DIR, 'vault.enc');

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

  try {
    const mp = req.headers['x-master-password'];

    if (!mp) {
      return res.status(401).json({ error: 'غير مصرح' });
    }

    const accounts = loadVault(mp);
    if (accounts === null) {
      return res.status(500).json({ error: 'فشل فك التشفير' });
    }

    const backup = {
      version: 1,
      exportedAt: new Date().toISOString(),
      accounts
    };

    res.status(200).json(backup);
  } catch (error) {
    console.error('Error in /api/export:', error);
    res.status(500).json({ error: error.message || 'خطأ في الخادم' });
  }
};
