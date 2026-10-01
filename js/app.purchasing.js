/* LOGIC: MUA HÀNG & ĐỊNH MỨC
 * Đề nghị mua (chờ duyệt → đã duyệt → đã tạo đơn) → Đơn mua → Nhận hàng nhiều lần (nhập kho theo lô).
 * Định mức vật tư (nháp → hiệu lực) và quy tắc đặt hàng (điểm đặt lại) sinh yêu cầu/đề nghị mua. */
const findPR = (id, status) => { const r = DB.purchaseRequests.find((x) => x.id === id); return r && (!status || r.status === status) ? r : null; };
const findPO = (id) => DB.orders.find((x) => x.id === id);

function savePR() {
  const v = Modal.values(), lines = Modal.lines();
  if (!lines.length) return Toast.err('Thêm ít nhất một vật tư');
  createPR({ warehouseId: v.warehouseId, priority: v.priority, requiredDate: v.requiredDate, lines });
  Modal.close(); render(); Toast.ok('Đã gửi đề nghị mua, chờ duyệt');
}
function createPR({ warehouseId, priority = 'trung_binh', requiredDate = '', lines }) {
  const r = { id: uid('DN'), date: today(), requester: Auth.user.name, warehouseId, priority, requiredDate, status: 'cho_duyet', lines };
  DB.purchaseRequests.unshift(r);
  r.approvalId = Approvals.start('purchase', r.id, lines.reduce((t, l) => t + l.qty * ((Q.supply(l.supplyId) || {}).price || 0), 0)).id;
  PurchaseAPI.save('purchaseRequests'); Audit.log('Tạo đề nghị mua', r.id); return r;
}
async function approvePR(id, ok) {
  let r = findPR(id, 'cho_duyet'); if (!r) return;
  let note = '';
  if (!ok) {
    const res = await Confirm.ask({ title: 'Từ chối đề nghị mua', message: `Bạn có chắc muốn từ chối đề nghị mua ${r.id}?`, confirmText: 'Từ chối', note: { label: 'Lý do', placeholder: 'Không bắt buộc' } });
    if (!res) return;
    note = res.note;
    r = findPR(id, 'cho_duyet'); if (!r) return; // trạng thái có thể đã đổi khi popup đang mở
  }
  const a = Approvals.forDoc('purchase', id);
  if (!a) { r.status = ok ? 'da_duyet' : 'tu_choi'; PurchaseAPI.save('purchaseRequests'); return render(); } // dữ liệu cũ chưa có luồng duyệt
  Approvals.decide(a, ok, note);
}

/* ---------- Báo giá ---------- */
function saveQuote() {
  const v = Modal.values(), lines = Modal.lines(false).map((l) => ({ supplyId: l.supplyId, price: l.qty }));
  if (!v.supplierId) return Toast.err('Chọn nhà cung cấp');
  const f = new FormData($('#modalForm')), sup = f.getAll('supply'), prc = f.getAll('qty');
  if (sup.some((id, i) => id && !isDigits(prc[i]))) return Toast.err('Đơn giá phải nhập bằng chữ số (0–9)');
  if (!lines.length) return Toast.err('Thêm ít nhất một vật tư kèm đơn giá');
  if (v.validUntil < today()) return Toast.err('Hạn hiệu lực phải từ hôm nay trở đi');
  DB.quotes.unshift({ id: uid('BG'), supplierId: v.supplierId, date: today(), validUntil: v.validUntil, lines });
  PurchaseAPI.save('quotes'); Audit.log('Nhập báo giá', Q.supplierName(v.supplierId)); Modal.close(); render(); Toast.ok('Đã lưu báo giá');
}

/* ---------- Đơn mua ---------- */
function savePO(prId) {
  const r = findPR(prId, 'da_duyet'), v = Modal.values(); if (!r) return;
  if (!v.supplierId) return Toast.err('Chọn nhà cung cấp');
  const lines = r.lines.map((l) => { const p = Q.quotePrice(v.supplierId, l.supplyId); return { supplyId: l.supplyId, qty: l.qty, price: p ?? (Q.supply(l.supplyId) || {}).price ?? 0, received: 0 }; });
  const po = { id: uid('DH'), supplierId: v.supplierId, requestId: prId, date: today(), expected: v.expected, status: 'da_dat', lines };
  DB.orders.unshift(po); r.status = 'da_dat';
  PurchaseAPI.save('orders'); PurchaseAPI.save('purchaseRequests'); Audit.log('Tạo đơn mua', po.id); Modal.close(); render(); Toast.ok('Đã tạo đơn mua');
}
const poTotal = (po) => po.lines.reduce((t, l) => t + l.qty * l.price, 0);
/** Nhận hàng theo đơn: nhập kho phần đạt (theo lô/hạn dùng), ghi phần từ chối; nhận nhiều lần được. */
function receivePO(id) {
  const po = findPO(id), v = Modal.values(); if (!po || !['da_dat', 'nhan_mot_phan'].includes(po.status)) return;
  const items = [];
  for (let i = 0; i < po.lines.length; i++) {
    const l = po.lines[i], q = Number(v['qty_' + i]) || 0, rej = Number(v['rej_' + i]) || 0;
    if (q < 0 || rej < 0) return Toast.err('Số lượng không được âm');
    if (q > l.qty - l.received + 1e-9) return Toast.err(`Nhận quá số đặt: ${Q.supplyName(l.supplyId)} còn ${fmtN(l.qty - l.received)}`);
    if (q > 0 || rej > 0) items.push({ l, q, rej, lot: (v['lot_' + i] || '').trim(), exp: v['exp_' + i] || '' });
  }
  if (!items.length) return Toast.err('Nhập số lượng nhận hoặc từ chối cho ít nhất một dòng');
  items.forEach(({ l, q, rej, lot, exp }) => {
    const lotObj = lot ? getLot(l.supplyId, lot, exp) : null;
    if (q > 0) { addStock(v.warehouseId, l.supplyId, q, { lotId: lotObj ? lotObj.id : '' }); if (l.price > 0) Q.supply(l.supplyId).price = l.price; }
    l.received += q;
    DB.receipts.unshift({ id: uid('PN'), date: today(), supplyId: l.supplyId, qty: q, rejected: rej, price: l.price, supplierId: po.supplierId, poId: po.id, warehouseId: v.warehouseId, lotId: lotObj ? lotObj.id : '', note: 'Nhận theo ' + po.id });
  });
  po.status = po.lines.every((l) => l.received >= l.qty - 1e-9) ? 'hoan_thanh' : 'nhan_mot_phan';
  SupplyAPI.save('receipts'); PurchaseAPI.save('orders'); commitStock(); Audit.log('Nhận hàng theo đơn mua', po.id); Modal.close(); render(); Toast.ok('Đã nhập kho theo đơn mua');
}
async function cancelPO(id) {
  let po = findPO(id);
  if (!po || po.status !== 'da_dat') return;
  if (!(await Confirm.ask({ title: 'Hủy đơn mua', message: `Bạn có chắc muốn hủy đơn mua ${po.id}?`, confirmText: 'Hủy đơn', cancelText: 'Không' }))) return;
  po = findPO(id); if (!po || po.status !== 'da_dat') return; // trạng thái có thể đã đổi khi popup đang mở
  po.status = 'huy'; PurchaseAPI.save('orders'); Audit.log('Hủy đơn mua', po.id); render();
}

/* ---------- Định mức vật tư ---------- */
function saveStandard() {
  const v = Modal.values(), lines = Modal.lines();
  if (!v.name.trim()) return Toast.err('Nhập tên định mức');
  if (!lines.length) return Toast.err('Thêm ít nhất một vật tư');
  const bad = incompatible(v.equipmentId, lines);
  if (bad) return Toast.err(`${bad} không tương thích với thiết bị đã chọn`);
  DB.standards.unshift({ id: uid('DM'), name: v.name.trim(), equipmentId: v.equipmentId, basis: v.basis, status: 'nhap', lines });
  PurchaseAPI.save('standards'); Audit.log('Tạo định mức', v.name); Modal.close(); render(); Toast.ok('Đã lưu định mức (nháp)');
}
function approveStandard(id) {
  const s = DB.standards.find((x) => x.id === id); if (!s || s.status !== 'nhap') return;
  s.status = 'hieu_luc'; s.approvedBy = Auth.user.name; PurchaseAPI.save('standards'); Audit.log('Duyệt định mức', s.name); render();
}
async function deleteStandard(id) {
  if (!(await Confirm.ask({ title: 'Xóa định mức', message: 'Bạn có chắc muốn xóa định mức này? Thao tác không thể hoàn tác.', confirmText: 'Xóa' }))) return;
  DB.standards = DB.standards.filter((s) => s.id !== id); PurchaseAPI.save('standards'); render();
}
/** Lập yêu cầu vật tư từ định mức đang hiệu lực (đi tiếp luồng duyệt/xuất như bình thường) */
function standardToRequest(id) {
  const s = DB.standards.find((x) => x.id === id);
  if (!s || s.status !== 'hieu_luc') return Toast.err('Chỉ áp dụng định mức đang hiệu lực');
  DB.requests.unshift({ id: uid('YC'), date: today(), requester: Auth.user.name, purpose: 'Theo định mức: ' + s.name, equipmentId: s.equipmentId, repairId: '', lines: s.lines.map((l) => ({ ...l })), status: 'cho_duyet' });
  RequestAPI.save('requests'); Audit.log('Lập yêu cầu từ định mức', s.name); Toast.ok('Đã tạo yêu cầu vật tư, chờ duyệt'); navigate('requests');
}

/* ---------- Quy tắc đặt hàng ---------- */
function saveRule() {
  const v = Modal.values(), n = (k) => Number(v[k]) || 0;
  if (n('max') < n('min') || n('reorderPoint') < n('min') || n('reorderPoint') > n('max')) return Toast.err('Cần: tối thiểu ≤ điểm đặt lại ≤ tối đa');
  if (DB.reorderRules.some((r) => r.supplyId === v.supplyId && r.warehouseId === v.warehouseId)) return Toast.err('Vật tư này đã có quy tắc ở kho đã chọn');
  DB.reorderRules.push({ id: uid('RR'), supplyId: v.supplyId, warehouseId: v.warehouseId, min: n('min'), max: n('max'), reorderPoint: n('reorderPoint'), leadTime: n('leadTime'), safety: n('safety') });
  PurchaseAPI.save('reorderRules'); Audit.log('Thêm quy tắc đặt hàng', Q.supplyName(v.supplyId)); Modal.close(); render(); Toast.ok('Đã lưu quy tắc');
}
function deleteRule(id) { DB.reorderRules = DB.reorderRules.filter((r) => r.id !== id); PurchaseAPI.save('reorderRules'); render(); }
/** Mỗi kho một đề nghị mua: số lượng = tối đa − tồn hiện tại; bỏ qua vật tư đã nằm trong đề nghị đang chờ/đã duyệt */
function suggestPurchases() {
  const open = new Set(DB.purchaseRequests.filter((r) => ['cho_duyet', 'da_duyet'].includes(r.status)).flatMap((r) => r.lines.map((l) => r.warehouseId + '|' + l.supplyId)));
  const byWh = {};
  Q.reorderNeeds().forEach((r) => {
    if (open.has(r.warehouseId + '|' + r.supplyId)) return;
    const qty = r.max - Q.whQty(r.supplyId, r.warehouseId);
    if (qty > 0) (byWh[r.warehouseId] = byWh[r.warehouseId] || []).push({ supplyId: r.supplyId, qty });
  });
  const made = Object.entries(byWh).map(([wh, lines]) => createPR({ warehouseId: wh, priority: 'cao', lines }));
  if (!made.length) return Toast.show('Không có vật tư nào cần đề xuất thêm');
  Toast.ok(`Đã tạo ${made.length} đề nghị mua từ quy tắc đặt hàng`); render();
}

Object.assign(Actions, {
  'pr-new': guard('purchase.write', () => openPRForm()), 'pr-save': guard('purchase.write', savePR), 'pr-open': (d) => openPRDetail(d.id),
  'pr-approve': guard('purchase.approve', (d) => approvePR(d.id, true)), 'pr-reject': guard('purchase.approve', (d) => approvePR(d.id, false)),
  'po-new': guard('purchase.write', (d) => openPOForm(d.id)), 'po-save': guard('purchase.write', (d) => savePO(d.id)), 'po-open': (d) => openPODetail(d.id),
  'po-receive': guard('purchase.write', (d) => openReceiveForm(d.id)), 'po-receive-save': guard('purchase.write', (d) => receivePO(d.id)), 'po-cancel': guard('purchase.write', (d) => cancelPO(d.id)),
  'quote-new': guard('purchase.write', () => openQuoteForm()), 'quote-save': guard('purchase.write', saveQuote),
  'standard-new': guard('purchase.write', () => openStandardForm()), 'standard-save': guard('purchase.write', saveStandard),
  'standard-approve': guard('purchase.approve', (d) => approveStandard(d.id)), 'standard-delete': guard('purchase.write', (d) => deleteStandard(d.id)),
  'standard-request': guard('requests.create', (d) => standardToRequest(d.id)),
  'rule-new': guard('purchase.write', () => openRuleForm()), 'rule-save': guard('purchase.write', saveRule), 'rule-delete': guard('purchase.write', (d) => deleteRule(d.id)),
  'rule-suggest': guard('purchase.write', suggestPurchases),
});
