/* LOGIC: BẢO TRÌ ĐẦY ĐỦ — hạng mục công việc, vật tư tương thích, phê duyệt nhiều bước dùng chung */
const parseTasks = (text) => String(text || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const [name, mins] = l.split('|').map((x) => x.trim()); return { name, minutes: Number(mins) || 0 }; });
const tasksToText = (tasks = []) => tasks.map((t) => (t.minutes ? `${t.name} | ${t.minutes}` : t.name)).join('\n');
const newRepairTasks = (tasks = []) => tasks.map((t) => ({ id: uid('HM'), name: t.name, minutes: t.minutes || 0, status: 'chua', result: '', by: '', doneAt: '' }));
const pendingTasks = (r) => (r.tasks || []).filter((t) => ['chua', 'dang'].includes(t.status));

/** Trả tên vật tư đầu tiên không tương thích với thiết bị ('' nếu ổn). Vật tư chưa khai báo tương thích = dùng chung. */
function incompatible(equipmentId, lines) {
  if (!equipmentId) return '';
  const bad = lines.find((l) => { const c = DB.compat.filter((x) => x.supplyId === l.supplyId); return c.length && !c.some((x) => x.equipmentId === equipmentId); });
  return bad ? Q.supplyName(bad.supplyId) : '';
}
function saveCompat() {
  const v = Modal.values(), qty = Number(v.qty);
  if (!(qty > 0)) return Toast.err('Số lượng mỗi lần thay phải lớn hơn 0');
  if (DB.compat.some((c) => c.supplyId === v.supplyId && c.equipmentId === v.equipmentId)) return Toast.err('Cặp vật tư – thiết bị này đã có');
  DB.compat.push({ id: uid('TT'), supplyId: v.supplyId, equipmentId: v.equipmentId, qty });
  MaintenanceAPI.save('compat'); Audit.log('Khai báo vật tư tương thích', `${Q.supplyName(v.supplyId)} ↔ ${Q.equipmentName(v.equipmentId)}`); Modal.close(); render(); Toast.ok('Đã lưu');
}
function deleteCompat(id) { DB.compat = DB.compat.filter((c) => c.id !== id); MaintenanceAPI.save('compat'); render(); }
/** Nạp vào form lệnh sửa các vật tư tương thích của thiết bị đang chọn, với số lượng mỗi lần thay */
function fillCompat() {
  const eq = $('#modalForm [name=equipmentId]').value, rows = DB.compat.filter((c) => c.equipmentId === eq).map((c) => ({ supplyId: c.supplyId, qty: c.qty }));
  if (!rows.length) return Toast.err('Thiết bị này chưa khai báo vật tư tương thích');
  $('#lines').innerHTML = rows.map((r) => lineRow(r)).join('');
}

/* ---------- Hạng mục công việc trong lệnh ---------- */
function saveTask(repairId, taskId) {
  const r = DB.repairs.find((x) => x.id === repairId), t = r && (r.tasks || []).find((x) => x.id === taskId), v = Modal.values();
  if (!t) return;
  if (r.status !== 'dang_sua') return Toast.err('Chỉ cập nhật hạng mục khi lệnh đang sửa');
  if (v.status === 'xong' && !v.result.trim()) return Toast.err('Nhập kết quả thực hiện');
  Object.assign(t, { status: v.status, result: v.result.trim(), by: Auth.user.name, doneAt: ['xong', 'bo_qua'].includes(v.status) ? today() : '' });
  RepairAPI.save('repairs'); Audit.log('Cập nhật hạng mục', `${r.id}: ${t.name} → ${CONFIG.taskStatus[v.status][0]}`); render(); openRepairDetail(repairId);
}

/* ---------- Phê duyệt nhiều bước dùng chung ---------- */
const ApprovalDone = { purchase: (id, ok) => { const r = findPR(id); if (r) { r.status = ok ? 'da_duyet' : 'tu_choi'; PurchaseAPI.save('purchaseRequests'); } } };
const Approvals = {
  start(docType, docId, amount = 0) {
    const flow = (CONFIG.approvalFlows[docType] || []).filter((s) => !s.minAmount || amount >= s.minAmount);
    const a = { id: uid('PD'), docType, docId, requestedBy: (Auth.user || {}).name || '—', submittedAt: new Date().toISOString(), amount, status: 'dang_duyet',
      steps: flow.map((s, i) => ({ order: i + 1, role: s.role, label: s.label, decision: '', by: '', at: '', comment: '' })) };
    DB.approvals.unshift(a); SystemAPI.save('approvals'); return a;
  },
  forDoc: (docType, docId) => DB.approvals.find((a) => a.docType === docType && a.docId === docId),
  current: (a) => (a && a.status === 'dang_duyet' ? a.steps.find((s) => !s.decision) : null),
  canAct(a) { const s = this.current(a), u = Auth.user; return !!(s && u && (u.role === s.role || u.role === 'admin')); },
  summary: (a) => a.steps.map((s) => `${s.order}. ${s.label} ${s.decision === 'da_duyet' ? '✓' : s.decision === 'tu_choi' ? '✗' : '…'}`).join(' · '),
  decide(a, ok, comment = '') {
    const s = this.current(a);
    if (!s) return Toast.err('Chứng từ đã được xử lý xong');
    if (!this.canAct(a)) return Toast.err(`Bước "${s.label}" do ${(CONFIG.roles[s.role] || [s.role])[0]} duyệt`);
    Object.assign(s, { decision: ok ? 'da_duyet' : 'tu_choi', by: Auth.user.name, at: new Date().toISOString(), comment });
    if (!ok) a.status = 'tu_choi'; else if (a.steps.every((x) => x.decision === 'da_duyet')) a.status = 'da_duyet';
    SystemAPI.save('approvals'); Audit.log(`${ok ? 'Duyệt' : 'Từ chối'} bước ${s.order} (${s.label})`, `${CONFIG.docTypes[a.docType] || a.docType} ${a.docId}`);
    if (a.status !== 'dang_duyet' && ApprovalDone[a.docType]) ApprovalDone[a.docType](a.docId, a.status === 'da_duyet');
    render(); Toast.ok(a.status === 'dang_duyet' ? `Đã duyệt bước ${s.order}, chuyển bước kế tiếp` : ok ? 'Đã duyệt xong' : 'Đã từ chối');
  },
};

Object.assign(Actions, {
  'compat-new': guard('maintenance.write', () => openCompatForm()), 'compat-save': guard('maintenance.write', saveCompat), 'compat-delete': guard('maintenance.write', (d) => deleteCompat(d.id)),
  'repair-fill-compat': guard('repairs.write', fillCompat),
  'task-open': guard('repairs.write', (d) => openTaskForm(d.repair, d.task)), 'task-save': guard('repairs.write', (d) => saveTask(d.repair, d.task)),
  'equipment-history': (d) => openEquipmentHistory(d.id),
  'approval-approve': (d) => { const a = DB.approvals.find((x) => x.id === d.id); if (a) Approvals.decide(a, true); },
  'approval-reject': (d) => { const a = DB.approvals.find((x) => x.id === d.id); if (a && confirm('Từ chối chứng từ này?')) Approvals.decide(a, false); },
});
