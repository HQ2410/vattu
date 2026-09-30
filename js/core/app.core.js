/* CORE — tiện ích, UI kit (toast/modal), xác thực, router, widget dùng lại ở mọi module. */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtN = (n) => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('vi-VN');
const fmtVND = (n) => fmtN(n) + 'đ';
const fmtDate = (s) => (s ? String(s).slice(0, 10).split('-').reverse().join('/') : '—');
const fmtTime = (s) => { if (!s) return '—'; const d = new Date(s); return `${fmtDate(s)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const ymd = (d) => { const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
const today = () => ymd(new Date());
const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return ymd(d); };
const uid = (prefix) => `${prefix}-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 4).toUpperCase()}`;

function downloadCSV(name, rows) {
  const csv = '\ufeff' + rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------- Xác thực & phân quyền ---------- */
const Auth = {
  get user() { const u = KioDataUtils.storageGet(KIO_CONFIG.storageKeys.session); return DB.users.find((x) => x.username === u && x.active !== false) || null; },
  can(perm) { const u = this.user; if (!u) return false; const p = (CONFIG.roles[u.role] || [null, []])[1]; return p.includes('*') || p.includes(perm); },
  login(username, password) {
    const u = DB.users.find((x) => x.username === String(username).trim() && x.password === password && x.active !== false);
    if (u) KioDataUtils.storageSet(KIO_CONFIG.storageKeys.session, u.username);
    return u || null;
  },
  logout() { try { localStorage.removeItem(KIO_CONFIG.storageKeys.session); } catch (_) {} },
};
/** Bọc Action: chặn nếu vai trò hiện tại thiếu quyền */
const guard = (perm, fn) => (d) => { if (!Auth.can(perm)) return Toast.err('Bạn không có quyền thực hiện thao tác này'); return fn(d); };

/* ---------- Toast & Modal ---------- */
const Toast = {
  show(msg, cls = '') { const el = document.createElement('div'); el.className = 'toast ' + cls; el.textContent = msg; $('#toasts').appendChild(el); setTimeout(() => el.remove(), 3200); },
  ok: (m) => Toast.show(m, 'ok'), err: (m) => Toast.show(m, 'err'),
};
const Modal = {
  open(title, body, footer = '', wide = false) {
    $('#modalHost').innerHTML = `<div class="modal ${wide ? 'wide' : ''}"><div class="modal-h"><b>${esc(title)}</b><button class="icon-btn" data-a="modal-close">×</button></div>
      <div class="modal-b"><form id="modalForm" onsubmit="return false">${body}${body.includes('class="req"') ? `<p class="hint">${REQ} Trường bắt buộc</p>` : ''}</form></div><div class="modal-f">${footer}</div></div>`;
    $('#overlay').classList.add('on'); $('#modalHost').classList.add('on');
  },
  close() { $('#overlay').classList.remove('on'); $('#modalHost').classList.remove('on'); $('#modalHost').innerHTML = ''; },
  values() { const o = {}; new FormData($('#modalForm')).forEach((v, k) => { o[k] = v; }); return o; },
  /** Đọc các dòng vật tư từ linesEditor; gộp dòng trùng vật tư */
  lines(sum = true) {
    const f = new FormData($('#modalForm')), s = f.getAll('supply'), q = f.getAll('qty'), map = {};
    s.forEach((id, i) => { const n = Number(q[i]); if (id && n > 0) map[id] = sum ? (map[id] || 0) + n : n; });
    return Object.entries(map).map(([supplyId, qty]) => ({ supplyId, qty }));
  },
};

/* ---------- Widget dùng lại ---------- */
function badge(map, key) { const [label, cls] = map[key] || [key, 'b-gray']; return `<span class="badge ${cls}">${esc(label)}</span>`; }
function pageHead(title, sub, actions = '') { return `<div class="page-head"><div><h2>${esc(title)}</h2><p>${esc(sub)}</p></div><div class="head-actions">${actions}</div></div>`; }
function tabsBar(tabs, cur) { return `<div class="tabs">${tabs.map(([id, label]) => `<div class="tab ${id === cur ? 'on' : ''}" data-a="tab" data-tab="${id}">${esc(label)}</div>`).join('')}</div>`; }
function toolbar(placeholder) { return `<div class="toolbar"><input data-f="q" placeholder="${esc(placeholder)}" value="${esc(State.q)}"></div>`; }
function tableShell(headers, rowsHTML, empty = 'Chưa có dữ liệu') {
  if (!rowsHTML) return `<div class="tbl-wrap"><div class="empty">${esc(empty)}</div></div>`;
  return `<div class="tbl-wrap"><table><thead><tr>${headers.map((h) => `<th class="${h.startsWith('#') ? 'num' : ''}">${esc(h.replace(/^#/, ''))}</th>`).join('')}</tr></thead><tbody>${rowsHTML}</tbody></table></div>`;
}
function kpi(label, value, tone = '') { return `<div class="kpi ${tone}"><small>${esc(label)}</small><b>${value}</b></div>`; }
function selectHTML(name, options, value = '', attrs = '') {
  return `<select name="${name}" ${attrs}>${options.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(value) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
}
const REQ = '<span class="req" title="Bắt buộc">*</span>';
function field(label, name, { type = 'text', value = '', options = null, required = false, attrs = '' } = {}) {
  const req = required ? 'required' : '';
  let input;
  if (options) input = selectHTML(name, options, value, req);
  else if (type === 'textarea') input = `<textarea name="${name}" rows="2" ${req}>${esc(value)}</textarea>`;
  else input = `<input type="${type}" name="${name}" value="${esc(value)}" ${req} ${attrs}>`;
  return `<div class="fld"><label>${esc(label)}${required ? ' ' + REQ : ''}</label>${input}</div>`;
}
/** Bảng nhập nhiều dòng vật tư (thêm/xóa dòng bằng data-a="line-add"/"line-del") */
const supplyOpts = () => [['', '— chọn vật tư —'], ...DB.supplies.map((s) => [s.id, `${s.name} (tồn ${fmtN(s.stock)} ${s.unit})`])];
const lineRow = (r = {}, ph = 'SL') => `<div class="line">${selectHTML('supply', supplyOpts(), r.supplyId || '')}<input type="number" name="qty" min="0" step="any" placeholder="${esc(ph)}" value="${r.qty ?? ''}"><button type="button" class="icon-btn" data-a="line-del" title="Bỏ dòng">×</button></div>`;
function linesEditor(rows = [{}], ph = 'SL') {
  return `<div id="lines">${(rows.length ? rows : [{}]).map((r) => lineRow(r, ph)).join('')}</div><button type="button" class="btn sm" data-a="line-add">+ Thêm dòng</button>`;
}
const btn = (label, a, data = {}, cls = '') => `<button type="button" class="btn ${cls}" data-a="${a}" ${Object.entries(data).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ')}>${label}</button>`;
const can = (perm, html) => (Auth.can(perm) ? html : '');
const matchQ = (...vals) => { const q = State.q.trim().toLowerCase(); return !q || vals.join(' ').toLowerCase().includes(q); };
const inRange = (date) => (!State.from || date >= State.from) && (!State.to || date <= State.to);

/* ---------- Truy vấn dùng chung ---------- */
const Q = {
  supply: (id) => DB.supplies.find((s) => s.id === id),
  equipment: (id) => DB.equipment.find((e) => e.id === id),
  category: (id) => DB.categories.find((c) => c.id === id),
  supplyName: (id) => (Q.supply(id) || {}).name || id,
  equipmentName: (id) => (Q.equipment(id) || {}).name || id || '—',
  supplierName: (id) => (DB.suppliers.find((s) => s.id === id) || {}).name || '',
  lowStock: () => DB.supplies.filter((s) => Number(s.stock) <= Number(s.minStock)),
  inventoryValue: () => DB.supplies.reduce((t, s) => t + s.stock * s.price, 0),
  scheduleStatus(s) { const t = today(); if (s.nextDate < t) return 'qua_han'; return s.nextDate <= addDays(t, 7) ? 'sap_den' : 'binh_thuong'; },
  overdueSchedules: () => DB.schedules.filter((s) => Q.scheduleStatus(s) === 'qua_han'),
  pendingApproval: () => DB.requests.filter((r) => r.status === 'cho_duyet'),
  pendingIssue: () => DB.requests.filter((r) => r.status === 'da_duyet'),
  whQty: (sid, wh = '') => DB.balances.filter((b) => b.supplyId === sid && (!wh || b.warehouseId === wh)).reduce((t, b) => t + b.qty, 0),
  warehouseName: (id) => (DB.warehouses.find((w) => w.id === id) || {}).name || id || '—',
  lot: (id) => DB.lots.find((l) => l.id === id),
  expiringLots: (days = 30) => DB.balances.filter((b) => b.qty > 0 && b.lotId).map((b) => ({ b, l: Q.lot(b.lotId) })).filter((x) => x.l && x.l.expiry && x.l.expiry <= addDays(today(), days)),
  reorderNeeds: () => DB.reorderRules.filter((r) => Q.whQty(r.supplyId, r.warehouseId) <= r.reorderPoint),
  quotePrice(supplierId, supplyId) {
    const qs = DB.quotes.filter((q) => q.supplierId === supplierId && q.validUntil >= today()).sort((a, b) => b.date.localeCompare(a.date));
    for (const q of qs) { const l = q.lines.find((x) => x.supplyId === supplyId); if (l) return l.price; }
    return null;
  },
  linesText: (lines) => (lines || []).map((l) => `${Q.supplyName(l.supplyId)} × ${fmtN(l.qty)}`).join('; ') || '—',
  openAlerts: (severity) => DB.alerts.filter((a) => a.status === 'moi' && (!severity || a.severity === severity)),
  pendingRecommendations: () => DB.recommendations.filter((r) => r.status === 'cho_duyet'),
};

/* ---------- Router ---------- */
const NAV = [
  { group: 'TỔNG QUAN', items: [{ id: 'dashboard', label: 'Dashboard', icon: 'fa-gauge-high' }] },
  { group: 'NGHIỆP VỤ', items: [
    { id: 'supplies', label: 'Vật tư tiêu hao', icon: 'fa-boxes-stacked', count: () => Q.lowStock().length },
    { id: 'warehouse', label: 'Kho & lô hàng', icon: 'fa-warehouse', count: () => Q.expiringLots().length },
    { id: 'purchasing', label: 'Mua hàng & định mức', icon: 'fa-cart-shopping', count: () => (Auth.can('purchase.approve') ? DB.purchaseRequests.filter((r) => r.status === 'cho_duyet').length : 0) + (Auth.can('purchase.write') ? DB.purchaseRequests.filter((r) => r.status === 'da_duyet').length : 0) },
    { id: 'requests', label: 'Yêu cầu vật tư', icon: 'fa-clipboard-list', count: () => (Auth.can('requests.approve') ? Q.pendingApproval().length : 0) + (Auth.can('requests.issue') ? Q.pendingIssue().length : 0) },
    { id: 'repairs', label: 'Sửa chữa & bảo trì', icon: 'fa-screwdriver-wrench', count: () => Q.overdueSchedules().length },
  ] },
  { group: 'BÁO CÁO', items: [
    { id: 'reports', label: 'Báo cáo', icon: 'fa-chart-column' },
    { id: 'ai', label: 'Dự báo & AI', icon: 'fa-wand-magic-sparkles', count: () => DB.alerts.filter((a) => a.status === 'moi' && a.severity === 'cao').length + DB.recommendations.filter((r) => r.status === 'cho_duyet').length },
  ] },
  { group: 'HỆ THỐNG', items: [{ id: 'system', label: 'Người dùng & nhật ký', icon: 'fa-user-shield', perm: 'users.manage' }] },
];
const META = {
  dashboard: ['Tổng quan', 'Vật tư, yêu cầu và sửa chữa cần chú ý'],
  supplies: ['Vật tư tiêu hao', 'Danh mục, nhập kho, xuất kho, nhà cung cấp, kiểm kê'],
  warehouse: ['Kho & lô hàng', 'Tồn theo kho và lô, chuyển kho, quy đổi đơn vị'],
  purchasing: ['Mua hàng & định mức', 'Đề nghị mua, báo giá, đơn mua, định mức, quy tắc đặt hàng'],
  requests: ['Yêu cầu vật tư', 'Kỹ thuật đề nghị → Quản lý duyệt → Thủ kho xuất'],
  repairs: ['Sửa chữa & bảo trì', 'Lệnh sửa chữa, thiết bị, lịch bảo trì định kỳ'],
  reports: ['Báo cáo', 'Tồn kho, tiêu hao, chi phí sửa chữa'],
  ai: ['Dự báo & AI', 'Dự báo nhu cầu, khuyến nghị đặt hàng/định mức, cảnh báo'],
  system: ['Người dùng & nhật ký', 'Tài khoản, vai trò, lịch sử thao tác'],
};
const State = { module: 'dashboard', tab: '', q: '', from: '', to: '' };
const Views = {};   // Views[module] = (state) => html
const Actions = {}; // Actions[name] = (dataset) => void

const canOpen = (m) => { const it = NAV.flatMap((g) => g.items).find((i) => i.id === m); return !!it && (!it.perm || Auth.can(it.perm)); };
function navigate(module, tab = '') { State.module = module; State.tab = tab; State.q = ''; location.hash = tab ? `${module}/${tab}` : module; render(); }
function readHash() {
  const [m, t] = location.hash.replace('#', '').split('/');
  State.module = Views[m] && canOpen(m) ? m : 'dashboard'; State.tab = t || ''; State.q = '';
}
function renderNav() {
  $('#nav').innerHTML = NAV.map((g) => {
    const items = g.items.filter((i) => !i.perm || Auth.can(i.perm));
    return items.length ? `<div class="nav-group">${g.group}</div>` + items.map((i) => {
      const n = i.count ? i.count() : 0;
      return `<div class="nav-item ${i.id === State.module ? 'on' : ''}" data-a="nav" data-module="${i.id}"><i class="fa-solid ${i.icon}"></i><span>${esc(i.label)}</span>${n ? `<em class="count">${n}</em>` : ''}</div>`;
    }).join('') : '';
  }).join('');
}
function renderLogin(err = '') {
  $('#login').classList.add('on');
  $('#login').innerHTML = `<div class="login-box"><h2>Vật tư &amp; Sửa chữa</h2><p>Đăng nhập để tiếp tục</p>
    <div class="fld"><label>Tên đăng nhập ${REQ}</label><input id="lgUser" autocomplete="username"></div>
    <div class="fld"><label>Mật khẩu ${REQ}</label><input id="lgPass" type="password" autocomplete="current-password"></div>
    <div class="lg-err">${esc(err)}</div>${btn('Đăng nhập', 'login', {}, 'primary block')}
    <p class="hint">Demo: admin, thukho, kythuat, quanly — mật khẩu 123456</p></div>`;
}
function render() {
  if (!Auth.user) return renderLogin();
  $('#login').classList.remove('on'); $('#login').innerHTML = '';
  const active = document.activeElement;
  const keep = active && active.dataset && active.dataset.f;
  const caret = keep && active.selectionStart != null ? active.selectionStart : null;
  const [title, sub] = META[State.module] || ['', ''];
  $('#crumbTitle').textContent = title; $('#crumb').textContent = sub;
  const u = Auth.user;
  $('#userbox').innerHTML = `<span><b>${esc(u.name)}</b><small>${esc((CONFIG.roles[u.role] || [u.role])[0])}</small></span>${btn('Đăng xuất', 'logout', {}, 'sm')}`;
  $('#view').innerHTML = Views[State.module] ? Views[State.module](State) : '';
  renderNav();
  if (keep) { const el = $(`[data-f="${keep}"]`); if (el) { el.focus(); if (caret != null && el.setSelectionRange) el.setSelectionRange(caret, caret); } }
}

/* ---------- Event delegation ---------- */
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-a]');
  if (!el) return;
  const a = el.dataset.a;
  if (a === 'nav') return navigate(el.dataset.module);
  if (a === 'tab') { State.tab = el.dataset.tab; State.q = ''; location.hash = `${State.module}/${State.tab}`; return render(); }
  if (a === 'modal-close') return Modal.close();
  if (a === 'line-add') { const c = $('#lines .line').cloneNode(true); c.querySelectorAll('select,input').forEach((x) => { x.value = ''; }); return $('#lines').appendChild(c); }
  if (a === 'line-del') { if ($$('#lines .line').length > 1) el.closest('.line').remove(); return; }
  if (Actions[a]) Actions[a](el.dataset);
});
document.addEventListener('change', (e) => { const a = e.target.dataset && e.target.dataset.change; if (a && Actions[a]) Actions[a]({ value: e.target.value }); });
document.addEventListener('input', (e) => {
  const f = e.target.dataset && e.target.dataset.f;
  if (f && f in State) { State[f] = e.target.value; render(); }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.closest && e.target.closest('#login')) Actions.login(); });
$('#overlay').addEventListener('click', () => Modal.close());
window.addEventListener('hashchange', () => { readHash(); render(); });
