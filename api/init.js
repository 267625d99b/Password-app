const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DATA_DIR = '/tmp/vault-data';

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

function writeConfig(config) {
  try {
    ensureDataDir();
    const configPath = path.join(DATA_DIR, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch (err) {
    console.error('Error writing config:', err);
    throw new Error('فشل في حفظ الإعدادات');
  }
}

// Parse JSON body
async function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch (e) {
        reject(e);
      }
    });
  });
}

module.exports = async (req, res) => {
  // CORS headers
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
    let body = req.body;
    
    // If body is a string, parse it
    if (typeof body === 'string') {
      body = JSON.parse(body);
    }
    
    // If body is undefined, try to parse from stream
    if (!body) {
      body = await parseBody(req);
    }

    const { masterPassword } = body;

    if (!masterPassword || masterPassword.length < 4) {
      return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 4 أحرف على الأقل' });
    }

    // Check if already initialized
    if (readConfig() !== null) {
      return res.status(400).json({ error: 'تمت التهيئة مسبقًا' });
    }

    // Create salt and hash
    const salt = crypto.randomBytes(32).toString('hex');
    const hash = crypto.createHash('sha256').update(masterPassword + salt).digest('hex');

    // Save config
    writeConfig({
      salt,
      hash,
      createdAt: new Date().toISOString()
    });

    // Create token
    const token = crypto.randomBytes(32).toString('hex');

    res.status(200).json({
      success: true,
      token,
      message: 'تمت التهيئة بنجاح'
    });
  } catch (error) {
    console.error('Error in /api/init:', error);
    res.status(500).json({ error: error.message || 'خطأ في الخادم' });
  }
};
