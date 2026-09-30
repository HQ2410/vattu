/* MODULE: DỰ BÁO & AI — tab: dự báo nhu cầu / khuyến nghị / cảnh báo */
const AI_TABS = [['forecasts', 'Dự báo nhu cầu'], ['recommendations', 'Khuyến nghị'], ['alerts', 'Cảnh báo']];

Views.ai = function (st) {
  const tab = st.tab || 'forecasts';
  return pageHead('Dự báo & AI', 'Dự báo nhu cầu, khuyến nghị và cảnh báo tính từ lịch sử xuất kho', can('ai.manage', btn('Chạy dự báo & cảnh báo', 'ai-run', {}, 'primary'))) +
    '<p class="hint">Đây là mô hình thống kê minh bạch (trung bình trượt + hồi quy tuyến tính) tính ngay trong trình duyệt từ lịch sử xuất kho, không gọi dịch vụ AI bên ngoài. Vì ứng dụng không có tiến trình chạy nền, hãy bấm "Chạy dự báo & cảnh báo" để cập nhật.</p>' +
    tabsBar(AI_TABS, tab) + toolbar('Tìm kiếm…') + aiTab(tab);
};

function sparkline(weeks) {
  if (!weeks || !weeks.length) return '';
  const max = Math.max(1, ...weeks), w = 120, h = 28, step = w / (weeks.length - 1);
  const pts = weeks.map((v, i) => `${(i * step).toFixed(1)},${(h - (v / max) * h).toFixed(1)}`).join(' ');
  return `<svg width="${w}" height="${h}" class="spark" viewBox="0 0 ${w} ${h}"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`;
}
const trendLabel = { tang: '↑ Tăng', giam: '↓ Giảm', on_dinh: '→ Ổn định' };

function aiTab(tab) {
  if (tab === 'recommendations') {
    const rows = DB.recommendations.filter((r) => matchQ(Q.supplyName(r.supplyId), CONFIG.recommendationType[r.type], r.reason)).map((r) =>
      `<tr><td>${esc(CONFIG.recommendationType[r.type] || r.type)}</td><td>${esc(Q.supplyName(r.supplyId))}</td><td>${esc(Q.warehouseName(r.warehouseId))}</td><td style="white-space:normal;max-width:320px">${esc(r.reason)}</td><td>${badge(CONFIG.recommendationStatus, r.status)}</td>
      <td>${r.status === 'cho_duyet' ? can('ai.manage', btn('Áp dụng', 'rec-apply', { id: r.id }, 'sm primary') + ' ' + btn('Bỏ qua', 'rec-dismiss', { id: r.id }, 'sm')) : esc(r.reviewedBy || '—')}</td></tr>`).join('');
    return tableShell(['Loại', 'Vật tư', 'Kho', 'Lý do', 'Trạng thái', ''], rows, 'Chưa có khuyến nghị — bấm "Chạy dự báo & cảnh báo" để tạo');
  }
  if (tab === 'alerts') {
    const rows = DB.alerts.filter((a) => matchQ(CONFIG.alertType[a.type], a.message, Q.supplyName(a.supplyId), Q.equipmentName(a.equipmentId))).map((a) =>
      `<tr><td>${esc(CONFIG.alertType[a.type] || a.type)}</td><td>${badge(CONFIG.alertSeverity, a.severity)}</td><td style="white-space:normal;max-width:360px">${esc(a.message)}</td><td>${fmtTime(a.createdAt)}</td><td>${badge(CONFIG.alertStatus, a.status)}</td>
      <td>${a.status === 'moi' ? btn('Đánh dấu đã xử lý', 'alert-resolve', { id: a.id }, 'sm primary') : esc(a.resolvedBy || '—')}</td></tr>`).join('');
    return tableShell(['Loại', 'Mức độ', 'Nội dung', 'Thời điểm', 'Trạng thái', ''], rows, 'Chưa có cảnh báo — bấm "Chạy dự báo & cảnh báo" để kiểm tra');
  }
  const rows = DB.forecasts.filter((f) => matchQ(Q.supplyName(f.supplyId), Q.warehouseName(f.warehouseId))).map((f) =>
    `<tr><td>${esc(Q.supplyName(f.supplyId))}</td><td>${esc(Q.warehouseName(f.warehouseId))}</td><td class="num">${fmtN(Q.whQty(f.supplyId, f.warehouseId))}</td>
    <td class="num">${fmtN(f.predictedQuantity)} ${esc((Q.supply(f.supplyId) || {}).unit || '')} / ${f.horizonDays} ngày</td><td>${esc(trendLabel[f.trend] || f.trend)}</td><td>${badge(CONFIG.forecastConfidence, f.confidence)}</td><td>${sparkline(f.weeks)}</td><td>${fmtDate(f.forecastDate)}</td></tr>`).join('');
  return tableShell(['Vật tư', 'Kho', '#Tồn hiện tại', '#Dự báo nhu cầu', 'Xu hướng', 'Độ tin cậy', '12 tuần gần nhất', 'Cập nhật'], rows, 'Chưa có dự báo — bấm "Chạy dự báo & cảnh báo" để tính');
}
