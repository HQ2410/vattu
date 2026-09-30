/* MODULE: SỬA CHỮA & BẢO TRÌ — tab: lệnh sửa chữa / thiết bị / bảo trì định kỳ / nhật ký bảo trì / vật tư tương thích */
const REPAIR_TABS = [['orders', 'Lệnh sửa chữa'], ['equipment', 'Thiết bị'], ['schedules', 'Bảo trì định kỳ'], ['logs', 'Nhật ký bảo trì'], ['compat', 'Vật tư tương thích']];

Views.repairs = function (st) {
  const tab = st.tab || 'orders';
  const action = {
    orders: can('repairs.write', btn('+ Lệnh sửa chữa', 'repair-new', {}, 'primary')) + btn('Xuất CSV', 'export', { kind: 'repairs' }),
    equipment: can('repairs.write', btn('+ Thêm thiết bị', 'equipment-new', {}, 'primary')),
    schedules: can('maintenance.write', btn('+ Lịch bảo trì', 'schedule-new', {}, 'primary')),
    logs: '',
    compat: can('maintenance.write', btn('+ Khai báo tương thích', 'compat-new', {}, 'primary')),
  }[tab];
  return pageHead('Sửa chữa & bảo trì', 'Lệnh sửa chữa, hạng mục công việc, nhật ký và lịch sử thiết bị', action) + tabsBar(REPAIR_TABS, tab) + toolbar('Tìm kiếm…') + repairsTab(tab);
};

const taskProgress = (r) => { const t = r.tasks || []; return t.length ? `${t.filter((x) => ['xong', 'bo_qua'].includes(x.status)).length}/${t.length}` : '—'; };

function repairsTab(tab) {
  if (tab === 'equipment') {
    const rows = DB.equipment.filter((e) => matchQ(e.id, e.name, e.location)).map((e) =>
      `<tr><td>${esc(e.id)}</td><td>${esc(e.name)}</td><td>${esc(e.location || '—')}</td><td>${badge(CONFIG.equipmentStatus, e.status)}</td>
      <td>${btn('Lịch sử', 'equipment-history', { id: e.id }, 'sm')} ${can('repairs.write', btn('Sửa', 'equipment-edit', { id: e.id }, 'sm') + ' ' + btn('Xóa', 'equipment-delete', { id: e.id }, 'sm danger'))}</td></tr>`).join('');
    return tableShell(['Mã', 'Tên thiết bị', 'Vị trí', 'Trạng thái', ''], rows, 'Chưa có thiết bị');
  }
  if (tab === 'schedules') {
    const rows = DB.schedules.filter((s) => matchQ(s.id, s.title, Q.equipmentName(s.equipmentId))).sort((a, b) => a.nextDate.localeCompare(b.nextDate)).map((s) =>
      `<tr><td>${esc(s.id)}</td><td>${esc(Q.equipmentName(s.equipmentId))}</td><td>${esc(s.title)}</td><td class="num">${(s.tasks || []).length}</td><td class="num">${s.intervalDays} ngày</td><td>${fmtDate(s.lastDate)}</td><td>${fmtDate(s.nextDate)}</td><td>${badge(CONFIG.scheduleStatus, Q.scheduleStatus(s))}</td>
      <td>${can('maintenance.write', btn('Tạo lệnh', 'schedule-order', { id: s.id }, 'sm primary') + ' ' + btn('Sửa', 'schedule-edit', { id: s.id }, 'sm') + ' ' + btn('Xóa', 'schedule-delete', { id: s.id }, 'sm danger'))}</td></tr>`).join('');
    return tableShell(['Mã', 'Thiết bị', 'Công việc', '#Hạng mục', '#Chu kỳ', 'Lần cuối', 'Đến hạn', 'Tình trạng', ''], rows, 'Chưa có lịch bảo trì');
  }
  if (tab === 'logs') {
    const rows = DB.maintLogs.filter((l) => matchQ(l.repairId, Q.equipmentName(l.equipmentId), l.action, l.technician)).map((l) =>
      `<tr><td>${fmtDate(l.date)}</td><td>${esc(Q.equipmentName(l.equipmentId))}</td><td>${esc(l.repairId)}</td><td>${esc(l.before || '—')}</td><td>${esc(l.action)}</td><td>${esc(l.after)}</td><td>${esc(l.technician)}</td></tr>`).join('');
    return tableShell(['Ngày', 'Thiết bị', 'Lệnh', 'Tình trạng trước', 'Đã thực hiện', 'Tình trạng sau', 'Kỹ thuật viên'], rows, 'Chưa có nhật ký — được ghi khi hoàn thành lệnh sửa chữa');
  }
  if (tab === 'compat') {
    const rows = DB.compat.filter((c) => matchQ(Q.supplyName(c.supplyId), Q.equipmentName(c.equipmentId))).map((c) =>
      `<tr><td>${esc(Q.equipmentName(c.equipmentId))}</td><td>${esc(Q.supplyName(c.supplyId))}</td><td class="num">${fmtN(c.qty)} ${esc((Q.supply(c.supplyId) || {}).unit || '')}</td><td>${can('maintenance.write', btn('Xóa', 'compat-delete', { id: c.id }, 'sm danger'))}</td></tr>`).join('');
    return '<p class="hint">Vật tư đã khai báo tương thích chỉ được dùng cho các thiết bị trong danh sách; vật tư chưa khai báo được coi là dùng chung.</p>' + tableShell(['Thiết bị', 'Vật tư', '#SL mỗi lần thay', ''], rows, 'Chưa khai báo vật tư tương thích');
  }
  const rows = DB.repairs.filter((r) => matchQ(r.id, r.title, Q.equipmentName(r.equipmentId), r.assignee)).map((r) => {
    const acts = btn('Chi tiết', 'repair-open', { id: r.id }, 'sm') + can('repairs.write',
      r.status === 'moi' ? ' ' + btn('Bắt đầu', 'repair-start', { id: r.id }, 'sm') + ' ' + btn('Hủy', 'repair-cancel', { id: r.id }, 'sm danger')
        : r.status === 'dang_sua' ? ' ' + btn('Hoàn thành', 'repair-complete', { id: r.id }, 'sm primary') : '');
    return `<tr><td>${esc(r.id)}</td><td>${fmtDate(r.date)}</td><td>${esc(Q.equipmentName(r.equipmentId))}</td><td>${esc(r.title)}</td><td>${badge(CONFIG.priority, r.priority)}</td>
      <td>${esc(r.assignee || '—')}</td><td class="num">${taskProgress(r)}</td><td>${badge(CONFIG.repairStatus, r.status)}</td><td class="num">${fmtVND(r.cost || 0)}</td><td>${acts}</td></tr>`;
  }).join('');
  return tableShell(['Mã lệnh', 'Ngày', 'Thiết bị', 'Nội dung', 'Ưu tiên', 'Người sửa', '#Hạng mục', 'Trạng thái', '#Chi phí', ''], rows, 'Chưa có lệnh sửa chữa');
}

function openRepairForm() {
  Modal.open('Lệnh sửa chữa mới',
    field('Thiết bị', 'equipmentId', { required: true, options: DB.equipment.map((e) => [e.id, `${e.id} — ${e.name}`]) }) + field('Nội dung sửa chữa', 'title', { required: true }) +
    `<div class="grid2">${field('Ưu tiên', 'priority', { value: 'trung_binh', options: Object.entries(CONFIG.priority).map(([k, v]) => [k, v[0]]) })}${field('Người thực hiện', 'assignee')}</div>` +
    field('Hạng mục công việc (mỗi dòng một hạng mục, có thể thêm "| số phút")', 'tasks', { type: 'textarea' }) +
    `<b>Vật tư dự kiến</b> ${btn('Nạp vật tư tương thích của thiết bị', 'repair-fill-compat', {}, 'sm')}<p class="hint">Vật tư đã xuất qua yêu cầu gắn lệnh này sẽ không bị trừ kho lần nữa khi hoàn thành.</p>` + linesEditor([]) + field('Ghi chú', 'note', { type: 'textarea' }),
    btn('Hủy', 'modal-close') + btn('Tạo lệnh', 'repair-save', {}, 'primary'), true);
}
function openRepairDetail(id) {
  const r = DB.repairs.find((x) => x.id === id); if (!r) return;
  const tasks = (r.tasks || []).map((t) => `<tr><td>${esc(t.name)}</td><td class="num">${t.minutes || '—'}</td><td>${badge(CONFIG.taskStatus, t.status)}</td><td>${esc(t.result || '—')}</td><td>${esc(t.by || '—')}</td>
    <td>${r.status === 'dang_sua' ? can('repairs.write', btn('Cập nhật', 'task-open', { repair: r.id, task: t.id }, 'sm')) : ''}</td></tr>`).join('');
  const usage = DB.usage.filter((u) => u.repairId === id), used = usage.length ? usage : DB.issues.filter((i) => i.repairId === id).map((i) => ({ supplyId: i.supplyId, qty: i.qty, unitCost: i.price, reason: '' }));
  const usedRows = used.map((u) => `<tr><td>${esc(Q.supplyName(u.supplyId))}</td><td class="num">${fmtN(u.qty)}</td><td class="num">${fmtVND(u.qty * (u.unitCost || 0))}</td><td>${esc(u.reason || '—')}</td></tr>`).join('');
  const log = DB.maintLogs.find((l) => l.repairId === id);
  const meta = [['Thiết bị', esc(Q.equipmentName(r.equipmentId))], ['Ngày tạo', fmtDate(r.date)], ['Trạng thái', badge(CONFIG.repairStatus, r.status)], ['Người thực hiện', esc(r.assignee || '—')], ['Vật tư dự kiến', esc(Q.linesText(r.lines))], ['Ghi chú', esc(r.note || '—')],
    ...(log ? [['Tình trạng trước', esc(log.before || '—')], ['Tình trạng sau', esc(log.after)]] : [])];
  Modal.open(`${r.id} — ${r.title}`, `<div class="grid2">${meta.map(([k, v]) => `<div class="fld"><label>${esc(k)}</label><div>${v}</div></div>`).join('')}</div>` +
    '<b>Hạng mục công việc</b>' + tableShell(['Hạng mục', '#Phút', 'Trạng thái', 'Kết quả', 'Người làm', ''], tasks, 'Lệnh không có hạng mục') +
    '<b>Vật tư đã dùng</b>' + tableShell(['Vật tư', '#SL', '#Thành tiền', 'Lý do thay thế'], usedRows, 'Chưa xuất vật tư nào'), btn('Đóng', 'modal-close'), true);
}
function openTaskForm(repairId, taskId) {
  const r = DB.repairs.find((x) => x.id === repairId), t = r && (r.tasks || []).find((x) => x.id === taskId); if (!t) return;
  Modal.open('Cập nhật hạng mục: ' + t.name, field('Trạng thái', 'status', { value: t.status, options: Object.entries(CONFIG.taskStatus).map(([k, v]) => [k, v[0]]) }) + field('Kết quả thực hiện', 'result', { type: 'textarea', value: t.result }),
    btn('Hủy', 'modal-close') + btn('Lưu', 'task-save', { repair: repairId, task: taskId }, 'primary'));
}
function openCompleteForm(id) {
  const r = DB.repairs.find((x) => x.id === id); if (!r || r.status !== 'dang_sua') return;
  const p = pendingTasks(r); if (p.length) return Toast.err(`Còn ${p.length} hạng mục chưa hoàn tất — cập nhật trong "Chi tiết" trước`);
  Modal.open('Hoàn thành ' + r.id, '<p class="hint">Thông tin dưới đây được ghi vào nhật ký bảo trì của thiết bị.</p>' + field('Tình trạng trước bảo trì', 'before', { type: 'textarea' }) + field('Công việc đã thực hiện', 'action', { type: 'textarea', required: true }) +
    field('Tình trạng sau bảo trì', 'after', { type: 'textarea', required: true }) + field('Lý do thay thế vật tư (nếu có)', 'reason'), btn('Hủy', 'modal-close') + btn('Hoàn thành & ghi nhật ký', 'repair-complete-save', { id }, 'primary'));
}
function openEquipmentHistory(id) {
  const e = Q.equipment(id); if (!e) return;
  const reps = DB.repairs.filter((r) => r.equipmentId === id), done = reps.filter((r) => r.status === 'hoan_thanh'), logs = DB.maintLogs.filter((l) => l.equipmentId === id);
  const rows = logs.map((l) => `<tr><td>${fmtDate(l.date)}</td><td>${esc(l.repairId)}</td><td>${esc(l.action)}</td><td>${esc(l.after)}</td><td>${esc(l.technician)}</td></tr>`).join('');
  Modal.open('Lịch sử: ' + e.name, `<div class="kpis">${kpi('Số lệnh sửa', fmtN(reps.length))}${kpi('Đã hoàn thành', fmtN(done.length))}${kpi('Tổng chi phí', fmtVND(done.reduce((t, r) => t + (r.cost || 0), 0)))}</div>` +
    tableShell(['Ngày', 'Lệnh', 'Đã thực hiện', 'Tình trạng sau', 'Kỹ thuật viên'], rows, 'Chưa có nhật ký bảo trì'), btn('Đóng', 'modal-close'), true);
}
function openEquipmentForm(id) {
  const e = id ? Q.equipment(id) : {};
  Modal.open(id ? 'Sửa thiết bị' : 'Thêm thiết bị',
    field('Tên thiết bị', 'name', { value: e.name, required: true }) + field('Vị trí', 'location', { value: e.location }) +
    field('Trạng thái', 'status', { value: e.status || 'hoat_dong', options: Object.entries(CONFIG.equipmentStatus).map(([k, v]) => [k, v[0]]) }),
    btn('Hủy', 'modal-close') + btn('Lưu', 'equipment-save', { id: id || '' }, 'primary'));
}
function openScheduleForm(id) {
  const s = id ? DB.schedules.find((x) => x.id === id) : {};
  Modal.open(id ? 'Sửa lịch bảo trì' : 'Thêm lịch bảo trì',
    field('Thiết bị', 'equipmentId', { required: true, value: s.equipmentId, options: DB.equipment.map((e) => [e.id, e.name]) }) + field('Công việc bảo trì', 'title', { value: s.title, required: true }) +
    field('Hạng mục (mỗi dòng một hạng mục, có thể thêm "| số phút")', 'tasks', { type: 'textarea', value: tasksToText(s.tasks) }) +
    `<div class="grid2">${field('Chu kỳ (ngày)', 'intervalDays', { type: 'number', value: s.intervalDays ?? 30, required: true, attrs: 'min="1"' })}${field('Lần bảo trì gần nhất', 'lastDate', { type: 'date', value: s.lastDate || today() })}</div>`,
    btn('Hủy', 'modal-close') + btn('Lưu', 'schedule-save', { id: id || '' }, 'primary'), true);
}
function openCompatForm() {
  Modal.open('Khai báo vật tư tương thích', field('Thiết bị', 'equipmentId', { required: true, options: DB.equipment.map((e) => [e.id, e.name]) }) + field('Vật tư', 'supplyId', { required: true, options: DB.supplies.map((s) => [s.id, `${s.name} (${s.unit})`]) }) +
    field('Số lượng mỗi lần thay', 'qty', { type: 'number', value: 1, required: true, attrs: 'min="0.01" step="any"' }), btn('Hủy', 'modal-close') + btn('Lưu', 'compat-save', {}, 'primary'));
}
