const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DATA_DIR = '/tmp/vault-data';

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

    const config = readConfig();
    if (!config) {
      return res.status(400).json({ error: 'لم يتم تهيئة التطبيق بعد' });
    }

    // Verify password
    const hash = crypto.createHash('sha256').update(masterPassword + config.salt).digest('hex');

    if (hash !== config.hash) {
      return res.status(401).json({ error: 'كلمة المرور غير صحيحة' });
    }

    // Create token
    const token = crypto.randomBytes(32).toString('hex');

    res.status(200).json({
      success: true,
      token,
      masterPassword
    });
  } catch (error) {
    console.error('Error in /api/login:', error);
    res.status(500).json({ error: error.message || 'خطأ في الخادم' });
  }
};
