/* MODULE: DASHBOARD */
Views.dashboard = function () {
  const month = today().slice(0, 7);
  const low = Q.lowStock(), overdue = Q.overdueSchedules();
  const open = DB.repairs.filter((r) => ['moi', 'dang_sua'].includes(r.status));
  const pending = Q.pendingApproval().length + Q.pendingIssue().length;
  const cost = DB.repairs.filter((r) => r.status === 'hoan_thanh' && (r.doneDate || '').startsWith(month)).reduce((t, r) => t + (r.cost || 0), 0);
  const lowRows = low.map((s) => `<tr><td>${esc(s.id)}</td><td>${esc(s.name)}</td><td class="num">${fmtN(s.stock)} ${esc(s.unit)}</td><td class="num">${fmtN(s.minStock)}</td></tr>`).join('');
  const dueRows = overdue.map((s) => `<tr><td>${esc(Q.equipmentName(s.equipmentId))}</td><td>${esc(s.title)}</td><td>${fmtDate(s.nextDate)}</td></tr>`).join('');
  const repRows = open.slice(0, 8).map((r) => `<tr><td>${esc(r.id)}</td><td>${esc(Q.equipmentName(r.equipmentId))}</td><td>${esc(r.title)}</td><td>${badge(CONFIG.repairStatus, r.status)}</td></tr>`).join('');
  return `<div class="kpis">
    ${kpi('Loại vật tư', fmtN(DB.supplies.length))}
    ${kpi('Dưới định mức', fmtN(low.length), low.length ? 'bad' : '')}
    ${kpi('Yêu cầu cần xử lý', fmtN(pending), pending ? 'warn' : '')}
    ${kpi('Bảo trì quá hạn', fmtN(overdue.length), overdue.length ? 'bad' : '')}
    ${kpi('Cần đặt hàng', fmtN(Q.reorderNeeds().length), Q.reorderNeeds().length ? 'warn' : '')}
    ${kpi('Lô sắp hết hạn (30 ngày)', fmtN(Q.expiringLots().length), Q.expiringLots().length ? 'bad' : '')}
    ${kpi('Lệnh sửa đang mở', fmtN(open.length))}
    ${kpi('Chi phí sửa tháng này', fmtVND(cost))}
    ${kpi('Cảnh báo AI mức cao', fmtN(Q.openAlerts('cao').length), Q.openAlerts('cao').length ? 'bad' : '')}
    ${kpi('Khuyến nghị AI chờ xem xét', fmtN(Q.pendingRecommendations().length), Q.pendingRecommendations().length ? 'warn' : '')}
  </div>
  <div class="card"><h3>Vật tư dưới định mức tồn</h3>${tableShell(['Mã', 'Tên vật tư', '#Tồn', '#Định mức'], lowRows, 'Không có vật tư nào thiếu')}</div>
  <div class="card"><h3>Lô hàng sắp hết hạn</h3>${tableShell(['Vật tư', 'Kho', 'Lô', 'Hạn dùng', '#Tồn'], Q.expiringLots().map((x) => `<tr><td>${esc(Q.supplyName(x.b.supplyId))}</td><td>${esc(Q.warehouseName(x.b.warehouseId))}</td><td>${esc(x.l.lotNumber)}</td><td>${expiryBadge(x.l)}</td><td class="num">${fmtN(x.b.qty)}</td></tr>`).join(''), 'Không có lô nào sắp hết hạn')}</div>
  <div class="card"><h3>Bảo trì quá hạn</h3>${tableShell(['Thiết bị', 'Công việc', 'Đến hạn'], dueRows, 'Không có lịch nào quá hạn')}</div>
  <div class="card"><h3>Lệnh sửa chữa đang mở</h3>${tableShell(['Mã', 'Thiết bị', 'Nội dung', 'Trạng thái'], repRows, 'Không có lệnh sửa nào đang mở')}</div>
  <div class="card"><h3>Cảnh báo AI chưa xử lý</h3>${tableShell(['Loại', 'Mức độ', 'Nội dung'], Q.openAlerts().slice(0, 8).map((a) => `<tr><td>${esc(CONFIG.alertType[a.type] || a.type)}</td><td>${badge(CONFIG.alertSeverity, a.severity)}</td><td>${esc(a.message)}</td></tr>`).join(''), 'Không có cảnh báo — vào "Dự báo & AI" để chạy kiểm tra')}</div>`;
};
