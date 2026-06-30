/* ============================
   PASSWORD MANAGER - APP LOGIC
   ============================ */
let masterPassword = '';
let currentAccountId = null;
let viewAccountId = null;
let selectedCategory = 'all';
let allAccounts = [];
let confirmCallback = null;

// ============ MASTER PASSWORD ============
async function checkInit() {
  try {
    const res = await fetch('/api/check');
    const data = await res.json();
    return data.initialized;
  } catch { return false; }
}

async function handleMasterAction() {
  const input = document.getElementById('masterPasswordInput');
  const error = document.getElementById('masterError');
  const btn = document.getElementById('masterActionBtn');
  const loading = document.getElementById('masterLoading');
  const pw = input.value.trim();

  if (!pw) { error.textContent = 'يرجى إدخال كلمة المرور'; return; }
  error.textContent = '';
  btn.style.display = 'none';
  loading.style.display = 'block';

  const initialized = await checkInit();
  let res;
  try {
    if (initialized) {
      res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ masterPassword: pw })
      });
    } else {
      res = await fetch('/api/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ masterPassword: pw })
      });
    }
    const data = await res.json();
    if (!res.ok) {
      error.textContent = data.error;
      btn.style.display = 'block';
      loading.style.display = 'none';
      return;
    }
    masterPassword = pw;
    sessionStorage.setItem('pwm_session', pw);
    document.getElementById('masterScreen').style.display = 'none';
    document.getElementById('app').style.display = 'block';
    initApp();
  } catch (e) {
    error.textContent = 'حدث خطأ في الاتصال';
    btn.style.display = 'block';
    loading.style.display = 'none';
  }
}

function toggleMasterVisibility() {
  const input = document.getElementById('masterPasswordInput');
  const icon = document.getElementById('masterEyeIcon');
  if (input.type === 'password') {
    input.type = 'text';
    icon.innerHTML = '<path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22"></path>';
  } else {
    input.type = 'password';
    icon.innerHTML = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>';
  }
}

// ============ INIT ============
async function initApp() {
  const initialized = await checkInit();
  if (!initialized) {
    document.getElementById('masterScreen').style.display = 'flex';
    document.getElementById('app').style.display = 'none';
    document.getElementById('masterTitle').textContent = 'إنشاء كلمة المرور الرئيسية';
    document.getElementById('masterSubtitle').textContent = 'اختر كلمة مرور قوية لحماية حساباتك';
    document.getElementById('masterActionBtn').textContent = 'إنشاء';
    return;
  }
  await loadAccounts();
  renderCategories();
  filterAccounts();
  applyTheme();
}

// ============ ACCOUNTS ============
async function loadAccounts() {
  try {
    const res = await fetch('/api/accounts', {
      headers: { 'x-master-password': masterPassword }
    });
    if (!res.ok) throw new Error('فشل التحميل');
    allAccounts = await res.json();
  } catch {
    showToast('فشل تحميل الحسابات');
    allAccounts = [];
  }
}

async function saveAccount() {
  const category = document.getElementById('accountCategory').value;
  const email = document.getElementById('accountEmail').value.trim();
  const username = document.getElementById('accountUsername').value.trim();
  const password = document.getElementById('accountPassword').value;
  const notes = document.getElementById('accountNotes').value.trim();

  if (!email && !username) {
    showToast('يرجى إدخال البريد الإلكتروني أو اسم المستخدم');
    return;
  }
  if (!password) {
    showToast('يرجى إدخال كلمة المرور');
    return;
  }

  const body = { category, email, username, password, notes };
  const isEdit = currentAccountId !== null;

  try {
    let res;
    if (isEdit) {
      res = await fetch(`/api/accounts/${currentAccountId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-master-password': masterPassword },
        body: JSON.stringify(body)
      });
    } else {
      res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-master-password': masterPassword },
        body: JSON.stringify(body)
      });
    }
    if (!res.ok) throw new Error('فشل الحفظ');
    await loadAccounts();
    filterAccounts();
    closeModal();
    showToast(isEdit ? 'تم التحديث' : 'تمت الإضافة');
  } catch {
    showToast('حدث خطأ أثناء الحفظ');
  }
}

async function deleteAccount(id) {
  showConfirmModal(
    'حذف الحساب',
    'هل أنت متأكد من حذف هذا الحساب؟ لا يمكن التراجع عن هذا الإجراء.',
    async () => {
      try {
        const res = await fetch(`/api/accounts/${id}`, {
          method: 'DELETE',
          headers: { 'x-master-password': masterPassword }
        });
        if (!res.ok) throw new Error('فشل الحذف');
        await loadAccounts();
        filterAccounts();
        showToast('تم الحذف');
      } catch {
        showToast('حدث خطأ أثناء الحذف');
      }
    },
    true
  );
}

// ============ RENDER ============
function renderCategories() {
  const cats = new Set(allAccounts.map(a => a.category));
  const container = document.getElementById('categoriesContainer');
  container.innerHTML = '<button class="category-chip active" data-category="all" onclick="selectCategory(\'all\', this)">الكل</button>';
  for (const cat of ['جوجل', 'فيسبوك', 'تويتر', 'ديسكورد', 'جيت هب', 'لينكد إن', 'أخرى']) {
    if (cats.has(cat)) {
      const btn = document.createElement('button');
      btn.className = 'category-chip';
      btn.dataset.category = cat;
      btn.textContent = cat;
      btn.onclick = function() { selectCategory(cat, this); };
      container.appendChild(btn);
    }
  }
}

function selectCategory(cat, btn) {
  selectedCategory = cat;
  document.querySelectorAll('.category-chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  filterAccounts();
}

function getSortValue() {
  return document.getElementById('sortSelect').value;
}

function filterAccounts() {
  const q = document.getElementById('searchInput').value.trim().toLowerCase();
  const sort = getSortValue();
  let filtered = allAccounts;
  if (selectedCategory !== 'all') {
    filtered = filtered.filter(a => a.category === selectedCategory);
  }
  if (q) {
    filtered = filtered.filter(a =>
      (a.email && a.email.toLowerCase().includes(q)) ||
      (a.username && a.username.toLowerCase().includes(q)) ||
      (a.category && a.category.toLowerCase().includes(q))
    );
  }
  // Sort
  filtered.sort((a, b) => {
    const nameA = (a.email || a.username || '').toLowerCase();
    const nameB = (b.email || b.username || '').toLowerCase();
    switch (sort) {
      case 'alpha-asc': return nameA.localeCompare(nameB);
      case 'alpha-desc': return nameB.localeCompare(nameA);
      case 'date-desc': return new Date(b.createdAt) - new Date(a.createdAt);
      case 'date-asc': return new Date(a.createdAt) - new Date(b.createdAt);
      default: return 0;
    }
  });
  renderAccounts(filtered);
}

function renderAccounts(accounts) {
  const grid = document.getElementById('accountsGrid');
  const count = document.getElementById('accountsCount');
  count.textContent = `${accounts.length} حساب`;

  if (accounts.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="#9aa0a6" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
          <path d="M7 11V7a5 5 0 0110 0v4"></path>
        </svg>
        <h3>لا توجد نتائج</h3>
        <p>لم يتم العثور على حسابات مطابقة</p>
      </div>`;
    return;
  }

  // Group by category
  const grouped = {};
  for (const a of accounts) {
    const cat = a.category || 'أخرى';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(a);
  }

  const categoryOrder = ['جوجل', 'فيسبوك', 'تويتر', 'ديسكورد', 'جيت هب', 'لينكد إن', 'أخرى'];
  const sortedGroups = Object.keys(grouped).sort((a, b) => {
    const ia = categoryOrder.indexOf(a);
    const ib = categoryOrder.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  let html = '';
  for (const cat of sortedGroups) {
    const items = grouped[cat];
    const cls = getCategoryClass(cat);
    const icon = getCategoryIcon(cat);
    html += `
      <div class="group-header">
        <div class="group-header-icon ${cls}">${icon}</div>
        <span class="group-header-title">${escapeHtml(cat)}</span>
        <span class="group-header-count">${items.length}</span>
      </div>`;
    for (const a of items) {
      html += renderAccountCard(a);
    }
  }
  grid.innerHTML = html;
}

function renderAccountCard(a) {
  const catClass = getCategoryClass(a.category);
  const catIcon = getCategoryIcon(a.category);
  const displayName = a.email || a.username || 'بدون اسم';
  const subtitle = a.email && a.username ? a.username : '';

  return `
    <div class="account-card" id="account-${a.id}" onclick="showViewModal('${a.id}')">
      <div class="account-card-header">
        <div class="account-icon ${catClass}">${catIcon}</div>
        <div class="account-info">
          <div class="account-title">${escapeHtml(displayName)}</div>
          ${subtitle ? `<div class="account-subtitle">${escapeHtml(subtitle)}</div>` : ''}
        </div>
        <span class="account-category-badge">${escapeHtml(a.category)}</span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--text-tertiary);flex-shrink:0;">
          <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
      </div>
    </div>`;
}

// ============ VIEW MODAL ============
function showViewModal(id) {
  viewAccountId = id;
  const a = allAccounts.find(acc => acc.id === id);
  if (!a) return;

  const cls = getCategoryClass(a.category);
  const icon = getCategoryIcon(a.category);
  const displayName = a.email || a.username || 'بدون اسم';

  document.getElementById('viewIcon').className = `view-icon ${cls}`;
  document.getElementById('viewIcon').textContent = icon;
  document.getElementById('viewModalTitle').textContent = displayName;
  document.getElementById('viewCategory').textContent = a.category;

  let bodyHtml = '';

  if (a.email) {
    bodyHtml += `
      <div class="view-detail-row">
        <span class="view-detail-label">البريد الإلكتروني</span>
        <div class="view-detail-value-wrap">
          <span class="view-detail-value" dir="ltr">${escapeHtml(a.email)}</span>
          <button class="view-copy-btn" onclick="copyViewField('${escapeHtml(a.email)}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"></path></svg>
            نسخ
          </button>
        </div>
      </div>`;
  }

  if (a.username) {
    bodyHtml += `
      <div class="view-detail-row">
        <span class="view-detail-label">اسم المستخدم</span>
        <div class="view-detail-value-wrap">
          <span class="view-detail-value" dir="ltr">${escapeHtml(a.username)}</span>
          <button class="view-copy-btn" onclick="copyViewField('${escapeHtml(a.username)}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"></path></svg>
            نسخ
          </button>
        </div>
      </div>`;
  }

  bodyHtml += `
    <div class="view-detail-row">
      <span class="view-detail-label">كلمة المرور</span>
      <div class="view-detail-value-wrap">
        <span class="view-detail-value password-hidden" id="viewPwdValue">••••••••</span>
        <div style="display:flex;gap:4px;flex-shrink:0;">
          <button class="view-copy-btn" onclick="toggleViewPassword()">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
            إظهار
          </button>
          <button class="view-copy-btn" onclick="copyViewField('${escapeHtml(a.password)}')" id="viewCopyPwdBtn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"></path></svg>
            نسخ
          </button>
        </div>
      </div>
    </div>`;

  if (a.notes) {
    bodyHtml += `
      <div class="view-detail-row">
        <span class="view-detail-label">ملاحظات</span>
        <div class="view-notes-text">${escapeHtml(a.notes)}</div>
      </div>`;
  }

  bodyHtml += `
    <div class="view-meta">
      <span>تم الإنشاء: ${new Date(a.createdAt).toLocaleDateString('ar-SA')}</span>
      <span>آخر تعديل: ${new Date(a.updatedAt).toLocaleDateString('ar-SA')}</span>
    </div>`;

  document.getElementById('viewModalBody').innerHTML = bodyHtml;
  document.getElementById('viewModal').style.display = 'flex';
}

function toggleViewPassword() {
  const span = document.getElementById('viewPwdValue');
  const a = allAccounts.find(acc => acc.id === viewAccountId);
  if (!a) return;
  if (span.classList.contains('password-hidden')) {
    span.textContent = a.password;
    span.classList.remove('password-hidden');
  } else {
    span.textContent = '••••••••';
    span.classList.add('password-hidden');
  }
}

function copyViewField(text) {
  copyToClipboard(text);
}

function editAccountFromView() {
  const id = viewAccountId;
  if (id) {
    closeViewModal();
    editAccount(id);
  }
}

function deleteAccountFromView() {
  const id = viewAccountId;
  if (id) {
    closeViewModal();
    deleteAccount(id);
  }
}

function closeViewModal() {
  document.getElementById('viewModal').style.display = 'none';
  viewAccountId = null;
}

function closeViewModalOnOverlay(event) {
  if (event.target === event.currentTarget) closeViewModal();
}

// ============ MODAL ============
function showAddModal() {
  currentAccountId = null;
  document.getElementById('modalTitle').textContent = 'إضافة حساب جديد';
  document.getElementById('saveAccountBtn').textContent = 'حفظ';
  document.getElementById('accountEmail').value = '';
  document.getElementById('accountUsername').value = '';
  document.getElementById('accountPassword').value = '';
  document.getElementById('accountNotes').value = '';
  document.getElementById('accountCategory').value = 'جوجل';
  document.querySelectorAll('.category-option').forEach(c => c.classList.remove('selected'));
  document.querySelector('.category-option[data-category="جوجل"]')?.classList.add('selected');
  document.getElementById('accountModal').style.display = 'flex';
}

function editAccount(id, event) {
  if (event) event.stopPropagation();
  const account = allAccounts.find(a => a.id === id);
  if (!account) return;
  currentAccountId = id;
  document.getElementById('modalTitle').textContent = 'تعديل الحساب';
  document.getElementById('saveAccountBtn').textContent = 'تحديث';
  document.getElementById('accountEmail').value = account.email || '';
  document.getElementById('accountUsername').value = account.username || '';
  document.getElementById('accountPassword').value = account.password || '';
  document.getElementById('accountNotes').value = account.notes || '';
  document.getElementById('accountCategory').value = account.category;
  document.querySelectorAll('.category-option').forEach(c => c.classList.remove('selected'));
  const sel = document.querySelector(`.category-option[data-category="${account.category}"]`);
  if (sel) sel.classList.add('selected');
  document.getElementById('accountModal').style.display = 'flex';
}

function closeModal() {
  document.getElementById('accountModal').style.display = 'none';
  currentAccountId = null;
}

function closeModalOnOverlay(event) {
  if (event.target === event.currentTarget) closeModal();
}

function selectCategoryOption(btn) {
  document.querySelectorAll('.category-option').forEach(c => c.classList.remove('selected'));
  btn.classList.add('selected');
  document.getElementById('accountCategory').value = btn.dataset.category;
}

function toggleFieldVisibility(id) {
  const input = document.getElementById(id);
  input.type = input.type === 'password' ? 'text' : 'password';
}

// ============ PASSWORD GENERATOR ============
function generatePassword() {
  document.getElementById('passwordGenerator').style.display = 'flex';
  updateGeneratedPassword();
}

function hidePasswordGenerator() {
  document.getElementById('passwordGenerator').style.display = 'none';
}

function updateGeneratedPassword() {
  const len = parseInt(document.getElementById('pwdLength').value);
  const useUpper = document.getElementById('pwdUpper').checked;
  const useLower = document.getElementById('pwdLower').checked;
  const useNumbers = document.getElementById('pwdNumbers').checked;
  const useSymbols = document.getElementById('pwdSymbols').checked;

  document.getElementById('pwdLengthLabel').textContent = len;

  let chars = '';
  if (useUpper) chars += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  if (useLower) chars += 'abcdefghijklmnopqrstuvwxyz';
  if (useNumbers) chars += '0123456789';
  if (useSymbols) chars += '!@#$%^&*()_+-=[]{}|;:,.<>?';

  if (!chars) {
    document.getElementById('generatedPassword').textContent = 'اختر خيارًا واحدًا على الأقل';
    return;
  }

  // Ensure at least one of each selected type
  let pwd = '';
  if (useUpper) pwd += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[cryptoRandomInt(26)];
  if (useLower) pwd += 'abcdefghijklmnopqrstuvwxyz'[cryptoRandomInt(26)];
  if (useNumbers) pwd += '0123456789'[cryptoRandomInt(10)];
  if (useSymbols) pwd += '!@#$%^&*()_+-=[]{}|;:,.<>?'[cryptoRandomInt(24)];

  for (let i = pwd.length; i < len; i++) {
    pwd += chars[cryptoRandomInt(chars.length)];
  }

  // Shuffle
  pwd = pwd.split('').sort(() => Math.random() - 0.5).join('');
  document.getElementById('generatedPassword').textContent = pwd;
}

function cryptoRandomInt(max) {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return arr[0] % max;
}

function copyGeneratedPassword() {
  const pwd = document.getElementById('generatedPassword').textContent;
  copyToClipboard(pwd);
  showToast('تم النسخ ✅');
}

function useGeneratedPassword() {
  const pwd = document.getElementById('generatedPassword').textContent;
  document.getElementById('accountPassword').value = pwd;
  document.getElementById('accountPassword').type = 'text';
  hidePasswordGenerator();
  showToast('تم استخدام كلمة المرور');
}

// ============ CLIPBOARD ============
function copyToClipboard(text, event) {
  if (event) event.stopPropagation();

  // Modern Clipboard API
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showToast('تم النسخ');
    }).catch(() => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '-9999px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    if (ok) { showToast('تم النسخ'); return; }
  } catch {}
  // Mobile last resort: show text in a popup for manual copy
  try {
    const div = document.createElement('div');
    div.id = 'mobileCopyOverlay';
    div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;';
    div.onclick = function(e) { if (e.target === this) document.body.removeChild(this); };
    const box = document.createElement('div');
    box.style.cssText = 'background:white;border-radius:16px;padding:24px;width:100%;max-width:360px;direction:rtl;text-align:center;';
    const title = document.createElement('p');
    title.textContent = 'انسخ النص يدويًا';
    title.style.cssText = 'font-size:16px;font-weight:500;color:#1f1f1f;margin-bottom:12px;font-family:sans-serif;';
    const inp = document.createElement('input');
    inp.value = text;
    inp.style.cssText = 'width:100%;padding:12px;border:1px solid #dadce0;border-radius:8px;font-size:16px;text-align:start;direction:ltr;outline:none;color:#1f1f1f;background:#f8f9fa;margin-bottom:16px;';
    inp.readOnly = true;
    inp.onclick = function() { this.select(); this.setSelectionRange(0, this.value.length); };
    const btn = document.createElement('button');
    btn.textContent = 'إغلاق';
    btn.style.cssText = 'padding:10px 24px;border:none;border-radius:100px;background:#0b57d0;color:white;font-size:14px;font-weight:500;cursor:pointer;font-family:sans-serif;';
    btn.onclick = function() { document.body.removeChild(div); };
    box.appendChild(title);
    box.appendChild(inp);
    box.appendChild(btn);
    div.appendChild(box);
    document.body.appendChild(div);
    setTimeout(() => inp.select(), 100);
  } catch {
    showToast('تعذر النسخ');
  }
}

// ============ TOAST ============
let toastTimeout;

function checkIcon() {
  return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#34a853" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:4px;"><polyline points="20 6 9 17 4 12"></polyline></svg>';
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.innerHTML = msg + checkIcon();
  toast.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove('show'), 2500);
}

// ============ SETTINGS ============
function showSettings() {
  document.getElementById('settingsModal').style.display = 'flex';
  document.getElementById('darkModeToggle').checked = localStorage.getItem('theme') === 'dark';
}

function closeSettings() {
  document.getElementById('settingsModal').style.display = 'none';
}

function lockApp() {
  showConfirmModal(
    'قفل التطبيق',
    'هل تريد قفل التطبيق؟ سيتم قفل جميع البيانات حتى إدخال كلمة المرور الرئيسية.',
    () => {
      masterPassword = '';
      allAccounts = [];
      sessionStorage.removeItem('pwm_session');
      document.getElementById('app').style.display = 'none';
      document.getElementById('masterScreen').style.display = 'flex';
      document.getElementById('masterPasswordInput').value = '';
      document.getElementById('masterTitle').textContent = 'فتح الخزنة';
      document.getElementById('masterSubtitle').textContent = 'أدخل كلمة المرور الرئيسية';
      document.getElementById('masterActionBtn').textContent = 'فتح';
      document.getElementById('settingsModal').style.display = 'none';
    },
    true
  );
}

// ============ CONFIRM MODAL ============
function showConfirmModal(title, message, callback, isDanger) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMessage').textContent = message;
  confirmCallback = callback;
  const okBtn = document.getElementById('confirmOkBtn');
  if (isDanger) {
    okBtn.className = 'btn-primary confirm-danger';
  } else {
    okBtn.className = 'btn-primary';
  }
  document.getElementById('confirmModal').style.display = 'flex';
}

function closeConfirmModal() {
  document.getElementById('confirmModal').style.display = 'none';
  confirmCallback = null;
}

function closeConfirmModalOnOverlay(event) {
  if (event.target === event.currentTarget) closeConfirmModal();
}

function confirmAction() {
  const cb = confirmCallback;
  closeConfirmModal();
  if (typeof cb === 'function') {
    cb();
  }
}

// ============ THEME ============
function toggleTheme() {
  const current = localStorage.getItem('theme') || 'light';
  const next = current === 'light' ? 'dark' : 'light';
  localStorage.setItem('theme', next);
  applyTheme();
  const toggle = document.getElementById('darkModeToggle');
  if (toggle) toggle.checked = next === 'dark';
}

function applyTheme() {
  const theme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', theme);
  const icon = document.getElementById('themeIcon');
  if (icon) {
    if (theme === 'dark') {
      icon.innerHTML = '<circle cx="12" cy="12" r="5"></circle><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"></path>';
    } else {
      icon.innerHTML = '<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"></path>';
    }
  }
}

// ============ BACKUP ============
async function exportBackup() {
  try {
    const res = await fetch('/api/export', {
      headers: { 'x-master-password': masterPassword }
    });
    if (!res.ok) throw new Error('فشل التصدير');
    const data = await res.json();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `password-manager-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('تم التصدير');
  } catch {
    showToast('فشل التصدير');
  }
}

async function importBackup(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data.accounts || !Array.isArray(data.accounts)) {
      showToast('ملف غير صالح');
      event.target.value = '';
      return;
    }
    showConfirmModal(
      'استيراد النسخة الاحتياطية',
      `سيتم إضافة ${data.accounts.length} حساب. هل تريد المتابعة؟`,
      async () => {
        try {
          const res = await fetch('/api/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-master-password': masterPassword },
            body: JSON.stringify({ accounts: data.accounts })
          });
          if (!res.ok) throw new Error('فشل الاستيراد');
          await loadAccounts();
          filterAccounts();
          showToast('تم الاستيراد');
        } catch {
          showToast('فشل الاستيراد - تأكد من صحة الملف');
        }
      }
    );
  } catch {
    showToast('فشل قراءة الملف');
  }
  event.target.value = '';
}

// ============ PWA INSTALL ============
let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const btn = document.getElementById('installBtn');
  if (btn) btn.style.display = '';
});

function installApp() {
  const btn = document.getElementById('installBtn');
  if (deferredPrompt) {
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then((result) => {
      if (result.outcome === 'accepted') {
        if (btn) btn.style.display = 'none';
      }
      deferredPrompt = null;
    });
  } else {
    showToast('افتح القائمة ⋮ ثم اختر "تثبيت التطبيق" أو Install app');
  }
}

window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  const btn = document.getElementById('installBtn');
  if (btn) btn.style.display = 'none';
});

// Hide install button if already running as standalone PWA
if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) {
  const btn = document.getElementById('installBtn');
  if (btn) btn.style.display = 'none';
}

// ============ HELPERS ============
function getCategoryClass(cat) {
  const map = { 'جوجل': 'g', 'فيسبوك': 'f', 'تويتر': 't', 'ديسكورد': 'd', 'جيت هب': 'gh', 'لينكد إن': 'li' };
  return map[cat] || 'o';
}

function getCategoryIcon(cat) {
  const map = { 'جوجل': 'G', 'فيسبوك': 'f', 'تويتر': '𝕏', 'ديسكورد': '▶', 'جيت هب': '⌘', 'لينكد إن': 'in' };
  return map[cat] || '●';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ============ INITIAL SETUP ============
(async function() {
  const initialized = await checkInit();
  if (initialized) {
    const saved = sessionStorage.getItem('pwm_session');
    if (saved) {
      try {
        const res = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ masterPassword: saved })
        });
        const data = await res.json();
        if (res.ok) {
          masterPassword = saved;
          document.getElementById('masterScreen').style.display = 'none';
          document.getElementById('app').style.display = 'block';
          initApp();
          return;
        }
      } catch {}
    }
    document.getElementById('masterTitle').textContent = 'فتح الخزنة';
    document.getElementById('masterSubtitle').textContent = 'أدخل كلمة المرور الرئيسية';
    document.getElementById('masterActionBtn').textContent = 'فتح';
  } else {
    document.getElementById('masterTitle').textContent = 'إنشاء كلمة المرور الرئيسية';
    document.getElementById('masterSubtitle').textContent = 'اختر كلمة مرور قوية لحماية حساباتك';
    document.getElementById('masterActionBtn').textContent = 'إنشاء';
  }
})();

// Handle Enter key on master password
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('masterPasswordInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleMasterAction();
  });
});
