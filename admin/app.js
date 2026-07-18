// API base resolution.
//  - Same-origin when served from the backend itself (Railway / api.glow.app).
//  - DEV backend when the admin is opened on a dev host or with ?env=dev, so docs
//    uploaded from dev.glow.app are visible here (they live in the dev DB).
//  - Canonical PROD API otherwise.
const PROD_API = 'https://glow-backend.up.railway.app';
const DEV_API  = 'https://glow-backend.up.railway.app';
const API_BASE = (() => {
  const host = window.location.hostname;
  const qsEnv = new URLSearchParams(window.location.search).get('env');
  // explicit override: ?env=dev / ?env=prod (persisted)
  if (qsEnv === 'dev')  localStorage.setItem('adminEnv', 'dev');
  if (qsEnv === 'prod') localStorage.setItem('adminEnv', 'prod');
  const envPref = localStorage.getItem('adminEnv');

  if (host === 'localhost' || host.endsWith('.railway.app') || host === 'api.glow.app' /* future custom domain */) {
    return window.location.origin; // running on the backend host
  }
  if (envPref === 'dev' || host.startsWith('dev') || host.includes('-dev')) {
    return DEV_API;
  }
  if (envPref === 'prod') return PROD_API;
  return PROD_API;
})();

let token = localStorage.getItem('adminToken');
let currentPage = 'dashboard';
let currentDoc = null;
let currentProvider = null;
let currentBooking = null;
let _bookings = [];
let _bookingsRaw = [];
let _loggingOut = false;
let _monitorBoot = false;
let _monitorInterval = null;

// ── Simple request cache (30s TTL for GET requests) ────────────────────────────
const _cache = {};

async function cachedGet(endpoint, ttl = 60_000) {
  const now = Date.now();
  const hit = _cache[endpoint];
  if (hit && now - hit.ts < ttl) return hit.data;
  const data = await apiCall(endpoint);
  _cache[endpoint] = { ts: now, data };
  return data;
}

// Invalidate cache entries matching any of the given substrings
function bust(...patterns) {
  if (!patterns.length) { Object.keys(_cache).forEach(k => delete _cache[k]); return; }
  Object.keys(_cache).forEach(k => {
    if (patterns.some(p => k.includes(p))) delete _cache[k];
  });
}

// ── JWT expiry helper ──────────────────────────────────────────────────────────
function parseJwtExpiry(tok) {
  try { return JSON.parse(atob(tok.split('.')[1])).exp * 1000; }
  catch { return 0; }
}

// Escape user-supplied strings before injecting into innerHTML (leads are public input).
function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ── Toast notifications ────────────────────────────────────────────────────────
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.classList.add('toast-show'), 10);
  setTimeout(() => {
    toast.classList.remove('toast-show');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ── API helpers ────────────────────────────────────────────────────────────────
async function apiCall(endpoint, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), 15_000);

  let res;
  try {
    res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: { ...headers, ...options.headers },
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Request timed out — server may be waking up, please retry');
    throw new Error('Network error — check your connection');
  } finally {
    clearTimeout(timeoutId);
  }

  const data = await res.json().catch(() => ({}));

  if (res.status === 401) {
    if (endpoint === '/admin/login') throw new Error(data.error || 'Invalid credentials');
    if (!_loggingOut) logout((data.error || 'Session expired') + '. Please sign in again.');
    throw new Error('__session_expired__');
  }

  if (res.status === 429) throw new Error('Too many requests — please wait a moment');
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.data = data;            // keep full payload (e.g. { missing: [...] }) for callers
    err.status = res.status;
    throw err;
  }
  return data;
}

function isSessionError(e) { return e && e.message === '__session_expired__'; }

// ── Button loading state helpers ───────────────────────────────────────────────
function btnLoading(btn) {
  btn.disabled = true;
  btn.classList.add('btn-loading');
  btn._prevText = btn.textContent;
  btn.textContent = '\u00a0';
}
function btnDone(btn) {
  btn.disabled = false;
  btn.classList.remove('btn-loading');
  if (btn._prevText) btn.textContent = btn._prevText;
}

// ── Auth ───────────────────────────────────────────────────────────────────────
async function login(username, password) {
  const data = await apiCall('/admin/login', {
    method: 'POST',
    body: JSON.stringify({ username, password })
  });
  token = data.token;
  localStorage.setItem('adminToken', token);
  return data;
}

function logout(message, clearPassword = true) {
  _loggingOut = true;
  token = null;
  localStorage.removeItem('adminToken');
  bust();
  if (clearPassword) {
    const pwField = document.getElementById('password');
    if (pwField) pwField.value = '';
  }
  showScreen('login-screen');
  const errEl = document.getElementById('login-error');
  if (errEl) errEl.textContent = (typeof message === 'string' ? message : '') || '';
  setTimeout(() => { _loggingOut = false; }, 500);
}

// ── Navigation ─────────────────────────────────────────────────────────────────
function showScreen(screen) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  document.getElementById(screen).classList.remove('hidden');
}

function showPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  document.getElementById(`page-${page}`).classList.remove('hidden');
  document.querySelectorAll('.sidebar nav a').forEach(a => a.classList.remove('active'));
  document.querySelector(`[data-page="${page}"]`).classList.add('active');
  currentPage = page;
  if (_monitorInterval) { clearInterval(_monitorInterval); _monitorInterval = null; }
  if (page === 'monitor') {
    _monitorInterval = setInterval(loadMonitor, 30_000);
  }
  loadPage(page);
}

async function loadPage(page) {
  switch (page) {
    case 'dashboard': loadDashboard(); break;
    case 'providers':      loadProviders();      break;
    case 'documents': loadDocuments(); break;
    case 'customers': loadCustomers(); break;
    case 'leads':     loadLeads();     break;
    case 'bookings':  loadBookings();  break;
    case 'monitor':   loadMonitor();   break;
    case 'audit':     loadAudit();     break;
    case 'revenue':   loadRevenue();       break;
    case 'payouts':   loadPayoutsPage();   break;
  }
}

// ── Dashboard — all 4 calls in parallel ────────────────────────────────────────
async function loadDashboard() {
  try {
    const [pendingRes, providersRes, bookingsRes, docsRes] = await Promise.all([
      cachedGet('/admin/documents/pending'),
      cachedGet('/admin/providers'),
      cachedGet('/admin/bookings?limit=1'),
      cachedGet('/admin/documents?status=PENDING&limit=5'),
    ]);

    document.getElementById('stat-pending').textContent = pendingRes.pendingCount || 0;
    document.getElementById('stat-providers').textContent = providersRes.total || 0;
    document.getElementById('stat-bookings').textContent = bookingsRes.total || 0;
    const approved = providersRes.providers?.filter(p => p.profile?.approvedByAdmin).length || 0;
    document.getElementById('stat-approved').textContent = approved;

    renderRecentDocs(docsRes.documents || []);
    loadActivityFeed();
    loadRevenue();
  } catch (e) {
    if (isSessionError(e)) return;
    showToast('Failed to load dashboard data', 'error');
  }
}

function renderRecentDocs(docs) {
  const container = document.getElementById('recent-docs');
  if (!docs.length) {
    container.innerHTML = '<p class="loading">No pending documents</p>';
    return;
  }
  let html = '<table><thead><tr><th>Type</th><th>Status</th><th>Submitted</th></tr></thead><tbody>';
  docs.forEach(d => {
    html += `<tr>
      <td>${DOC_TYPE_LABELS[d.docType] || d.docType}</td>
      <td><span class="badge badge-${d.status.toLowerCase()}">${d.status}</span></td>
      <td>${new Date(d.submittedAt).toLocaleDateString()}</td>
    </tr>`;
  });
  html += '</tbody></table>';
  container.innerHTML = html;
}

// ── Activity Feed ──────────────────────────────────────────────────────────────
async function loadActivityFeed() {
  try {
    const data = await apiCall('/admin/activity-feed');
    renderActivityFeed(data.events || [], data.activeCount || 0, data.pendingCount || 0);
  } catch (e) {
    if (isSessionError(e)) return;
    const feed = document.getElementById('activity-feed');
    if (feed) feed.innerHTML = '<p class="feed-empty">Could not load feed</p>';
  }
}

function renderActivityFeed(events, activeCount, pendingCount) {
  const feed = document.getElementById('activity-feed');
  if (!feed) return;
  if (!events.length) {
    feed.innerHTML = '<p class="feed-empty">No recent activity</p>';
    return;
  }

  function timeAgo(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.round(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.round(h / 24)}d ago`;
  }

  const statusEmoji = { REQUESTED: '🔔', ACCEPTED: '✅', STARTED: '🚀', COMPLETED: '🏁', CANCELLED: '❌' };
  const statusMsg = {
    REQUESTED: e => `New booking — ${e.serviceType} · $${e.totalPrice ?? 0}`,
    ACCEPTED:  e => `${e.providerName || 'A Provider'} accepted ${e.serviceType}`,
    STARTED:   e => `Service started — ${e.serviceType} with ${e.providerName || 'Provider'}`,
    COMPLETED: e => `Job completed — ${e.serviceType} · $${e.totalPrice ?? 0}`,
    CANCELLED: e => `Booking cancelled — ${e.serviceType}`,
  };

  feed.innerHTML = events.map(e => `
    <div class="feed-item">
      <div class="feed-dot feed-dot-${e.status.toLowerCase()}"></div>
      <div class="feed-content">
        <div class="feed-title">${statusEmoji[e.status] || '•'} ${(statusMsg[e.status] || (() => e.status))(e)}</div>
        <div class="feed-meta">Client: ${e.customerName}${e.providerName && e.status !== 'REQUESTED' ? ` · Provider: ${e.providerName}` : ''}</div>
      </div>
      <div class="feed-time">${timeAgo(e.updatedAt || e.createdAt)}</div>
    </div>
  `).join('');
}

// ── Providers ───────────────────────────────────────────────────────────────────────
async function loadProviders() {
  const approved = document.getElementById('provider-filter').value;
  const query = approved !== '' ? `?approved=${approved}` : '';
  try {
    const data = await cachedGet(`/admin/providers${query}`);
    renderProviders(data.providers || []);
    document.getElementById('stat-providers').textContent = data.total || 0;
    document.getElementById('stat-approved').textContent =
      data.providers?.filter(p => p.profile?.approvedByAdmin).length || 0;
  } catch (e) {
    if (isSessionError(e)) return;
    showToast('Failed to load Provider list: ' + e.message, 'error');
    document.querySelector('#provider-table tbody').innerHTML =
      '<tr><td colspan="7" class="loading error-text">Failed to load. Try refreshing.</td></tr>';
  }
}

function renderProviders(providers) {
  const tbody = document.querySelector('#provider-table tbody');
  if (!providers.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="loading">No Providers found</td></tr>';
    return;
  }
  tbody.innerHTML = providers.map(p => {
    const photoUrl = p.profile?.photoUrl || '';
    const avatarHtml = photoUrl
      ? `<img src="${photoUrl}" class="provider-avatar-cell" alt="${p.name}" />`
      : `<div class="provider-avatar-initials">${p.name[0].toUpperCase()}</div>`;
    return `
    <tr>
      <td style="padding:8px 12px;">${avatarHtml}</td>
      <td><strong>${p.name}</strong></td>
      <td>${p.phone}</td>
      <td>${p.profile?.qualificationType || 'Provider'}</td>
      <td>${p.profile?.experienceYears || 0} yrs</td>
      <td><span class="badge badge-${p.profile?.approvedByAdmin ? 'approved' : 'pending'}">${p.profile?.approvedByAdmin ? 'Approved' : 'Pending'}</span></td>
      <td>
        <button class="btn btn-view" onclick="viewProvider('${p.id}')">Review</button>
        ${!p.profile?.approvedByAdmin ? `<button class="btn btn-approve" onclick="approveProvider('${p.id}', this)">✅ Approve</button>` : ''}
      </td>
    </tr>`;
  }).join('');
}

const DOC_TYPE_LABELS_SHORT = { police_check: 'Police Check', provider_certificate: 'Provider Certificate', first_aid_cert: 'First Aid Cert' };
async function approveProvider(providerId, btn, force = false) {
  if (!force && !confirm('Approve this Provider?')) return;
  if (btn) btnLoading(btn);
  try {
    const path = `/admin/providers/${providerId}/approve${force ? '?force=true' : ''}`;
    await apiCall(path, { method: 'POST' });
    bust('/admin/providers');
    showToast('Provider approved successfully!', 'success');
    loadProviders();
  } catch (e) {
    const missing = e.data?.missing;
    if (Array.isArray(missing) && missing.length) {
      const names = missing.map(m => DOC_TYPE_LABELS_SHORT[m] || m).join(', ');
      if (confirm(`Missing documents: ${names}\n\nApprove anyway (override)?`)) {
        if (btn) btnDone(btn);
        return approveProvider(providerId, btn, true);
      }
      showToast(`Cannot approve — missing documents: ${names}`, 'error');
    } else {
      showToast('Failed to approve Provider: ' + e.message, 'error');
    }
  }
  if (btn) btnDone(btn);
}

// ── Document metadata ─────────────────────────────────────────────────────────
const DOC_TYPE_LABELS = {
  police_check: 'Police Check Clearance',
  provider_certificate: 'Provider Certificate',
  first_aid_cert: 'First Aid / CPR Certificate',
  driver_license: "Driver's Licence",
  id_proof: 'Government ID',
  insurance: 'Liability Insurance',
  photo: 'Profile Photo',
  resume: 'Resume',
};
const DOC_TYPE_ICONS = {
  police_check: '🛡️', provider_certificate: '🏅', first_aid_cert: '🚑',
  driver_license: '🚗', id_proof: '🪪', insurance: '📄', photo: '📷', resume: '📝',
};
const REQUIRED_DOCS = ['police_check', 'provider_certificate', 'first_aid_cert'];

// ── Provider Bookings Tab ──────────────────────────────────────────────────────────
function renderProviderBookingsTab(bookings) {
  if (!bookings.length) {
    return `<div style="text-align:center;padding:48px 20px;color:#9ca3af;">
      <div style="font-size:40px;margin-bottom:12px;">📭</div>
      <div style="font-size:15px;font-weight:600;">No bookings yet</div>
      <div style="font-size:13px;margin-top:6px;">This Provider hasn't accepted any jobs.</div>
    </div>`;
  }
  const completed  = bookings.filter(b => b.status === 'COMPLETED').length;
  const totalEarned = bookings.filter(b => b.status === 'COMPLETED').reduce((s, b) => s + (b.price || 0), 0);
  const active = bookings.filter(b => ['ACCEPTED','STARTED'].includes(b.status)).length;
  return `
    <div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap;">
      <div style="flex:1;min-width:80px;background:#F0FDF4;border:1px solid #BBF7D0;border-radius:10px;padding:10px 14px;text-align:center;">
        <div style="font-size:22px;font-weight:800;color:#16a34a;">${completed}</div>
        <div style="font-size:11px;color:#4b5563;font-weight:600;">Completed</div>
      </div>
      <div style="flex:1;min-width:80px;background:#EFF6FF;border:1px solid #BFDBFE;border-radius:10px;padding:10px 14px;text-align:center;">
        <div style="font-size:22px;font-weight:800;color:#2563eb;">${bookings.length}</div>
        <div style="font-size:11px;color:#4b5563;font-weight:600;">Total Jobs</div>
      </div>
      <div style="flex:1;min-width:80px;background:#FFF7ED;border:1px solid #FED7AA;border-radius:10px;padding:10px 14px;text-align:center;">
        <div style="font-size:22px;font-weight:800;color:#ea580c;">$${totalEarned}</div>
        <div style="font-size:11px;color:#4b5563;font-weight:600;">Total Earned</div>
      </div>
      ${active ? `<div style="flex:1;min-width:80px;background:#F5F3FF;border:1px solid #DDD6FE;border-radius:10px;padding:10px 14px;text-align:center;">
        <div style="font-size:22px;font-weight:800;color:#7c3aed;">${active}</div>
        <div style="font-size:11px;color:#4b5563;font-weight:600;">Active</div>
      </div>` : ''}
    </div>
    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
      ${bookings.map(b => `
        <div class="provider-history-item">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
            <div style="min-width:0;">
              <span style="font-weight:700;color:#111;">${b.serviceType}</span>
              <span style="color:#9ca3af;font-size:12px;margin-left:6px;">${b.hours}h · $${b.price ?? 0}</span>
            </div>
            <span class="badge badge-${b.status.toLowerCase()}" style="flex-shrink:0;">${b.status}</span>
          </div>
          <div style="font-size:11px;color:#6b7280;margin-top:4px;display:flex;gap:12px;flex-wrap:wrap;">
            <span>📅 ${new Date(b.scheduledAt).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
            ${b.customerId?.name ? `<span>👤 ${b.customerId.name}</span>` : ''}
            ${b.address ? `<span>📍 ${b.address}</span>` : ''}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// ── Provider Tab switching ─────────────────────────────────────────────────────────
function switchProviderTab(tab) {
  const isBookings = tab === 'bookings';
  document.getElementById('provider-tab-panel-docs').style.display      = isBookings ? 'none'  : 'block';
  document.getElementById('provider-tab-panel-bookings').style.display  = isBookings ? 'block' : 'none';
  document.getElementById('provider-tab-docs').classList.toggle('provider-tab-active',     !isBookings);
  document.getElementById('provider-tab-bookings').classList.toggle('provider-tab-active', isBookings);
}

// ── Provider Detail Modal ───────────────────────────────────────────────────────────
async function viewProvider(providerId) {
  // Open modal immediately with loading state — close button is always visible
  document.getElementById('provider-modal').classList.remove('hidden');
  document.getElementById('provider-modal-titlebar').innerHTML =
    '<div style="color:rgba(255,255,255,0.6);font-size:14px;">Loading…</div>';
  document.getElementById('provider-modal-info').innerHTML =
    '<div class="skeleton" style="height:24px;margin-bottom:10px;border-radius:6px;"></div>'.repeat(6);
  document.getElementById('provider-tab-panel-docs').innerHTML =
    '<div class="loading">Loading documents…</div>';
  document.getElementById('provider-tab-panel-bookings').innerHTML =
    '<div class="loading">Loading bookings…</div>';
  // Only hide approve/reject, NOT the close button (which lives outside provider-modal-actions)
  document.getElementById('provider-modal-actions').style.visibility = 'hidden';
  document.getElementById('provider-reject-bar').classList.add('hidden');
  // Reset to docs tab
  switchProviderTab('docs');

  try {
    const [data, docsData] = await Promise.all([
      cachedGet(`/admin/providers/${providerId}`, 30_000),
      cachedGet(`/admin/documents/provider/${providerId}`, 30_000),
    ]);
    currentProvider = data.provider;

    const p = data.provider;
    const docs = docsData.documents || [];
    const isApproved = p.profile?.approvedByAdmin ?? false;

    // Titlebar
    renderProviderTitlebar(p, docs);

    // Left info panel
    document.getElementById('provider-modal-info').innerHTML = renderProviderInfo(p, docs);

    // Right: docs tab
    document.getElementById('provider-tab-panel-docs').innerHTML = renderProviderDocs(p.id, docs);

    // Right: bookings tab — load asynchronously
    apiCall(`/admin/providers/${p.id}/bookings`).then(histData => {
      const bookings = histData.bookings || [];
      document.getElementById('provider-booking-count').textContent = bookings.length;
      document.getElementById('provider-tab-panel-bookings').innerHTML = renderProviderBookingsTab(bookings);
    }).catch(err => {
      document.getElementById('provider-tab-panel-bookings').innerHTML =
        `<p style="color:#dc2626;padding:20px;">${err.message} <button class="btn btn-view" onclick="viewProvider('${providerId}')">⟳ Retry</button></p>`;
    });

    // Show action buttons
    document.getElementById('provider-modal-actions').style.visibility = 'visible';
    const approveBtn = document.getElementById('approve-provider-modal-btn');
    approveBtn.textContent = isApproved ? '✓ Already Approved' : '✅ Approve Provider';
    approveBtn.disabled = isApproved;
    document.getElementById('reject-provider-modal-btn').textContent =
      isApproved ? '✗ Revoke Approval' : '✗ Reject Provider';
  } catch (e) {
    if (isSessionError(e)) { document.getElementById('provider-modal').classList.add('hidden'); return; }
    // Show error INSIDE the modal — close button remains visible
    document.getElementById('provider-modal-titlebar').innerHTML =
      '<div style="color:#fca5a5;font-size:14px;">⚠ Failed to load</div>';
    document.getElementById('provider-modal-info').innerHTML =
      `<div style="padding:24px;color:#dc2626;font-size:14px;">
         <strong>Error loading Provider data:</strong><br>${e.message}<br><br>
         <button class="btn btn-view" style="font-size:15px;padding:10px 20px;" onclick="bust('/admin/providers/${providerId}','/admin/documents/provider/${providerId}');viewProvider('${providerId}')">⟳ Retry</button>
       </div>`;
    document.getElementById('provider-tab-panel-docs').innerHTML = '';
    document.getElementById('provider-tab-panel-bookings').innerHTML = '';
    document.getElementById('provider-modal-actions').style.visibility = 'hidden';
    showToast('Failed to load Provider: ' + e.message, 'error');
  }
}

function renderProviderTitlebar(p, docs) {
  const isApproved = p.profile?.approvedByAdmin ?? false;
  const pending = docs.filter(d => d.status === 'PENDING').length;
  const accountId = `CN-${p.id.slice(-6).toUpperCase()}`;
  const avatar = p.profile?.photoUrl
    ? `<img src="${p.profile.photoUrl}" style="width:40px;height:40px;border-radius:50%;object-fit:cover;border:2px solid rgba(255,255,255,0.25);" />`
    : `<div style="width:40px;height:40px;border-radius:50%;background:rgba(59,139,255,0.3);display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:800;color:#fff;flex-shrink:0;">${p.name[0]}</div>`;
  const statusLabel = isApproved ? '✓ Approved' : (pending > 0 ? `⏳ ${pending} pending review` : '⏳ Pending');
  const statusBg = isApproved ? '#16a34a' : '#d97706';

  document.getElementById('provider-modal-titlebar').innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;min-width:0;">
      ${avatar}
      <div style="min-width:0;">
        <div style="font-weight:800;font-size:16px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${p.name}</div>
        <div style="font-size:12px;color:rgba(255,255,255,0.5);margin-top:1px;">${accountId} · ${p.phone}</div>
      </div>
      <span style="padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;background:${statusBg};color:#fff;flex-shrink:0;">${statusLabel}</span>
    </div>
  `;
}

function renderProviderInfo(p, docs) {
  const memberSince = new Date(p.createdAt).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
  // "cleared" only if admin has approved a document OR manually toggled (police check)
  const docApproved = (type) => (docs || []).some(d => d.docType === type && d.status === 'APPROVED');
  const policeCleared = p.profile?.policeCheckCleared || docApproved('police_check');
  const checks = [
    ['Police Check', policeCleared, 'police'],
    ['Government ID', docApproved('id_proof'), null],
    ['First Aid / CPR', docApproved('first_aid_cert'), null],
    ["Driver's Licence (ON)", docApproved('driver_license'), null],
    ['Own Transportation', p.profile?.ownTransportation, 'transport'],
    ['Liability Insurance', docApproved('insurance'), null],
  ];

  return `
    <div class="info-section">
      <div class="info-section-title">Contact</div>
      <div class="info-row"><span>Phone</span><strong>${p.phone}</strong></div>
      ${p.email ? `<div class="info-row"><span>Email</span><strong>${p.email}</strong></div>` : ''}
      <div class="info-row"><span>Member since</span><strong>${memberSince}</strong></div>
      <div class="info-row"><span>Rating</span><strong>${p.rating ? `⭐ ${p.rating.toFixed(1)} (${p.ratingCount || 0})` : '—'}</strong></div>
    </div>

    <div class="info-section">
      <div class="info-section-title">Credentials</div>
      <div class="info-row"><span>Qualification</span><strong>${p.profile?.qualificationType || 'Provider'}</strong></div>
      ${p.profile?.licenseNumber ? `<div class="info-row"><span>License #</span><strong style="font-family:monospace;color:#1d4ed8;">${p.profile.licenseNumber}</strong></div>` : ''}
      ${p.profile?.collegeName ? `<div class="info-row"><span>College</span><strong>${p.profile.collegeName}</strong></div>` : ''}
      <div class="info-row"><span>Experience</span><strong>${p.profile?.experienceYears || 0} yrs</strong></div>
    </div>

    <div class="info-section">
      <div class="info-section-title">Verification Checklist</div>
      ${checks.map(([label, val, key]) => `
        <div class="check-row ${val ? 'check-yes' : 'check-no'}" id="check-row-${key || ''}">
          <span class="check-icon">${val ? '✅' : '❌'}</span>
          <span style="flex:1;">${label}${key === 'transport' ? ' <span style="font-size:10px;color:#6b7280;font-weight:400;">(self-reported)</span>' : ''}</span>
          ${key === 'police' ? `<button
            onclick="togglePoliceCheck(this, ${!val})"
            style="font-size:10px;padding:2px 8px;border-radius:6px;border:1px solid ${val ? '#dc2626' : '#16a34a'};background:transparent;color:${val ? '#dc2626' : '#16a34a'};cursor:pointer;font-weight:700;">
            ${val ? 'Revoke' : 'Mark Cleared'}
          </button>` : ''}
        </div>
      `).join('')}
    </div>

    ${p.profile?.languages?.length || p.profile?.specialties?.length ? `
    <div class="info-section">
      ${p.profile?.languages?.length ? `
        <div class="info-section-title">Languages</div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px;">
          ${p.profile.languages.map(l => `<span class="tag tag-blue">${l}</span>`).join('')}
        </div>` : ''}
      ${p.profile?.specialties?.length ? `
        <div class="info-section-title" style="margin-top:${p.profile?.languages?.length ? '4px' : '0'};">Specialties</div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;">
          ${p.profile.specialties.map(s => `<span class="tag tag-amber">${s}</span>`).join('')}
        </div>` : ''}
    </div>` : ''}

    ${p.profile?.bio ? `
    <div class="info-section">
      <div class="info-section-title">Bio</div>
      <p style="font-size:13px;color:#4b5563;line-height:1.6;margin:0;">${p.profile.bio}</p>
    </div>` : ''}
  `;
}

function renderProviderDocs(providerId, docs) {
  if (!docs.length) {
    return `<div style="text-align:center;padding:48px 20px;color:#9ca3af;">
      <div style="font-size:48px;margin-bottom:12px;">📭</div>
      <div style="font-size:15px;font-weight:600;">No documents uploaded yet</div>
      <div style="font-size:13px;margin-top:6px;">Provider hasn't uploaded any credentials.</div>
    </div>`;
  }

  // Sort: PENDING first, then APPROVED, then REJECTED
  const sorted = [...docs].sort((a, b) => {
    const order = { PENDING: 0, APPROVED: 1, REJECTED: 2 };
    return (order[a.status] ?? 3) - (order[b.status] ?? 3);
  });

  const pending  = docs.filter(d => d.status === 'PENDING').length;
  const approved = docs.filter(d => d.status === 'APPROVED').length;
  const requiredApproved = docs.filter(d => REQUIRED_DOCS.includes(d.docType) && d.status === 'APPROVED').length;
  const allRequiredDone  = requiredApproved === REQUIRED_DOCS.length;

  let html = `
    <div class="docs-summary">
      <span>${docs.length} document${docs.length !== 1 ? 's' : ''} · <strong>${approved} approved</strong> · ${pending} pending</span>
      <span class="docs-required ${allRequiredDone ? 'req-done' : 'req-missing'}">${requiredApproved}/${REQUIRED_DOCS.length} required ✓</span>
    </div>
  `;

  sorted.forEach(d => {
    const imgSrc = d.url || d.dataUrl || '';
    const isImg  = imgSrc && (d.mimeType?.startsWith('image/') || imgSrc.startsWith('data:image') || /\.(jpg|jpeg|png|gif)$/i.test(imgSrc));
    const label  = DOC_TYPE_LABELS[d.docType] || d.docType;
    const icon   = DOC_TYPE_ICONS[d.docType] || '📄';
    const isRequired = REQUIRED_DOCS.includes(d.docType);
    const cardCls = d.status === 'APPROVED' ? 'doc-approved' : d.status === 'REJECTED' ? 'doc-rejected' : '';

    html += `
      <div class="doc-review-card ${cardCls}" id="doc-card-${d.id}">
        <div class="doc-review-header">
          <div class="doc-review-type">
            <span>${icon}</span>
            <span>${label}</span>
            ${isRequired ? '<span class="req-badge">Required</span>' : ''}
          </div>
          <span class="badge badge-${d.status.toLowerCase()}" id="doc-badge-${d.id}">${d.status}</span>
        </div>

        ${isImg ? `
        <div class="doc-review-image-wrap">
          <img src="${imgSrc}" class="doc-review-image" loading="lazy"
               onclick="openLightbox('${imgSrc.replace(/'/g, "\\'")}', '${label}')"
               alt="${label}" />
        </div>` : imgSrc ? `
        <div style="padding:12px 14px;">
          <a href="${imgSrc}" target="_blank" class="btn btn-view">📎 Open File</a>
        </div>` : `
        <div style="padding:12px 14px;">
          <button class="btn btn-view" onclick="loadDocInline('${d.id}', this)">📷 Load Photo</button>
        </div>`}

        ${d.status === 'PENDING' ? `
        <div class="doc-review-actions" id="doc-actions-${d.id}">
          <button class="btn btn-approve" onclick="approveDocInline('${d.id}', '${providerId}', this)">✅ Approve</button>
          <button class="btn btn-reject" onclick="showDocRejectForm('${d.id}')">✗ Reject</button>
        </div>
        <div class="doc-reject-form" id="doc-reject-form-${d.id}">
          <input type="text" id="doc-reject-reason-${d.id}" placeholder="Rejection reason (required)…" />
          <button class="btn btn-reject" onclick="rejectDocInline('${d.id}', '${providerId}', this)">Confirm</button>
          <button class="btn btn-cancel" onclick="hideDocRejectForm('${d.id}')">Cancel</button>
        </div>` : ''}

        ${d.status === 'APPROVED' ? `
        <div class="doc-status-banner doc-status-approved">
          ✅ Approved${d.reviewedAt ? ' · ' + new Date(d.reviewedAt).toLocaleDateString('en-CA') : ''}
          ${d.reviewedBy?.username ? ` by ${d.reviewedBy.username}` : ''}
        </div>` : ''}

        ${d.status === 'REJECTED' ? `
        <div class="doc-status-banner doc-status-rejected">
          ❌ Rejected${d.rejectionReason ? ': ' + d.rejectionReason : ''}
        </div>` : ''}
      </div>
    `;
  });

  return html;
}

// Show / hide inline reject form for a doc card
function showDocRejectForm(docId) {
  document.getElementById(`doc-reject-form-${docId}`).classList.add('shown');
  document.getElementById(`doc-reject-reason-${docId}`).focus();
}
function hideDocRejectForm(docId) {
  document.getElementById(`doc-reject-form-${docId}`).classList.remove('shown');
}

// Approve a doc in-place (no modal reload)
async function approveDocInline(docId, providerId, btn) {
  btnLoading(btn);
  try {
    await apiCall(`/admin/documents/${docId}/approve`, { method: 'POST', body: JSON.stringify({}) });
    // Update card in-place
    const card = document.getElementById(`doc-card-${docId}`);
    card.classList.remove('doc-rejected');
    card.classList.add('doc-approved');
    const badge = document.getElementById(`doc-badge-${docId}`);
    badge.className = 'badge badge-approved';
    badge.textContent = 'APPROVED';
    const actions = document.getElementById(`doc-actions-${docId}`);
    if (actions) actions.remove();
    const banner = document.createElement('div');
    banner.className = 'doc-status-banner doc-status-approved';
    banner.textContent = `✅ Approved · ${new Date().toLocaleDateString('en-CA')}`;
    card.appendChild(banner);
    bust('/admin/documents', `/admin/providers/${providerId}`);
    showToast('Document approved!', 'success');
    refreshDocsSummary();
    // Re-render Provider info panel (left side) so verification checklist updates
    if (currentProvider) {
      const _providerId = currentProvider.id;
      Promise.all([
        apiCall(`/admin/providers/${_providerId}`),
        apiCall(`/admin/documents/provider/${_providerId}`)
      ]).then(([providerData, docsData]) => {
        const p = providerData.provider || providerData;
        currentProvider = p;
        document.getElementById('provider-modal-info').innerHTML = renderProviderInfo(p, docsData.documents || []);
      }).catch(() => {});
    }
  } catch (e) {
    showToast('Failed to approve: ' + e.message, 'error');
    btnDone(btn);
  }
}

// Reject a doc in-place (no modal reload)
async function rejectDocInline(docId, providerId, btn) {
  const reasonInput = document.getElementById(`doc-reject-reason-${docId}`);
  const reason = reasonInput.value.trim();
  if (!reason) { showToast('Rejection reason is required', 'error'); reasonInput.focus(); return; }
  btnLoading(btn);
  try {
    await apiCall(`/admin/documents/${docId}/reject`, { method: 'POST', body: JSON.stringify({ reason }) });
    const card = document.getElementById(`doc-card-${docId}`);
    card.classList.remove('doc-approved');
    card.classList.add('doc-rejected');
    const badge = document.getElementById(`doc-badge-${docId}`);
    badge.className = 'badge badge-rejected';
    badge.textContent = 'REJECTED';
    document.getElementById(`doc-actions-${docId}`)?.remove();
    document.getElementById(`doc-reject-form-${docId}`)?.remove();
    const banner = document.createElement('div');
    banner.className = 'doc-status-banner doc-status-rejected';
    banner.textContent = `❌ Rejected: ${reason}`;
    card.appendChild(banner);
    bust('/admin/documents', `/admin/providers/${providerId}`);
    showToast('Document rejected.', 'info');
    refreshDocsSummary();
    // Re-render Provider info panel (left side) so verification checklist updates
    if (currentProvider) {
      const _providerId = currentProvider.id;
      Promise.all([
        apiCall(`/admin/providers/${_providerId}`),
        apiCall(`/admin/documents/provider/${_providerId}`)
      ]).then(([providerData, docsData]) => {
        const p = providerData.provider || providerData;
        currentProvider = p;
        document.getElementById('provider-modal-info').innerHTML = renderProviderInfo(p, docsData.documents || []);
      }).catch(() => {});
    }
  } catch (e) {
    showToast('Failed to reject: ' + e.message, 'error');
    btnDone(btn);
  }
}

// Refresh the docs count summary bar after an inline approve/reject
function refreshDocsSummary() {
  const docsPanel = document.getElementById('provider-tab-panel-docs');
  if (!docsPanel) return;
  const cards = docsPanel.querySelectorAll('.doc-review-card');
  let approved = 0, pending = 0, requiredApproved = 0;
  cards.forEach(card => {
    const badge = card.querySelector('[id^="doc-badge-"]');
    if (!badge) return;
    const status = badge.textContent;
    if (status === 'APPROVED') { approved++; }
    else if (status === 'PENDING') { pending++; }
    // Check required
    const typeEl = card.querySelector('.doc-review-type span:nth-child(2)');
    if (typeEl) {
      const typeText = typeEl.textContent;
      const isRequired = Object.entries(DOC_TYPE_LABELS).some(([k, v]) =>
        REQUIRED_DOCS.includes(k) && v === typeText && status === 'APPROVED'
      );
      if (isRequired) requiredApproved++;
    }
  });
  const total = cards.length;
  const summary = docsPanel.querySelector('.docs-summary');
  if (summary) {
    const allRequiredDone = requiredApproved === REQUIRED_DOCS.length;
    summary.innerHTML = `
      <span>${total} document${total !== 1 ? 's' : ''} · <strong>${approved} approved</strong> · ${pending} pending</span>
      <span class="docs-required ${allRequiredDone ? 'req-done' : 'req-missing'}">${requiredApproved}/${REQUIRED_DOCS.length} required ✓</span>
    `;
  }
}

// ── Toggle Police Check Cleared ───────────────────────────────────────────────
async function togglePoliceCheck(btn, cleared) {
  if (!currentProvider) return;
  btn.disabled = true;
  btn.textContent = '…';
  try {
    await apiCall(`/admin/providers/${currentProvider.id}/police-check`, {
      method: 'PATCH',
      body: JSON.stringify({ cleared }),
    });
    bust(`/admin/providers/${currentProvider.id}`, '/admin/providers');
    const row = document.getElementById('check-row-police');
    if (row) {
      row.className = `check-row ${cleared ? 'check-yes' : 'check-no'}`;
      row.querySelector('.check-icon').textContent = cleared ? '✅' : '❌';
      btn.textContent = cleared ? 'Revoke' : 'Mark Cleared';
      btn.style.borderColor = cleared ? '#dc2626' : '#16a34a';
      btn.style.color = cleared ? '#dc2626' : '#16a34a';
      btn.onclick = () => togglePoliceCheck(btn, !cleared);
    }
    showToast(cleared ? 'Police check marked cleared ✅' : 'Police check revoked', cleared ? 'success' : 'info');
  } catch (e) {
    showToast('Failed: ' + e.message, 'error');
  }
  btn.disabled = false;
}

// ── Approve / Reject Provider from modal ───────────────────────────────────────────
async function approveProviderFromModal(force = false) {
  if (!currentProvider) return;
  if (!force && !confirm(`Approve ${currentProvider.name} as a verified Provider?`)) return;
  const btn = document.getElementById('approve-provider-modal-btn');
  btnLoading(btn);
  try {
    const path = `/admin/providers/${currentProvider.id}/approve${force ? '?force=true' : ''}`;
    await apiCall(path, { method: 'POST' });
    bust('/admin/providers');
    showToast('Provider approved!', 'success');
    btnDone(btn);
    document.getElementById('provider-modal').classList.add('hidden');
    if (currentPage === 'providers') loadProviders();
  } catch (e) {
    const missing = e.data?.missing;
    if (Array.isArray(missing) && missing.length) {
      const names = missing.map(m => DOC_TYPE_LABELS_SHORT[m] || m).join(', ');
      btnDone(btn);
      if (confirm(`Missing documents: ${names}\n\nApprove anyway (override)?`)) {
        return approveProviderFromModal(true);
      }
      showToast(`Cannot approve — missing: ${names}`, 'error');
      return;
    }
    showToast('Failed to approve: ' + e.message, 'error');
    btnDone(btn);
  }
}

async function rejectProviderFromModal() {
  if (!currentProvider) return;
  const reason = document.getElementById('provider-reject-reason').value.trim();
  if (!reason) { showToast('Rejection reason is required', 'error'); return; }
  const btn = document.getElementById('provider-reject-confirm-btn');
  btnLoading(btn);
  try {
    await apiCall(`/admin/providers/${currentProvider.id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
    bust('/admin/providers');
    showToast('Provider rejected.', 'info');
    btnDone(btn);
    document.getElementById('provider-modal').classList.add('hidden');
    document.getElementById('provider-reject-bar').classList.add('hidden');
    document.getElementById('provider-reject-reason').value = '';
    if (currentPage === 'providers') loadProviders();
  } catch (e) {
    showToast('Failed to reject: ' + e.message, 'error');
    btnDone(btn);
  }
}

async function loadDocInline(docId, btn) {
  btn.disabled = true;
  btn.textContent = 'Loading…';
  try {
    const data = await apiCall(`/admin/documents/${docId}`);
    const doc = data.document;
    const src = doc.url || doc.dataUrl || '';
    if (!src) { btn.textContent = 'No file'; return; }
    const isImg = doc.mimeType?.startsWith('image/') || src.startsWith('data:image') || /\.(jpg|jpeg|png|gif)$/i.test(src);
    const label = DOC_TYPE_LABELS[doc.docType] || doc.docType;
    const wrap = btn.closest('div');
    if (isImg) {
      wrap.innerHTML = `<img src="${src}" class="doc-review-image" style="width:100%;border-radius:8px;cursor:zoom-in;margin-top:8px;"
        onclick="openLightbox('${src.replace(/'/g, "\\'")}', '${label}')" alt="${label}" />`;
    } else {
      wrap.innerHTML = `<a href="${src}" target="_blank" class="btn btn-view">📎 Open File</a>`;
    }
  } catch (e) {
    btn.textContent = 'Error loading';
    btn.disabled = false;
  }
}

// ── Image lightbox ─────────────────────────────────────────────────────────────
function openLightbox(src, label) {
  const lb = document.getElementById('lightbox');
  document.getElementById('lightbox-img').src = src;
  document.getElementById('lightbox-label').textContent = label || '';
  lb.classList.remove('hidden');
}
function closeLightbox() {
  document.getElementById('lightbox').classList.add('hidden');
  document.getElementById('lightbox-img').src = '';
}
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeLightbox();
    // Close Provider modal on Escape
    const providerModal = document.getElementById('provider-modal');
    if (!providerModal.classList.contains('hidden')) providerModal.classList.add('hidden');
  }
});

// Click outside Provider modal to close
document.getElementById('provider-modal').addEventListener('click', (e) => {
  if (e.target === document.getElementById('provider-modal')) {
    document.getElementById('provider-modal').classList.add('hidden');
  }
});

// ── Documents page ─────────────────────────────────────────────────────────────
let _docFilterTimer = null;
function debouncedLoadDocuments() {
  clearTimeout(_docFilterTimer);
  _docFilterTimer = setTimeout(loadDocuments, 220);
}

async function loadDocuments() {
  const status  = document.getElementById('doc-status-filter').value;
  const docType = document.getElementById('doc-type-filter').value;
  let query = '?';
  if (status) query += `status=${status}&`;
  if (docType) query += `docType=${docType}&`;
  try {
    const data = await cachedGet(`/admin/documents${query}`);
    renderDocuments(data.documents || []);
  } catch (e) {
    if (isSessionError(e)) return;
    showToast('Failed to load documents: ' + e.message, 'error');
    document.querySelector('#documents-table tbody').innerHTML =
      '<tr><td colspan="6" class="loading error-text">Failed to load. Try refreshing.</td></tr>';
  }
}

function renderDocuments(docs) {
  const tbody = document.querySelector('#documents-table tbody');
  if (!docs.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="loading">No documents found</td></tr>';
    return;
  }
  tbody.innerHTML = docs.map(d => {
    const imgSrc = d.url || d.dataUrl || '';
    const isImg  = imgSrc && (d.mimeType?.startsWith('image/') || imgSrc.startsWith('data:image') || /\.(jpg|jpeg|png|gif)$/i.test(imgSrc));
    const label  = DOC_TYPE_LABELS[d.docType] || d.docType;
    const thumbHtml = isImg
      ? `<img src="${imgSrc}" class="doc-thumb" alt="${label}"
             onclick="openLightbox('${imgSrc.replace(/'/g, "\\'")}', '${label}')"
             title="Click to zoom" />`
      : `<span style="font-size:12px;color:#94a3b8;">${d.originalName || d.fileName || '—'}</span>`;
    return `
    <tr>
      <td>
        <div style="font-weight:600;">${DOC_TYPE_ICONS[d.docType] || '📄'} ${label}</div>
        ${REQUIRED_DOCS.includes(d.docType) ? '<span class="req-badge">Required</span>' : ''}
      </td>
      <td style="padding:8px 16px;">${thumbHtml}</td>
      <td><span class="badge badge-${d.status.toLowerCase()}">${d.status}</span></td>
      <td style="white-space:nowrap;">${new Date(d.submittedAt).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
      <td>
        <button class="btn btn-view" onclick="openDocModal('${d.id}')">View</button>
        ${d.status === 'PENDING' ? `<button class="btn btn-approve" onclick="openDocModal('${d.id}')">Review</button>` : ''}
      </td>
    </tr>`;
  }).join('');
}

async function openDocModal(docId) {
  try {
    const data = await apiCall(`/admin/documents/${docId}`);
    currentDoc = data.document;

    const imgSrc = currentDoc.url || currentDoc.dataUrl || '';
    const isImg  = imgSrc && (currentDoc.mimeType?.startsWith('image/') || imgSrc.startsWith('data:image') || /\.(jpg|jpeg|png|gif)$/i.test(imgSrc));
    const label  = DOC_TYPE_LABELS[currentDoc.docType] || currentDoc.docType;

    document.getElementById('doc-modal-body').innerHTML = `
      <div class="provider-detail-section"><h4>Document Type</h4><p>${DOC_TYPE_ICONS[currentDoc.docType] || '📄'} ${label}</p></div>
      <div class="provider-detail-section">
        <h4>File</h4>
        ${isImg ? `<img src="${imgSrc}" style="width:100%;max-height:420px;object-fit:contain;border-radius:8px;background:#111;cursor:zoom-in;"
                       onclick="openLightbox('${imgSrc.replace(/'/g, "\\'")}', '${label}')" />` : ''}
        ${!isImg && imgSrc ? `<a href="${imgSrc}" target="_blank" class="btn btn-view">📎 Open File</a>` : ''}
        ${!imgSrc ? '<p style="color:#9ca3af;">No file available</p>' : ''}
      </div>
      <div class="provider-detail-section"><h4>Size</h4><p>${currentDoc.size ? Math.round(currentDoc.size / 1024) + ' KB' : 'N/A'}</p></div>
      <div class="provider-detail-section"><h4>Submitted</h4><p>${new Date(currentDoc.submittedAt).toLocaleString()}</p></div>
      <div class="provider-detail-section"><h4>Status</h4><p><span class="badge badge-${currentDoc.status.toLowerCase()}">${currentDoc.status}</span></p></div>
    `;

    document.getElementById('reject-reason-container').classList.add('hidden');
    document.getElementById('reject-reason').value = '';
    document.getElementById('doc-modal').classList.remove('hidden');
  } catch (e) {
    showToast('Failed to load document: ' + e.message, 'error');
  }
}

async function approveDocument() {
  if (!currentDoc) return;
  const btn = document.getElementById('approve-doc-btn');
  btnLoading(btn);
  try {
    await apiCall(`/admin/documents/${currentDoc.id}/approve`, { method: 'POST', body: JSON.stringify({}) });
    bust('/admin/documents');
    showToast('Document approved!', 'success');
    document.getElementById('doc-modal').classList.add('hidden');
    loadDocuments();
  } catch (e) {
    showToast('Failed to approve: ' + e.message, 'error');
    btnDone(btn);
  }
}

function showRejectForm() {
  document.getElementById('reject-reason-container').classList.remove('hidden');
  document.getElementById('reject-reason').focus();
}

async function confirmReject() {
  const reason = document.getElementById('reject-reason').value.trim();
  if (!reason) { showToast('Rejection reason is required', 'error'); return; }
  const btn = document.getElementById('confirm-reject-btn');
  btnLoading(btn);
  try {
    await apiCall(`/admin/documents/${currentDoc.id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
    bust('/admin/documents');
    showToast('Document rejected.', 'info');
    document.getElementById('doc-modal').classList.add('hidden');
    document.getElementById('reject-reason').value = '';
    loadDocuments();
  } catch (e) {
    showToast('Failed to reject: ' + e.message, 'error');
    btnDone(btn);
  }
}

// ── Bookings ───────────────────────────────────────────────────────────────────
async function loadBookings() {
  const status = document.getElementById('booking-status-filter').value;
  const query  = status ? `?status=${status}` : '';
  try {
    const data = await cachedGet(`/admin/bookings${query}`, 15_000);
    _bookingsRaw = data.bookings || [];
    renderBookings(_bookingsRaw);
    document.getElementById('stat-bookings').textContent = data.total || 0;
  } catch (e) {
    if (isSessionError(e)) return;
    showToast('Failed to load bookings: ' + e.message, 'error');
    document.querySelector('#bookings-table tbody').innerHTML =
      '<tr><td colspan="6" class="loading error-text">Failed to load. Try refreshing.</td></tr>';
  }
}

// Escrow/payment presentation. ACTIVE booking + PAID/AUTHORIZED = funds held.
function paymentTag(b) {
  const ps = b.paymentStatus;
  const held = (ps === 'PAID' || ps === 'AUTHORIZED');
  if (ps === 'RELEASED') return { text: '✓ Released', color: '#166534', bg: '#dcfce7' };
  if (ps === 'REFUNDED') return { text: '↩ Refunded', color: '#92400e', bg: '#fef3c7' };
  if (ps === 'FAILED')   return { text: '✕ Failed',   color: '#991b1b', bg: '#fee2e2' };
  if (held)              return { text: '🔒 In escrow', color: '#854d0e', bg: '#fef9c3' };
  return { text: 'Pending', color: '#475569', bg: '#f1f5f9' };
}

function renderBookings(bookings) {
  // Client-side payment filter (escrow handling lives client-side; status filter is server-side).
  const payFilter = document.getElementById('booking-payment-filter')?.value || '';
  if (payFilter === 'held')        bookings = bookings.filter(b => b.paymentStatus === 'PAID' || b.paymentStatus === 'AUTHORIZED');
  else if (payFilter)              bookings = bookings.filter(b => b.paymentStatus === payFilter);

  _bookings = bookings;

  // Escrow summary strip
  const held     = bookings.filter(b => b.paymentStatus === 'PAID' || b.paymentStatus === 'AUTHORIZED');
  const released = bookings.filter(b => b.paymentStatus === 'RELEASED');
  const sum = arr => arr.reduce((s, b) => s + (b.totalPrice ?? b.price ?? 0), 0);
  const fee = arr => arr.reduce((s, b) => s + (b.platformFee ?? 0), 0);
  const strip = document.getElementById('bookings-escrow-strip');
  if (strip) {
    const card = (label, val, bg) => `<div class="stat-card" style="flex:1;min-width:150px;${bg}"><span class="stat-value" style="font-size:22px;">${val}</span><span class="stat-label">${label}</span></div>`;
    strip.innerHTML =
      card('🔒 Held in escrow', '$' + sum(held).toFixed(0), 'background:linear-gradient(135deg,#fefce8,#fef9c3)') +
      card('✓ Released', '$' + sum(released).toFixed(0), 'background:linear-gradient(135deg,#f0fdf4,#dcfce7)') +
      card('Platform fee (released)', '$' + fee(released).toFixed(0), '') +
      card('Bookings shown', bookings.length, '');
  }

  const tbody = document.querySelector('#bookings-table tbody');
  if (!bookings.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="loading">No bookings found</td></tr>';
    return;
  }

  // Group by date (most recent first) — advanced but simple.
  const groups = {};
  bookings.forEach(b => {
    const key = new Date(b.scheduledAt).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    (groups[key] = groups[key] || []).push(b);
  });

  tbody.innerHTML = Object.entries(groups).map(([date, rows]) => {
    const header = `<tr style="background:#f8fafc;"><td colspan="8" style="font-weight:700;color:#475569;font-size:12px;text-transform:uppercase;letter-spacing:.5px;padding:8px 12px;">${date} · ${rows.length}</td></tr>`;
    const body = rows.map(b => {
      const p = paymentTag(b);
      return `
      <tr>
        <td><a href="#" onclick="viewBooking('${b.id}');return false;" style="font-family:monospace;color:#2563eb;">${b.id.slice(-8)}</a></td>
        <td>${b.serviceType}</td>
        <td>${b.customer?.name || 'N/A'}</td>
        <td>${b.provider?.name || 'Unassigned'}</td>
        <td><span class="badge badge-${b.status.toLowerCase()}">${b.status}</span></td>
        <td><span style="padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;color:${p.color};background:${p.bg};">${p.text}</span></td>
        <td>$${(b.totalPrice ?? b.price ?? 0).toFixed(0)}</td>
        <td>${new Date(b.scheduledAt).toLocaleDateString()}</td>
      </tr>`;
    }).join('');
    return header + body;
  }).join('');
}

function viewBooking(bookingId) {
  const b = _bookings.find(x => x.id === bookingId);
  if (!b) return;
  currentBooking = b;
  const provider = b.provider || b.providerId;
  const customer = b.customer || b.customerId;
  document.getElementById('booking-modal-body').innerHTML = `
    <div class="provider-info-grid">
      <div class="provider-detail-section"><h4>Booking ID</h4><p style="font-family:monospace">${b.id}</p></div>
      <div class="provider-detail-section"><h4>Service</h4><p>${b.serviceType}</p></div>
      <div class="provider-detail-section"><h4>Status</h4><p><span class="badge badge-${b.status.toLowerCase()}">${b.status}</span></p></div>
      <div class="provider-detail-section"><h4>Date</h4><p>${new Date(b.scheduledAt).toLocaleString()}</p></div>
      <div class="provider-detail-section"><h4>Hours</h4><p>${b.hours || 'N/A'}</p></div>
      <div class="provider-detail-section"><h4>Total</h4><p>$${b.totalPrice ?? b.price ?? 'N/A'}</p></div>
      <div class="provider-detail-section"><h4>Payment</h4><p><span style="padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;color:${paymentTag(b).color};background:${paymentTag(b).bg};">${paymentTag(b).text}</span></p></div>
      <div class="provider-detail-section"><h4>Platform fee</h4><p>$${(b.platformFee ?? 0).toFixed(2)}</p></div>
      <div class="provider-detail-section"><h4>Provider payout</h4><p>$${(b.providerPayout ?? 0).toFixed(2)}</p></div>
      <div class="provider-detail-section"><h4>Customer</h4><p>${customer?.name || 'N/A'} · ${customer?.phone || ''}</p></div>
      <div class="provider-detail-section"><h4>Provider</h4><p>${provider?.name || 'Unassigned'} · ${provider?.phone || ''}</p></div>
      <div class="provider-detail-section"><h4>Address</h4><p>${b.address || 'N/A'}</p></div>
    </div>
    ${b.notes ? `<div style="margin-top:16px;padding:14px;background:#f0f9ff;border-radius:8px;border:1px solid #bae6fd;"><h4 style="margin:0 0 8px;color:#0369a1;">Notes</h4><p style="margin:0;color:#374151;white-space:pre-wrap;">${b.notes}</p></div>` : ''}
  `;
  document.getElementById('booking-modal').classList.remove('hidden');
}

// ── Leads ───────────────────────────────────────────────────────────────────────
async function loadLeads() {
  const tbody = document.querySelector('#leads-table tbody');
  tbody.innerHTML = '<tr><td colspan="7" class="loading">Loading…</td></tr>';
  try {
    const data = await apiCall('/leads');
    const leads = data.leads || [];
    if (!leads.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="loading">No leads yet</td></tr>';
      return;
    }
    tbody.innerHTML = leads.map(l => `
      <tr style="${l.contacted ? 'opacity:.55;' : ''}">
        <td>${new Date(l.createdAt).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}<br><span style="font-size:11px;color:#94a3b8;">${new Date(l.createdAt).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })}</span></td>
        <td><strong>${escapeHtml(l.name)}</strong></td>
        <td><a href="tel:${escapeHtml(l.phone)}" style="color:#2563eb;">${escapeHtml(l.phone)}</a></td>
        <td>${l.email ? `<a href="mailto:${escapeHtml(l.email)}" style="color:#2563eb;">${escapeHtml(l.email)}</a>` : '—'}</td>
        <td>${escapeHtml(l.serviceType) || '—'}</td>
        <td style="max-width:220px;font-size:13px;color:#475569;">${escapeHtml(l.message) || '—'}</td>
        <td>${l.contacted
          ? '<span style="color:#16a34a;font-weight:700;font-size:12px;">✓ Contacted</span>'
          : `<button class="btn btn-view" onclick="markLeadContacted('${l.id}')">Mark done</button>`}</td>
      </tr>
    `).join('');
  } catch (e) {
    if (isSessionError(e)) return;
    showToast('Failed to load leads: ' + e.message, 'error');
    tbody.innerHTML = '<tr><td colspan="7" class="loading error-text">Failed to load.</td></tr>';
  }
}

async function markLeadContacted(id) {
  try {
    await apiCall(`/leads/${id}`, { method: 'PATCH', body: JSON.stringify({ contacted: true }) });
    loadLeads();
  } catch (e) {
    showToast('Failed: ' + e.message, 'error');
  }
}

// ── Customers ──────────────────────────────────────────────────────────────────
async function loadCustomers() {
  const search = document.getElementById('customer-search').value.trim();
  const query = search ? `?search=${encodeURIComponent(search)}` : '';
  const tbody = document.querySelector('#customers-table tbody');
  tbody.innerHTML = '<tr><td colspan="5" class="loading">Loading…</td></tr>';
  try {
    const data = await apiCall(`/admin/customers${query}`);
    renderCustomers(data.customers || []);
  } catch (e) {
    if (isSessionError(e)) return;
    showToast('Failed to load customers: ' + e.message, 'error');
    tbody.innerHTML = '<tr><td colspan="5" class="loading error-text">Failed to load.</td></tr>';
  }
}

function renderCustomers(customers) {
  const tbody = document.querySelector('#customers-table tbody');
  if (!customers.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="loading">No customers found</td></tr>';
    return;
  }
  tbody.innerHTML = customers.map(c => `
    <tr>
      <td><strong>${c.name}</strong></td>
      <td>${c.phone}</td>
      <td>${new Date(c.createdAt).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
      <td>${c.rating ? `⭐ ${c.rating.toFixed(1)} (${c.ratingCount || 0})` : '—'}</td>
      <td><button class="btn btn-view" onclick="viewCustomer('${c.id}')">View</button></td>
    </tr>
  `).join('');
}

async function viewCustomer(customerId) {
  document.getElementById('customer-modal').classList.remove('hidden');
  document.getElementById('customer-modal-header').innerHTML = '<div style="color:#6b7280;">Loading…</div>';
  document.getElementById('customer-modal-info').innerHTML = '';
  document.getElementById('customer-modal-bookings').innerHTML = '';
  try {
    const data = await apiCall(`/admin/customers/${customerId}`);
    const c = data.customer;
    const bookings = data.bookings || [];

    document.getElementById('customer-modal-header').innerHTML = `
      <div style="display:flex;align-items:center;gap:14px;">
        <div style="width:52px;height:52px;border-radius:26px;background:#4F46E5;display:flex;align-items:center;justify-content:center;color:#fff;font-size:22px;font-weight:800;">${c.name[0]}</div>
        <div>
          <div style="font-size:20px;font-weight:800;color:#111;">${c.name}</div>
          <div style="font-size:13px;color:#6b7280;">${c.phone} · Member since ${new Date(c.createdAt).toLocaleDateString('en-CA', { month: 'short', year: 'numeric' })}</div>
        </div>
        <span style="margin-left:auto;padding:4px 12px;border-radius:20px;background:#EEF2FF;color:#4F46E5;font-size:12px;font-weight:700;">Customer</span>
      </div>
    `;

    document.getElementById('customer-modal-info').innerHTML = `
      <h4 style="margin-bottom:12px;font-size:13px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Profile</h4>
      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:4px 14px;">
        <div class="customer-info-row"><span>Phone</span><strong>${c.phone}</strong></div>
        <div class="customer-info-row"><span>Rating</span><strong>${c.rating ? `⭐ ${c.rating.toFixed(1)} (${c.ratingCount || 0} reviews)` : '—'}</strong></div>
        <div class="customer-info-row"><span>Total Bookings</span><strong>${data.totalBookings}</strong></div>
        <div class="customer-info-row"><span>Completed</span><strong>${bookings.filter(b => b.status === 'COMPLETED').length}</strong></div>
        <div class="customer-info-row"><span>Spent</span><strong>$${bookings.filter(b => b.status === 'COMPLETED').reduce((s, b) => s + (b.price || 0), 0).toFixed(0)}</strong></div>
        <div class="customer-info-row"><span>Member Since</span><strong>${new Date(c.createdAt).toLocaleDateString('en-CA', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })}</strong></div>
      </div>
    `;

    const bHtml = bookings.length === 0
      ? '<p style="color:#9ca3af;text-align:center;padding:20px;">No bookings yet</p>'
      : bookings.slice(0, 10).map(b => `
        <div class="booking-history-item">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
            <strong style="font-size:13px;">${b.serviceType}</strong>
            <span class="badge badge-${b.status.toLowerCase()}">${b.status}</span>
          </div>
          <div style="font-size:12px;color:#6b7280;">${new Date(b.scheduledAt).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' })} · ${b.hours}h · $${b.price ?? b.totalPrice ?? 0}</div>
          ${b.providerId?.name ? `<div style="font-size:12px;color:#4b5563;margin-top:2px;">Provider: ${b.providerId.name}</div>` : ''}
        </div>
      `).join('');

    document.getElementById('customer-modal-bookings').innerHTML = `
      <h4 style="margin-bottom:12px;font-size:13px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Booking History</h4>
      ${bHtml}
    `;
  } catch (e) {
    showToast('Failed to load customer: ' + e.message, 'error');
    document.getElementById('customer-modal').classList.add('hidden');
  }
}

// ── Monitor (real-time operations view) ────────────────────────────────────────
async function loadMonitor() {
  try {
    const [feedData, providersData, bookingsData] = await Promise.all([
      apiCall('/admin/activity-feed'),
      cachedGet('/admin/providers', 30_000),
      apiCall('/admin/bookings'),
    ]);

    const feed     = feedData.events  || [];
    const providers     = providersData.providers    || [];
    const bookings = (bookingsData.bookings || []);

    const active    = bookings.filter(b => b.status === 'ACCEPTED' || b.status === 'STARTED');
    const pending   = bookings.filter(b => b.status === 'REQUESTED');
    const approvedProviders = providers.filter(p => p.profile?.approvedByAdmin);

    // Stat strip
    document.getElementById('mon-active').textContent  = active.length;
    document.getElementById('mon-pending').textContent  = pending.length;
    document.getElementById('mon-providers').textContent     = approvedProviders.length;
    document.getElementById('mon-today').textContent    = bookings.filter(b => {
      const d = new Date(b.scheduledAt);
      const n = new Date();
      return d.toDateString() === n.toDateString();
    }).length;

    // Active jobs table
    const activeEl = document.getElementById('mon-active-jobs');
    if (!active.length) {
      activeEl.innerHTML = '<tr><td colspan="5" class="loading">No active jobs right now</td></tr>';
    } else {
      activeEl.innerHTML = active.map(b => {
        const customer = b.customer || b.customerId;
        const provider      = b.provider      || b.providerId;
        const elapsed  = b.status === 'STARTED' && b.startedAt
          ? Math.round((Date.now() - new Date(b.startedAt).getTime()) / 60000) + ' min'
          : '—';
        return `<tr>
          <td><span class="badge badge-${b.status.toLowerCase()}">${b.status}</span></td>
          <td><strong>${b.serviceType}</strong></td>
          <td>${customer?.name || '—'}</td>
          <td>${provider?.name || 'Unassigned'}</td>
          <td>${elapsed}</td>
        </tr>`;
      }).join('');
    }

    // Pending jobs
    const pendingEl = document.getElementById('mon-pending-jobs');
    if (!pending.length) {
      pendingEl.innerHTML = '<tr><td colspan="4" class="loading">No pending jobs</td></tr>';
    } else {
      pendingEl.innerHTML = pending.map(b => {
        const customer = b.customer || b.customerId;
        const wait = Math.round((Date.now() - new Date(b.createdAt).getTime()) / 60000);
        return `<tr>
          <td><strong>${b.serviceType}</strong></td>
          <td>${customer?.name || '—'}</td>
          <td>$${b.totalPrice ?? b.price ?? 0}</td>
          <td style="color:${wait > 10 ? '#dc2626' : '#6b7280'};font-weight:${wait > 10 ? '700' : '400'};">${wait}m waiting</td>
        </tr>`;
      }).join('');
    }

    // Live event feed
    function timeAgo(iso) {
      const diff = Date.now() - new Date(iso).getTime();
      const m = Math.round(diff / 60000);
      if (m < 1) return 'just now';
      if (m < 60) return `${m}m ago`;
      return `${Math.round(m / 60)}h ago`;
    }
    const statusEmoji = { REQUESTED:'🔔', ACCEPTED:'✅', STARTED:'🚀', COMPLETED:'🏁', CANCELLED:'❌' };
    const feedEl = document.getElementById('mon-feed');
    if (!feed.length) {
      feedEl.innerHTML = '<p class="feed-empty">No recent events</p>';
    } else {
      feedEl.innerHTML = feed.slice(0, 20).map(e => `
        <div class="feed-item">
          <div class="feed-dot feed-dot-${e.status.toLowerCase()}"></div>
          <div class="feed-content">
            <div class="feed-title">${statusEmoji[e.status] || '•'} ${e.serviceType} · $${e.totalPrice ?? 0}</div>
            <div class="feed-meta">
              ${e.customerName}${e.providerName ? ' → ' + e.providerName : ''}
              ${e.urgency && e.urgency !== 'routine' ? ' · <span style="color:#dc2626;font-weight:700;">⚡ ' + e.urgency + '</span>' : ''}
            </div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;">
            <span class="badge badge-${e.status.toLowerCase()}">${e.status}</span>
            <span class="feed-time">${timeAgo(e.updatedAt || e.createdAt)}</span>
          </div>
        </div>
      `).join('');
    }

    _monitorBoot = true;
    document.getElementById('mon-last-updated').textContent = new Date().toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'America/Toronto' });
  } catch (e) {
    if (isSessionError(e)) return;
    showToast('Monitor refresh failed: ' + e.message, 'error');
  }
}

// ── Audit ──────────────────────────────────────────────────────────────────────
async function loadAudit() {
  try {
    const data = await cachedGet('/admin/audit-logs?limit=100', 60_000);
    renderAudit(data.logs || []);
  } catch (e) {
    if (isSessionError(e)) return;
    showToast('Failed to load audit logs: ' + e.message, 'error');
    document.querySelector('#audit-table tbody').innerHTML =
      '<tr><td colspan="4" class="loading error-text">Failed to load. Try refreshing.</td></tr>';
  }
}

function renderAudit(logs) {
  const tbody = document.querySelector('#audit-table tbody');
  if (!logs.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="loading">No audit logs</td></tr>';
    return;
  }
  tbody.innerHTML = logs.map(l => `
    <tr>
      <td>${new Date(l.createdAt).toLocaleString()}</td>
      <td>${l.adminId?.username || 'N/A'}</td>
      <td>${l.action}</td>
      <td style="font-size:12px;font-family:monospace;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"
          title="${JSON.stringify(l.details).replace(/"/g, '&quot;')}">${JSON.stringify(l.details)}</td>
    </tr>
  `).join('');
}

// ── Revenue ────────────────────────────────────────────────────────────────────
async function loadRevenue() {
  try {
    const d = await apiCall('/admin/revenue');
    // Dashboard cards
    const sg = document.getElementById('stat-gross');
    const spf = document.getElementById('stat-platform-fee');
    if (sg) sg.textContent = '$' + d.totalGross.toFixed(0);
    if (spf) spf.textContent = '$' + d.totalPlatformFee.toFixed(0);
    // Escrow ledger cards
    const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    setTxt('rev-escrow-held', '$' + (d.escrowHeld ?? 0).toFixed(2));
    setTxt('rev-realized',    '$' + (d.realizedRevenue ?? 0).toFixed(2));
    setTxt('rev-pending-rev', '$' + (d.pendingRevenue ?? 0).toFixed(2));
    setTxt('rev-released',    '$' + (d.releasedToProvider ?? 0).toFixed(2));
    // Revenue page cards
    document.getElementById('rev-gross').textContent    = '$' + d.totalGross.toFixed(2);
    document.getElementById('rev-platform').textContent = '$' + d.totalPlatformFee.toFixed(2);
    document.getElementById('rev-payout').textContent   = '$' + d.totalProviderPayout.toFixed(2);
    document.getElementById('rev-count').textContent    = d.totalBookings;
    // Bar chart
    const chartEl  = document.getElementById('rev-chart');
    const labelEl  = document.getElementById('rev-chart-labels');
    const maxGross = Math.max(...d.byMonth.map(m => m.gross), 1);
    chartEl.innerHTML = '';
    labelEl.innerHTML = '';
    d.byMonth.forEach(m => {
      const pct = Math.round((m.gross / maxGross) * 140);
      const bar = document.createElement('div');
      bar.title = '$' + m.gross.toFixed(2) + ' gross · $' + m.platformFee.toFixed(2) + ' fee';
      bar.style.cssText = 'flex:1;background:#0066FF;border-radius:4px 4px 0 0;height:' + pct + 'px;min-width:24px;cursor:default;transition:opacity .2s';
      bar.onmouseenter = () => bar.style.opacity = '0.7';
      bar.onmouseleave = () => bar.style.opacity = '1';
      chartEl.appendChild(bar);
      const lbl = document.createElement('div');
      lbl.style.cssText = 'flex:1;text-align:center;font-size:10px;color:#6b7280;min-width:24px;';
      lbl.textContent = m.month.slice(5);
      labelEl.appendChild(lbl);
    });
    // Service type table
    const tbody = document.getElementById('rev-by-type');
    tbody.innerHTML = d.byServiceType.map(s =>
      '<tr><td>' + s.serviceType + '</td><td>' + s.count + '</td><td>$' + s.gross.toFixed(2) + '</td></tr>'
    ).join('') || '<tr><td colspan="3" style="color:#94a3b8;text-align:center">No data yet</td></tr>';
  } catch (e) {
    console.error('Revenue load failed:', e);
  }
}

// ── Event listeners ────────────────────────────────────────────────────────────
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  document.getElementById('login-error').textContent = '';
  _loggingOut = false;
  try {
    const data = await login(username, password);
    document.getElementById('admin-name').textContent = data.admin.username;
    showScreen('admin-screen');
    showPage('dashboard');
  } catch (err) {
    document.getElementById('login-error').textContent = err.message;
  }
});

document.getElementById('logout-btn').addEventListener('click', () => logout());

document.querySelectorAll('.sidebar nav a').forEach(a => {
  a.addEventListener('click', (e) => { e.preventDefault(); showPage(a.dataset.page); });
});

// Debounced filters
document.getElementById('provider-filter').addEventListener('change', () => { bust('/admin/providers'); loadProviders(); });
document.getElementById('doc-status-filter').addEventListener('change', () => { bust('/admin/documents'); debouncedLoadDocuments(); });
document.getElementById('doc-type-filter').addEventListener('change', () => { bust('/admin/documents'); debouncedLoadDocuments(); });
document.getElementById('booking-status-filter').addEventListener('change', () => { bust('/admin/bookings'); loadBookings(); });
document.getElementById('booking-payment-filter')?.addEventListener('change', () => renderBookings(_bookingsRaw || []));

// Close modals
document.querySelectorAll('.modal-close').forEach(btn => {
  btn.addEventListener('click', () => { btn.closest('.modal').classList.add('hidden'); });
});

// Doc modal actions
document.getElementById('approve-doc-btn').addEventListener('click', approveDocument);
document.getElementById('reject-doc-btn').addEventListener('click', showRejectForm);
document.getElementById('confirm-reject-btn').addEventListener('click', confirmReject);

// Provider modal actions
document.getElementById('approve-provider-modal-btn').addEventListener('click', approveProviderFromModal);

document.getElementById('reject-provider-modal-btn').addEventListener('click', () => {
  const bar = document.getElementById('provider-reject-bar');
  bar.classList.toggle('hidden');
  if (!bar.classList.contains('hidden')) document.getElementById('provider-reject-reason').focus();
});

document.getElementById('provider-reject-confirm-btn').addEventListener('click', rejectProviderFromModal);

document.getElementById('provider-reject-cancel-btn').addEventListener('click', () => {
  document.getElementById('provider-reject-bar').classList.add('hidden');
  document.getElementById('provider-reject-reason').value = '';
});

// Lightbox close on backdrop click
document.getElementById('lightbox').addEventListener('click', (e) => {
  if (e.target === document.getElementById('lightbox') || e.target === document.getElementById('lightbox-img')) {
    closeLightbox();
  }
});

// Customer search — trigger on Enter
document.getElementById('customer-search').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { bust('/admin/customers'); loadCustomers(); }
});

// Keep server warm — ping every 4 minutes to prevent cold starts
setInterval(() => fetch(`${API_BASE}/health`).catch(() => {}), 4 * 60 * 1000);

// Sidebar health indicator — ping /health every 60s
(function startHealthIndicator() {
  const dot = document.getElementById('sidebar-health-dot');
  if (!dot) return;
  function ping() {
    fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(5000) })
      .then(r => { dot.style.background = r.ok ? '#22c55e' : '#ef4444'; dot.title = r.ok ? 'API online' : 'API error'; })
      .catch(() => { dot.style.background = '#ef4444'; dot.title = 'API unreachable'; });
  }
  ping();
  setInterval(ping, 60_000);
})();

setInterval(() => { if (currentPage === 'dashboard') loadActivityFeed(); }, 8_000);

// ── Init ───────────────────────────────────────────────────────────────────────
(async function init() {
  if (!token) { showScreen('login-screen'); return; }
  if (parseJwtExpiry(token) < Date.now()) {
    localStorage.removeItem('adminToken');
    token = null;
    showScreen('login-screen');
    return;
  }
  try {
    const data = await apiCall('/admin/me');
    document.getElementById('admin-name').textContent = data.admin.username;
    showScreen('admin-screen');
    showPage('dashboard');
  } catch (e) {
    // Only force logout on explicit session expiry — not network errors
    // Network error on init should just show login screen, not wipe password field
    if (isSessionError(e)) {
      logout('Session expired. Please sign in again.');
    } else {
      localStorage.removeItem('adminToken');
      token = null;
      showScreen('login-screen');
    }
  }
})();

// ── Payouts Page ────────────────────────────────────────────────────────────────

let _pendingPayoutId   = null;
let _pendingBookingIds = null;
let _pendingProviderId      = null;

async function loadPayoutsPage() {
  await Promise.all([loadPayoutQueue(), loadPayoutHistory()]);
}

async function loadPayoutQueue() {
  const queueTbody  = document.getElementById('payout-queue-tbody');
  const countEl     = document.getElementById('payout-queue-count');
  const totalEl     = document.getElementById('payout-queue-total');
  const paidTotalEl = document.getElementById('payout-paid-total');

  queueTbody.innerHTML = '<tr><td colspan="5" class="loading">Loading…</td></tr>';

  try {
    const [queueRes, historyRes] = await Promise.all([
      apiCall('/admin/payouts/queue'),
      apiCall('/admin/payouts?status=PAID'),
    ]);

    const queue = queueRes.queue || [];
    const paid  = historyRes.payouts || [];

    const totalOwed = queue.reduce((s, e) => s + e.totalOwed, 0);
    const totalPaid = paid.reduce((s, p) => s + p.amount, 0);

    countEl.textContent  = queue.length;
    totalEl.textContent  = `$${totalOwed.toFixed(2)}`;
    paidTotalEl.textContent = `$${totalPaid.toFixed(2)}`;

    if (queue.length === 0) {
      queueTbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:32px;color:#6b7280;">No pending payouts — all Providers are paid up! 🎉</td></tr>';
      return;
    }

    queueTbody.innerHTML = queue.map(entry => `
      <tr>
        <td><strong>${entry.provider?.name ?? '—'}</strong></td>
        <td>${entry.provider?.phone ?? '—'}</td>
        <td>${entry.bookings?.length ?? 0} bookings</td>
        <td style="font-weight:800;color:#16a34a;font-size:16px;">$${entry.totalOwed.toFixed(2)}</td>
        <td>
          <button class="btn-approve" onclick="openPayoutModal('${entry.provider.id}','${entry.provider.name}',${entry.totalOwed},'${JSON.stringify(entry.bookings).replace(/"/g,'&quot;')}')">
            💸 Pay Now
          </button>
        </td>
      </tr>
    `).join('');
  } catch (e) {
    queueTbody.innerHTML = `<tr><td colspan="5" style="color:#dc2626;padding:20px;text-align:center;">Error: ${e.message}</td></tr>`;
  }
}

async function loadPayoutHistory() {
  const tbody = document.getElementById('payout-history-tbody');
  tbody.innerHTML = '<tr><td colspan="5" class="loading">Loading…</td></tr>';
  try {
    const { payouts } = await apiCall('/admin/payouts');
    if (payouts.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:32px;color:#6b7280;">No payout history yet.</td></tr>';
      return;
    }
    tbody.innerHTML = payouts.map(p => {
      const date   = new Date(p.paidAt || p.createdAt).toLocaleDateString('en-CA', { year:'numeric', month:'short', day:'numeric' });
      const badge  = p.status === 'PAID'
        ? `<span style="background:#dcfce7;color:#166534;padding:2px 8px;border-radius:6px;font-size:12px;font-weight:700;">PAID</span>`
        : `<span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:6px;font-size:12px;font-weight:700;">PENDING</span>`;
      return `
        <tr>
          <td>${date}</td>
          <td><strong>${p.provider?.name ?? '—'}</strong></td>
          <td style="font-weight:800;color:#16a34a;">$${p.amount.toFixed(2)}</td>
          <td>${p.method ?? '—'}</td>
          <td>${p.adminNote || '—'}</td>
        </tr>
      `;
    }).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="5" style="color:#dc2626;padding:20px;text-align:center;">Error: ${e.message}</td></tr>`;
  }
}

function openPayoutModal(providerId, providerName, amount, bookingIdsJson) {
  _pendingProviderId      = providerId;
  _pendingBookingIds = JSON.parse(bookingIdsJson.replace(/&quot;/g, '"'));
  document.getElementById('payout-modal-provider-name').textContent = `Provider: ${providerName}`;
  document.getElementById('payout-modal-amount').textContent   = `$${parseFloat(amount).toFixed(2)} CAD`;
  document.getElementById('payout-note').value   = '';
  document.getElementById('payout-method').value = 'ETRANSFER';
  document.getElementById('payout-modal').classList.remove('hidden');
}

function closePayoutModal() {
  document.getElementById('payout-modal').classList.add('hidden');
  _pendingProviderId = null;
  _pendingBookingIds = null;
}

async function submitMarkPaid() {
  if (!_pendingProviderId || !_pendingBookingIds) return;
  const btn    = document.getElementById('payout-submit-btn');
  const method = document.getElementById('payout-method').value;
  const note   = document.getElementById('payout-note').value.trim();

  btn.textContent = 'Processing…';
  btn.disabled    = true;

  try {
    // Create payout record then immediately mark it paid
    const { payout } = await apiCall('/admin/payouts', {
      method: 'POST',
      body:   JSON.stringify({ providerId: _pendingProviderId, bookingIds: _pendingBookingIds }),
    });
    await apiCall(`/admin/payouts/${payout.id}/mark-paid`, {
      method: 'POST',
      body:   JSON.stringify({ method, adminNote: note }),
    });
    closePayoutModal();
    showToast('Payout marked as paid!', 'success');
    loadPayoutsPage();
  } catch (e) {
    showToast(e.message || 'Error processing payout', 'error');
  }

  btn.textContent = '✓ Mark as Paid';
  btn.disabled    = false;
}
