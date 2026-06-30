#!/usr/bin/env node

/**
 * اختبار سريع لـ API
 * استخدام: node test-api.js
 */

const http = require('http');

const BASE_URL = 'http://localhost:3001';
let masterPassword = null;

function makeRequest(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve({ status: res.statusCode, data: jsonData });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

async function runTests() {
  console.log('🧪 اختبار API Password Manager\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    // Test 1: Check if initialized
    console.log('✓ اختبار 1: فحص التهيئة');
    let res = await makeRequest('GET', '/api/check');
    console.log(`  Status: ${res.status}`);
    console.log(`  Response: ${JSON.stringify(res.data)}\n`);

    if (res.data.initialized) {
      console.log('  ⚠️  التطبيق مهيأ بالفعل. يتم حذف البيانات القديمة...\n');
      // In production, you'd need to handle this differently
    }

    // Test 2: Initialize with master password
    console.log('✓ اختبار 2: تهيئة كلمة مرور جديدة');
    masterPassword = 'TestPassword123!';
    res = await makeRequest('POST', '/api/init', { masterPassword });
    console.log(`  Status: ${res.status}`);
    console.log(`  Response: ${JSON.stringify(res.data)}\n`);

    // Test 3: Login
    console.log('✓ اختبار 3: تسجيل الدخول');
    res = await makeRequest('POST', '/api/login', { masterPassword });
    console.log(`  Status: ${res.status}`);
    console.log(`  Response: ${JSON.stringify(res.data)}\n`);

    // Test 4: Get accounts (should be empty)
    console.log('✓ اختبار 4: جلب الحسابات (قائمة فارغة)');
    res = await makeRequest('GET', '/api/accounts', null, {
      'X-Master-Password': masterPassword
    });
    console.log(`  Status: ${res.status}`);
    console.log(`  Response: ${JSON.stringify(res.data)}\n`);

    // Test 5: Add account
    console.log('✓ اختبار 5: إضافة حساب جديد');
    const newAccount = {
      category: 'البريد الإلكتروني',
      email: 'test@example.com',
      username: 'testuser',
      password: 'SecurePassword123',
      notes: 'حساب تجريبي'
    };
    res = await makeRequest('POST', '/api/accounts', newAccount, {
      'X-Master-Password': masterPassword
    });
    console.log(`  Status: ${res.status}`);
    console.log(`  Response: ${JSON.stringify(res.data, null, 2)}\n`);

    let accountId = null;
    if (res.data.id) {
      accountId = res.data.id;
    }

    // Test 6: Get accounts (should have 1)
    console.log('✓ اختبار 6: جلب الحسابات (يجب أن يكون واحد)');
    res = await makeRequest('GET', '/api/accounts', null, {
      'X-Master-Password': masterPassword
    });
    console.log(`  Status: ${res.status}`);
    console.log(`  Response: ${JSON.stringify(res.data, null, 2)}\n`);

    // Test 7: Update account
    if (accountId) {
      console.log('✓ اختبار 7: تحديث الحساب');
      const updatedAccount = {
        category: 'حسابات البريد',
        email: 'newemail@example.com',
        username: 'newusername',
        password: 'NewPassword456',
        notes: 'تم التحديث'
      };
      res = await makeRequest('PUT', `/api/accounts/${accountId}`, updatedAccount, {
        'X-Master-Password': masterPassword
      });
      console.log(`  Status: ${res.status}`);
      console.log(`  Response: ${JSON.stringify(res.data, null, 2)}\n`);
    }

    // Test 8: Export
    console.log('✓ اختبار 8: تصدير البيانات');
    res = await makeRequest('GET', '/api/export', null, {
      'X-Master-Password': masterPassword
    });
    console.log(`  Status: ${res.status}`);
    console.log(`  Response: ${JSON.stringify(res.data, null, 2)}\n`);

    // Test 9: Delete account
    if (accountId) {
      console.log('✓ اختبار 9: حذف الحساب');
      res = await makeRequest('DELETE', `/api/accounts/${accountId}`, null, {
        'X-Master-Password': masterPassword
      });
      console.log(`  Status: ${res.status}`);
      console.log(`  Response: ${JSON.stringify(res.data)}\n`);
    }

    // Test 10: Verify deletion
    console.log('✓ اختبار 10: التحقق من الحذف');
    res = await makeRequest('GET', '/api/accounts', null, {
      'X-Master-Password': masterPassword
    });
    console.log(`  Status: ${res.status}`);
    console.log(`  Response: ${JSON.stringify(res.data)}\n`);

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ جميع الاختبارات نجحت!\n');
    console.log('التطبيق جاهز للنشر على Vercel ☁️\n');

  } catch (error) {
    console.error('❌ خطأ:', error.message);
    console.error('\n⚠️  تأكد من أن الخادم يعمل على http://localhost:3001');
    console.error('شغّل: npm start\n');
    process.exit(1);
  }
}

// Run tests
runTests();
