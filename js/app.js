/* APP — business logic + Actions + bootstrap.
 * Module giao diện (mod-*.js) chỉ render; mọi thay đổi dữ liệu đi qua các hàm dưới đây,
 * rồi lưu qua *API.save(). Quyền được kiểm tra bằng guard() ở phần Actions. */

const Audit = {
  log(action, target = '', oldV = null, newV = null) {
    const u = Auth.user, e = { id: uid('LOG'), time: new Date().toISOString(), user: u ? u.name : '—', action, target };
    if (newV) { e.old = oldV; e.new = newV; }
    DB.audit.unshift(e); DB.audit = DB.audit.slice(0, 500); SystemAPI.save('audit');
  },
  /** Ghi các trường thay đổi (giá trị cũ → mới); mật khẩu chỉ ghi dấu đã đổi, không lưu giá trị */
  change(action, target, before, after) {
    const o = {}, n = {}, show = (x) => (x !== null && typeof x === 'object' ? JSON.stringify(x) : x);
    Object.keys(after).forEach((k) => {
      if (show(before[k]) === show(after[k])) return;
      o[k] = k === 'password' ? '•••' : show(before[k]); n[k] = k === 'password' ? '(đã đổi)' : show(after[k]);
    });
    if (Object.keys(n).length) this.log(action, target, o, n); else this.log(action, target);
  },
};

/* ---------- Vật tư ---------- */
function saveSupply(id) {
  const v = Modal.values();
  if (!v.name.trim()) return Toast.err('Nhập tên vật tư');
  const data = { name: v.name.trim(), categoryId: v.categoryId, unit: v.unit, minStock: Number(v.minStock) || 0, price: Number(v.price) || 0 };
  let target, before;
  if (id) { target = Q.supply(id); before = { ...target }; Object.assign(target, data); } else { target = { id: uid('VT'), stock: 0, ...data }; DB.supplies.push(target); }
  SupplyAPI.save('supplies'); (id ? Audit.change('Sửa vật tư', target.id + ' ' + target.name, before, target) : Audit.log('Thêm vật tư', target.id + ' ' + target.name)); Modal.close(); render(); Toast.ok('Đã lưu vật tư');
}
function supplyInUse(id) {
  return DB.receipts.some((r) => r.supplyId === id) || DB.issues.some((r) => r.supplyId === id) ||
    DB.requests.some((r) => r.lines.some((l) => l.supplyId === id)) || DB.repairs.some((r) => r.lines.some((l) => l.supplyId === id)) || DB.stocktakes.some((k) => k.lines.some((l) => l.supplyId === id)) ||
    DB.purchaseRequests.some((r) => r.lines.some((l) => l.supplyId === id)) || DB.orders.some((o) => o.lines.some((l) => l.supplyId === id)) || DB.balances.some((b) => b.supplyId === id && b.qty > 0);
}
function deleteSupply(id) {
  if (supplyInUse(id)) return Toast.err('Vật tư đã phát sinh chứng từ, không thể xóa');
  if (!confirm('Xóa vật tư này?')) return;
  DB.supplies = DB.supplies.filter((s) => s.id !== id);
  SupplyAPI.save('supplies'); Audit.log('Xóa vật tư', id); render();
}
function saveReceipt() {
  const v = Modal.values(), s = Q.supply(v.supplyId);
  let qty = Number(v.qty), price = Number(v.price) || 0;
  if (!(qty > 0)) return Toast.err('Số lượng phải lớn hơn 0');
  const base = toBaseUnit(s.id, qty, v.unit);
  if (!base) return Toast.err(`Chưa khai báo quy đổi ${v.unit} → ${s.unit} cho ${s.name}`);
  qty = base.qty; price = price / base.factor; // lưu theo đơn vị gốc
  const lot = v.lotNumber.trim() ? getLot(s.id, v.lotNumber.trim(), v.expiry) : null;
  addStock(v.warehouseId, s.id, qty, { lotId: lot ? lot.id : '', locationId: v.locationId });
  DB.receipts.unshift({ id: uid('PN'), date: v.date, supplyId: s.id, qty, price, supplierId: v.supplierId, warehouseId: v.warehouseId, lotId: lot ? lot.id : '', note: v.note });
  if (price > 0) s.price = price; // giá gần nhất dùng để tính giá trị xuất
  SupplyAPI.save('receipts'); commitStock(); Audit.log('Nhập kho', `${s.name} +${fmtN(qty)}`); Modal.close(); render(); Toast.ok('Đã nhập kho');
}
/** Xuất kho dùng chung cho phiếu thủ công, yêu cầu vật tư và lệnh sửa chữa. Trả về true nếu thành công. */
function issueStock({ supplyId, qty, date, purpose, repairId = '', note = '', warehouseId = defaultWh() }) {
  const s = Q.supply(supplyId);
  if (!s) { Toast.err('Không tìm thấy vật tư'); return false; }
  if (!(qty > 0)) { Toast.err('Số lượng phải lớn hơn 0'); return false; }
  const have = Q.whQty(supplyId, warehouseId);
  if (qty > have + 1e-9) { Toast.err(`Không đủ tồn ở ${Q.warehouseName(warehouseId)}: ${s.name} còn ${fmtN(have)} ${s.unit}`); return false; }
  const lots = takeStock(warehouseId, supplyId, qty).map((p) => (Q.lot(p.lotId) || {}).lotNumber).filter(Boolean);
  DB.issues.unshift({ id: uid('PX'), date, supplyId, qty, price: s.price, purpose, repairId, note, warehouseId, lots: lots.join(',') });
  return true;
}
function saveIssue() {
  const v = Modal.values();
  if (!issueStock({ supplyId: v.supplyId, qty: Number(v.qty), date: v.date, purpose: v.purpose, note: v.note, warehouseId: v.warehouseId })) return;
  SupplyAPI.save('issues'); commitStock(); Audit.log('Xuất kho', `${Q.supplyName(v.supplyId)} −${v.qty}`); Modal.close(); render(); Toast.ok('Đã xuất kho');
}

/* ---------- Nhà cung cấp ---------- */
function saveSupplier(id) {
  const v = Modal.values();
  if (!v.name.trim()) return Toast.err('Nhập tên nhà cung cấp');
  const data = { name: v.name.trim(), phone: v.phone, address: v.address };
  if (id) Object.assign(DB.suppliers.find((s) => s.id === id), data); else DB.suppliers.push({ id: uid('NCC'), ...data });
  SupplyAPI.save('suppliers'); Audit.log(id ? 'Sửa nhà cung cấp' : 'Thêm nhà cung cấp', data.name); Modal.close(); render(); Toast.ok('Đã lưu nhà cung cấp');
}
function deleteSupplier(id) {
  if (DB.receipts.some((r) => r.supplierId === id)) return Toast.err('Nhà cung cấp đã có phiếu nhập, không thể xóa');
  if (!confirm('Xóa nhà cung cấp này?')) return;
  DB.suppliers = DB.suppliers.filter((s) => s.id !== id); SupplyAPI.save('suppliers'); Audit.log('Xóa nhà cung cấp', id); render();
}

/* ---------- Kiểm kê: nhập số thực tế → điều chỉnh tồn, lưu chênh lệch ---------- */
function saveStocktake() {
  const v = Modal.values(), wh = v.warehouseId, lines = [];
  for (const s of DB.supplies) {
    const raw = v['act_' + s.id];
    if (raw === '' || raw == null) continue;
    const actual = Number(raw);
    if (!(actual >= 0)) return Toast.err(`Số thực tế của ${s.name} không hợp lệ`);
    const system = Q.whQty(s.id, wh);
    lines.push({ supplyId: s.id, system, actual, diff: actual - system });
  }
  if (!lines.length) return Toast.err('Nhập số thực tế cho ít nhất một vật tư');
  lines.forEach((l) => { if (l.diff > 0) addStock(wh, l.supplyId, l.diff); else if (l.diff < 0) takeStock(wh, l.supplyId, -l.diff); });
  DB.stocktakes.unshift({ id: uid('KK'), date: v.date, by: Auth.user.name, note: v.note, warehouseId: wh, lines });
  SupplyAPI.save('stocktakes'); commitStock();
  Audit.log('Kiểm kê kho', `${Q.warehouseName(wh)}: ${lines.length} dòng, ${lines.filter((l) => l.diff).length} lệch`, Object.fromEntries(lines.filter((l) => l.diff).map((l) => [Q.supplyName(l.supplyId), l.system])), Object.fromEntries(lines.filter((l) => l.diff).map((l) => [Q.supplyName(l.supplyId), l.actual]))); Modal.close(); render(); Toast.ok('Đã lưu kiểm kê và điều chỉnh tồn');
}

/* ---------- Yêu cầu vật tư: cho_duyet → da_duyet → da_xuat (hoặc tu_choi) ---------- */
function saveRequest() {
  const v = Modal.values(), lines = Modal.lines();
  if (!v.purpose.trim()) return Toast.err('Nhập mục đích sử dụng');
  if (!lines.length) return Toast.err('Thêm ít nhất một vật tư với số lượng lớn hơn 0');
  const bad = incompatible(v.equipmentId, lines);
  if (bad) return Toast.err(`${bad} không tương thích với thiết bị đã chọn`);
  const r = { id: uid('YC'), date: today(), requester: Auth.user.name, purpose: v.purpose.trim(), equipmentId: v.equipmentId, repairId: v.repairId, lines, status: 'cho_duyet' };
  DB.requests.unshift(r); RequestAPI.save('requests'); Audit.log('Tạo yêu cầu vật tư', r.id); Modal.close(); render(); Toast.ok('Đã gửi yêu cầu, chờ quản lý duyệt');
}
const findRequest = (id, status) => { const r = DB.requests.find((x) => x.id === id); return r && r.status === status ? r : null; };
function approveRequest(id) {
  const r = findRequest(id, 'cho_duyet'); if (!r) return;
  r.status = 'da_duyet'; r.approvedBy = Auth.user.name; r.approvedAt = today();
  RequestAPI.save('requests'); Audit.log('Duyệt yêu cầu vật tư', r.id); render(); Toast.ok('Đã duyệt');
}
function rejectRequest(id) {
  const r = findRequest(id, 'cho_duyet'); if (!r) return;
  const reason = (Modal.values().reason || '').trim();
  if (!reason) return Toast.err('Nhập lý do từ chối');
  r.status = 'tu_choi'; r.rejectReason = reason; r.approvedBy = Auth.user.name;
  RequestAPI.save('requests'); Audit.log('Từ chối yêu cầu vật tư', r.id); Modal.close(); render();
}
/** Xuất kho theo yêu cầu: tất cả hoặc không — nếu một dòng thiếu tồn thì không xuất dòng nào. */
function issueRequest(id) {
  const r = findRequest(id, 'da_duyet'); if (!r) return;
  const wh = pickWarehouse(r.lines);
  if (!wh) return Toast.err('Không có kho nào đủ toàn bộ vật tư của yêu cầu');
  r.lines.forEach((l) => issueStock({ supplyId: l.supplyId, qty: l.qty, date: today(), purpose: `Yêu cầu ${r.id}: ${r.purpose}`, repairId: r.repairId || '', note: r.id, warehouseId: wh }));
  r.status = 'da_xuat'; r.issuedBy = Auth.user.name; r.issuedAt = today(); r.warehouseId = wh;
  SupplyAPI.save('issues'); commitStock(); RequestAPI.save('requests'); Audit.log('Xuất kho theo yêu cầu', r.id); render(); Toast.ok('Đã xuất kho từ ' + Q.warehouseName(wh));
}

/* ---------- Thiết bị ---------- */
function saveEquipment(id) {
  const v = Modal.values();
  if (!v.name.trim()) return Toast.err('Nhập tên thiết bị');
  const data = { name: v.name.trim(), location: v.location, status: v.status };
  let before = null;
  if (id) { const e = Q.equipment(id); before = { ...e }; Object.assign(e, data); } else DB.equipment.push({ id: uid('TB'), ...data });
  RepairAPI.save('equipment'); if (id) Audit.change('Sửa thiết bị', data.name, before, data); else Audit.log('Thêm thiết bị', data.name); Modal.close(); render(); Toast.ok('Đã lưu thiết bị');
}
function deleteEquipment(id) {
  if (DB.repairs.some((r) => r.equipmentId === id) || DB.schedules.some((s) => s.equipmentId === id)) return Toast.err('Thiết bị đã có lệnh sửa chữa hoặc lịch bảo trì, không thể xóa');
  if (!confirm('Xóa thiết bị này?')) return;
  DB.equipment = DB.equipment.filter((e) => e.id !== id); RepairAPI.save('equipment'); Audit.log('Xóa thiết bị', id); render();
}
function setEquipmentStatus(id, status) { const e = Q.equipment(id); if (e) { e.status = status; RepairAPI.save('equipment'); } }

/* ---------- Lệnh sửa chữa: moi → dang_sua → hoan_thanh (hoặc huy) ---------- */
function createRepair({ equipmentId, title, priority = 'trung_binh', assignee = '', lines = [], note = '', scheduleId = '', tasks = [] }) {
  const r = { id: uid('SC'), date: today(), equipmentId, title, priority, status: 'moi', assignee, lines, cost: 0, note, scheduleId, tasks };
  DB.repairs.unshift(r); RepairAPI.save('repairs'); Audit.log('Tạo lệnh sửa chữa', `${r.id} ${title}`); return r;
}
function saveRepair() {
  const v = Modal.values();
  if (!v.title.trim()) return Toast.err('Nhập nội dung sửa chữa');
  const lines = Modal.lines(), bad = incompatible(v.equipmentId, lines);
  if (bad) return Toast.err(`${bad} không tương thích với thiết bị đã chọn`);
  createRepair({ equipmentId: v.equipmentId, title: v.title.trim(), priority: v.priority, assignee: v.assignee, lines, tasks: newRepairTasks(parseTasks(v.tasks)), note: v.note });
  Modal.close(); render(); Toast.ok('Đã tạo lệnh sửa chữa');
}
function startRepair(id) {
  const r = DB.repairs.find((x) => x.id === id);
  if (!r || r.status !== 'moi') return;
  r.status = 'dang_sua'; setEquipmentStatus(r.equipmentId, 'dang_sua'); RepairAPI.save('repairs'); Audit.log('Bắt đầu sửa chữa', r.id); render();
}
/** Hoàn thành: chỉ xuất phần vật tư dự kiến CHƯA được xuất (qua yêu cầu gắn lệnh); thiếu tồn thì không đổi gì. */
/** Hoàn thành lệnh: bắt buộc ghi nhật ký bảo trì; xuất phần vật tư dự kiến chưa xuất; ghi vật tư sử dụng kèm lý do thay thế. */
function completeRepair(id) {
  const r = DB.repairs.find((x) => x.id === id), v = Modal.values();
  if (!r || r.status !== 'dang_sua') return;
  if (pendingTasks(r).length) return Toast.err('Còn hạng mục công việc chưa hoàn tất');
  if (!v.action.trim() || !v.after.trim()) return Toast.err('Nhập công việc đã làm và tình trạng sau bảo trì');
  const issued = (sid) => DB.issues.filter((i) => i.repairId === id && i.supplyId === sid).reduce((t, i) => t + i.qty, 0);
  const need = r.lines.map((l) => ({ supplyId: l.supplyId, qty: Math.max(0, l.qty - issued(l.supplyId)) })).filter((l) => l.qty > 0);
  const wh = need.length ? pickWarehouse(need) : defaultWh();
  if (!wh) return Toast.err('Không có kho nào đủ vật tư để hoàn thành lệnh này');
  need.forEach((l) => issueStock({ supplyId: l.supplyId, qty: l.qty, date: today(), purpose: 'Sửa chữa: ' + r.title, repairId: id, warehouseId: wh }));
  const used = DB.issues.filter((i) => i.repairId === id);
  r.cost = used.reduce((t, i) => t + i.qty * (i.price || 0), 0);
  r.status = 'hoan_thanh'; r.doneDate = today(); setEquipmentStatus(r.equipmentId, 'hoat_dong');
  used.forEach((i) => DB.usage.push({ id: uid('SD'), repairId: id, issueId: i.id, supplyId: i.supplyId, equipmentId: r.equipmentId, qty: i.qty, unitCost: i.price || 0, reason: v.reason.trim() }));
  DB.maintLogs.unshift({ id: uid('NK'), repairId: id, equipmentId: r.equipmentId, date: today(), before: v.before.trim(), action: v.action.trim(), after: v.after.trim(), technician: Auth.user.name });
  const sch = r.scheduleId && DB.schedules.find((s) => s.id === r.scheduleId);
  if (sch) { sch.lastDate = today(); sch.nextDate = addDays(today(), sch.intervalDays); MaintenanceAPI.save('schedules'); }
  SupplyAPI.save('issues'); commitStock(); RepairAPI.save('repairs'); MaintenanceAPI.save('maintLogs'); MaintenanceAPI.save('usage');
  Audit.log('Hoàn thành sửa chữa', r.id); Modal.close(); render(); Toast.ok('Đã hoàn thành lệnh sửa chữa và ghi nhật ký bảo trì');
}
function cancelRepair(id) {
  const r = DB.repairs.find((x) => x.id === id);
  if (!r || r.status !== 'moi' || !confirm('Hủy lệnh sửa chữa này?')) return;
  r.status = 'huy'; RepairAPI.save('repairs'); Audit.log('Hủy lệnh sửa chữa', r.id); render();
}

/* ---------- Bảo trì định kỳ ---------- */
function saveSchedule(id) {
  const v = Modal.values(), interval = Math.floor(Number(v.intervalDays));
  if (!v.title.trim()) return Toast.err('Nhập công việc bảo trì');
  if (!(interval >= 1)) return Toast.err('Chu kỳ phải từ 1 ngày trở lên');
  const data = { equipmentId: v.equipmentId, title: v.title.trim(), intervalDays: interval, lastDate: v.lastDate, nextDate: addDays(v.lastDate, interval), tasks: parseTasks(v.tasks) };
  let before = null;
  if (id) { const sc = DB.schedules.find((s) => s.id === id); before = { ...sc }; Object.assign(sc, data); } else DB.schedules.push({ id: uid('BT'), ...data });
  MaintenanceAPI.save('schedules'); if (id) Audit.change('Sửa lịch bảo trì', data.title, before, data); else Audit.log('Thêm lịch bảo trì', data.title); Modal.close(); render(); Toast.ok('Đã lưu lịch bảo trì');
}
function deleteSchedule(id) {
  if (!confirm('Xóa lịch bảo trì này?')) return;
  DB.schedules = DB.schedules.filter((s) => s.id !== id); MaintenanceAPI.save('schedules'); Audit.log('Xóa lịch bảo trì', id); render();
}
function scheduleToRepair(id) {
  const s = DB.schedules.find((x) => x.id === id); if (!s) return;
  if (DB.repairs.some((r) => r.scheduleId === id && ['moi', 'dang_sua'].includes(r.status))) return Toast.err('Lịch này đã có lệnh sửa chữa đang mở');
  createRepair({ equipmentId: s.equipmentId, title: 'Bảo trì định kỳ: ' + s.title, scheduleId: id, tasks: newRepairTasks(s.tasks || []) });
  Toast.ok('Đã tạo lệnh sửa chữa từ lịch bảo trì'); navigate('repairs', 'orders');
}

/* ---------- Người dùng ---------- */
function saveUser(id) {
  const v = Modal.values(), me = Auth.user; let chg = null;
  if (!v.name.trim()) return Toast.err('Nhập họ tên');
  const active = v.active !== 'no';
  if (id) {
    const u = DB.users.find((x) => x.id === id);
    if (u.id === me.id && (v.role !== 'admin' || !active)) return Toast.err('Không thể tự hạ quyền hoặc khóa tài khoản đang đăng nhập');
    const before = { ...u }; Object.assign(u, { name: v.name.trim(), role: v.role, active });
    if (v.password) u.password = v.password;
    chg = [before, u];
  } else {
    const username = v.username.trim();
    if (!username || DB.users.some((x) => x.username === username)) return Toast.err('Tên đăng nhập trống hoặc đã tồn tại');
    if (!v.password) return Toast.err('Nhập mật khẩu');
    DB.users.push({ id: uid('U'), username, name: v.name.trim(), role: v.role, password: v.password, active });
  }
  SystemAPI.save('users'); (chg ? Audit.change('Sửa người dùng', v.username, chg[0], chg[1]) : Audit.log('Thêm người dùng', v.username)); Modal.close(); render(); Toast.ok('Đã lưu người dùng');
}

/* ---------- Xuất CSV ---------- */
function exportRows(kind) {
  if (kind === 'stock') return { name: 'ton-kho.csv', rows: [['Mã', 'Tên vật tư', 'Nhóm', 'ĐVT', 'Tồn', 'Định mức', 'Đơn giá', 'Giá trị'], ...DB.supplies.map((s) => [s.id, s.name, (Q.category(s.categoryId) || {}).name, s.unit, s.stock, s.minStock, s.price, s.stock * s.price])] };
  if (kind === 'receipts') return { name: 'phieu-nhap.csv', rows: [['Mã', 'Ngày', 'Vật tư', 'SL', 'Đơn giá', 'Nhà cung cấp'], ...DB.receipts.map((r) => [r.id, r.date, Q.supplyName(r.supplyId), r.qty, r.price, Q.supplierName(r.supplierId)])] };
  if (kind === 'issues') return { name: 'phieu-xuat.csv', rows: [['Mã', 'Ngày', 'Vật tư', 'SL', 'Đơn giá', 'Mục đích', 'Lệnh sửa'], ...DB.issues.map((i) => [i.id, i.date, Q.supplyName(i.supplyId), i.qty, i.price, i.purpose, i.repairId])] };
  if (kind === 'repairs') return { name: 'sua-chua.csv', rows: [['Mã', 'Ngày', 'Thiết bị', 'Nội dung', 'Trạng thái', 'Ngày xong', 'Chi phí'], ...DB.repairs.map((r) => [r.id, r.date, Q.equipmentName(r.equipmentId), r.title, (CONFIG.repairStatus[r.status] || [r.status])[0], r.doneDate, r.cost])] };
  return null;
}

/* ---------- Đăng nhập ---------- */
function doLogin() {
  const u = Auth.login(($('#lgUser') || {}).value || '', ($('#lgPass') || {}).value || '');
  if (!u) return renderLogin('Sai tên đăng nhập hoặc mật khẩu');
  Audit.log('Đăng nhập'); readHash(); render();
}

/* ---------- Actions (quyền kiểm tra bằng guard) ---------- */
Object.assign(Actions, {
  login: doLogin,
  logout: () => { Audit.log('Đăng xuất'); Auth.logout(); render(); },
  export: (d) => { const x = exportRows(d.kind); if (x) downloadCSV(x.name, x.rows); },

  'supply-new': guard('supplies.write', () => openSupplyForm()), 'supply-edit': guard('supplies.write', (d) => openSupplyForm(d.id)),
  'supply-save': guard('supplies.write', (d) => saveSupply(d.id)), 'supply-delete': guard('supplies.write', (d) => deleteSupply(d.id)),
  'receipt-new': guard('supplies.write', () => openReceiptForm()), 'receipt-save': guard('supplies.write', saveReceipt),
  'issue-new': guard('supplies.write', () => openIssueForm()), 'issue-save': guard('supplies.write', saveIssue),
  'supplier-new': guard('suppliers.write', () => openSupplierForm()), 'supplier-edit': guard('suppliers.write', (d) => openSupplierForm(d.id)),
  'supplier-save': guard('suppliers.write', (d) => saveSupplier(d.id)), 'supplier-delete': guard('suppliers.write', (d) => deleteSupplier(d.id)),
  'stocktake-new': guard('stocktake', () => openStocktakeForm()), 'stocktake-save': guard('stocktake', saveStocktake), 'stocktake-open': (d) => openStocktakeDetail(d.id),

  'request-new': guard('requests.create', () => openRequestForm()), 'request-save': guard('requests.create', saveRequest), 'request-open': (d) => openRequestDetail(d.id),
  'request-approve': guard('requests.approve', (d) => approveRequest(d.id)), 'request-reject': guard('requests.approve', (d) => openRejectForm(d.id)),
  'request-reject-save': guard('requests.approve', (d) => rejectRequest(d.id)), 'request-issue': guard('requests.issue', (d) => issueRequest(d.id)),

  'equipment-new': guard('repairs.write', () => openEquipmentForm()), 'equipment-edit': guard('repairs.write', (d) => openEquipmentForm(d.id)),
  'equipment-save': guard('repairs.write', (d) => saveEquipment(d.id)), 'equipment-delete': guard('repairs.write', (d) => deleteEquipment(d.id)),
  'repair-new': guard('repairs.write', () => openRepairForm()), 'repair-save': guard('repairs.write', saveRepair), 'repair-open': (d) => openRepairDetail(d.id),
  'repair-start': guard('repairs.write', (d) => startRepair(d.id)), 'repair-complete': guard('repairs.write', (d) => openCompleteForm(d.id)), 'repair-complete-save': guard('repairs.write', (d) => completeRepair(d.id)), 'repair-cancel': guard('repairs.write', (d) => cancelRepair(d.id)),

  'schedule-new': guard('maintenance.write', () => openScheduleForm()), 'schedule-edit': guard('maintenance.write', (d) => openScheduleForm(d.id)),
  'schedule-save': guard('maintenance.write', (d) => saveSchedule(d.id)), 'schedule-delete': guard('maintenance.write', (d) => deleteSchedule(d.id)),
  'schedule-order': guard('maintenance.write', (d) => scheduleToRepair(d.id)),

  'user-new': guard('users.manage', () => openUserForm()), 'user-edit': guard('users.manage', (d) => openUserForm(d.id)), 'user-save': guard('users.manage', (d) => saveUser(d.id)),
});

/* ---------- Bootstrap ---------- */
async function boot() {
  await Promise.all([SupplyAPI.boot(), PurchaseAPI.boot(), RequestAPI.boot(), RepairAPI.boot(), MaintenanceAPI.boot(), SystemAPI.boot()]);
  ensureBalances(); readHash(); render();
}
document.addEventListener('DOMContentLoaded', boot);
