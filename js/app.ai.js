/* LOGIC: DỰ BÁO NHU CẦU, KHUYẾN NGHỊ, CẢNH BÁO
 * Đây KHÔNG phải một dịch vụ AI/ML thật — toàn bộ phần "AI" là một mô hình thống kê minh bạch,
 * tính toán ngay trong trình duyệt từ lịch sử xuất kho: trung bình theo tuần + hồi quy tuyến tính
 * đơn giản (bình phương tối thiểu) để suy ra xu hướng, không gọi bất kỳ dịch vụ bên ngoài nào.
 * Vì đây là ứng dụng tĩnh (không có tiến trình chạy nền), người có quyền bấm "Chạy dự báo & cảnh báo"
 * để tính lại — giống một tác vụ định kỳ (cron) chạy thủ công. */

/* ---------- Dự báo nhu cầu: trung bình trượt theo tuần + hồi quy tuyến tính ---------- */
const AI_HISTORY_DAYS = 84; // 12 tuần lịch sử xuất kho dùng để tính dự báo

/** Gộp lịch sử xuất kho của (supplyId, warehouseId) trong AI_HISTORY_DAYS ngày gần nhất thành các tuần (tuần 0 = xa nhất). */
function weeklyUsage(supplyId, warehouseId) {
  const since = addDays(today(), -AI_HISTORY_DAYS);
  const rows = DB.issues.filter((i) => i.supplyId === supplyId && i.warehouseId === warehouseId && i.date >= since);
  const weeks = Array(12).fill(0);
  rows.forEach((i) => {
    const dayIdx = Math.floor((new Date(i.date) - new Date(since)) / 86400000);
    const w = Math.min(11, Math.max(0, Math.floor(dayIdx / 7)));
    weeks[w] += i.qty;
  });
  return { weeks, firstIssueDate: rows.length ? rows.map((r) => r.date).sort()[0] : null };
}
/** Hồi quy tuyến tính bình phương tối thiểu: y = a + b·x trên các điểm (0..n-1, weeks[i]) */
function linearRegression(weeks) {
  const n = weeks.length, xs = weeks.map((_, i) => i);
  const sx = xs.reduce((t, x) => t + x, 0), sy = weeks.reduce((t, y) => t + y, 0);
  const sxx = xs.reduce((t, x) => t + x * x, 0), sxy = xs.reduce((t, x, i) => t + x * weeks[i], 0);
  const denom = n * sxx - sx * sx;
  const b = denom ? (n * sxy - sx * sy) / denom : 0;
  const a = (sy - b * sx) / n;
  return { a, b };
}
/** Tính dự báo cho (supplyId, warehouseId) trong horizonDays tới. Trả về null nếu vật tư/kho không hợp lệ. */
function computeForecast(supplyId, warehouseId, horizonDays = 30) {
  const s = Q.supply(supplyId); if (!s) return null;
  const { weeks, firstIssueDate } = weeklyUsage(supplyId, warehouseId);
  const weeksWithData = weeks.filter((w) => w > 0).length;
  const total = weeks.reduce((t, w) => t + w, 0);
  const { a, b } = linearRegression(weeks);
  const horizonWeeks = horizonDays / 7;
  // Dự báo = tổng các tuần tương lai theo xu hướng tuyến tính, không cho âm; tối thiểu bằng trung bình phẳng nếu xu hướng bất định.
  let predicted = 0;
  for (let w = 12; w < 12 + horizonWeeks; w++) predicted += Math.max(0, a + b * w);
  const flatAvg = (total / 12) * horizonWeeks;
  if (weeksWithData < 2) predicted = flatAvg; // quá ít dữ liệu để tin xu hướng hồi quy
  const dailyRate = predicted / horizonDays;
  const trend = b > 0.05 ? 'tang' : b < -0.05 ? 'giam' : 'on_dinh';
  const confidence = weeksWithData >= 8 ? 'cao' : weeksWithData >= 3 ? 'trung_binh' : 'thap';
  return { supplyId, warehouseId, forecastDate: today(), horizonDays, predictedQuantity: Math.round(predicted * 100) / 100, dailyRate, trend, confidence, weeks, firstIssueDate, modelVersion: CONFIG.aiModelVersion };
}
function upsertForecast(f) {
  const idx = DB.forecasts.findIndex((x) => x.supplyId === f.supplyId && x.warehouseId === f.warehouseId);
  const rec = { id: idx >= 0 ? DB.forecasts[idx].id : uid('DB'), ...f };
  if (idx >= 0) DB.forecasts[idx] = rec; else DB.forecasts.push(rec);
  return rec;
}

/* ---------- Khuyến nghị: đặt hàng sớm theo xu hướng, điều chỉnh định mức, vật tư tồn đọng ---------- */
const findRec = (id, status) => { const r = DB.recommendations.find((x) => x.id === id); return r && (!status || r.status === status) ? r : null; };
function upsertRecommendation(rec) {
  const norm = { supplyId: '', warehouseId: '', ...rec }; // chuẩn hóa trường vắng mặt để so khớp nhất quán giữa các lần chạy
  const idx = DB.recommendations.findIndex((x) => x.type === norm.type && x.supplyId === norm.supplyId && x.warehouseId === norm.warehouseId && x.status === 'cho_duyet');
  if (idx >= 0) { Object.assign(DB.recommendations[idx], norm); return DB.recommendations[idx]; } // cập nhật lý do/số liệu mới nếu đã có đề xuất cùng loại đang chờ
  const r = { id: uid('KN'), status: 'cho_duyet', createdAt: new Date().toISOString(), ...norm };
  DB.recommendations.unshift(r); return r;
}
function buildRecommendations() {
  const openLines = new Set(DB.purchaseRequests.filter((r) => ['cho_duyet', 'da_duyet'].includes(r.status)).flatMap((r) => r.lines.map((l) => r.warehouseId + '|' + l.supplyId)));
  DB.reorderRules.forEach((rule) => {
    const f = DB.forecasts.find((x) => x.supplyId === rule.supplyId && x.warehouseId === rule.warehouseId);
    if (!f) return;
    const cur = Q.whQty(rule.supplyId, rule.warehouseId);
    // (1) Đặt hàng sớm: dự báo cho thấy tồn sẽ chạm điểm đặt lại trong vòng lead time tới, dù CHƯA chạm ngưỡng vật lý.
    if (!openLines.has(rule.warehouseId + '|' + rule.supplyId) && f.dailyRate > 0 && cur > rule.reorderPoint) {
      const daysToReorderPoint = (cur - rule.reorderPoint) / f.dailyRate;
      if (daysToReorderPoint <= rule.leadTime) {
        const qty = Math.max(0, Math.round((rule.max - cur) + f.dailyRate * rule.leadTime));
        if (qty > 0) upsertRecommendation({ type: 'dat_hang', supplyId: rule.supplyId, warehouseId: rule.warehouseId,
          reason: `Theo xu hướng tiêu hao, tồn sẽ chạm điểm đặt lại (${fmtN(rule.reorderPoint)}) sau khoảng ${Math.round(daysToReorderPoint)} ngày — trong khi thời gian giao hàng là ${rule.leadTime} ngày.`,
          evidence: { dailyRate: f.dailyRate, daysToReorderPoint: Math.round(daysToReorderPoint), leadTime: rule.leadTime, confidence: f.confidence },
          currentValue: { stock: cur }, proposedValue: { qty } });
      }
    }
    // (2) Điều chỉnh định mức: mức tiêu hao thực tế lệch hẳn so với định mức đang khai báo (±40%).
    const impliedMonthly = (rule.max - rule.reorderPoint); // lượng đặt mỗi lần theo định mức hiện tại, quy ước là nhu cầu ~1 chu kỳ
    const actualMonthly = f.dailyRate * 30;
    if (f.confidence !== 'thap' && impliedMonthly > 0 && Math.abs(actualMonthly - impliedMonthly) / impliedMonthly > 0.4) {
      const newReorderPoint = Math.max(1, Math.ceil(f.dailyRate * rule.leadTime + rule.safety));
      const newMax = newReorderPoint + Math.ceil(f.dailyRate * 14);
      const newMin = Math.max(1, Math.ceil(f.dailyRate * 3));
      if (newReorderPoint !== rule.reorderPoint || newMax !== rule.max) {
        upsertRecommendation({ type: 'dieu_chinh_dinh_muc', supplyId: rule.supplyId, warehouseId: rule.warehouseId,
          reason: `Tiêu hao thực tế ~${fmtN(Math.round(actualMonthly))}/tháng, ${actualMonthly > impliedMonthly ? 'cao hơn' : 'thấp hơn'} nhiều so với định mức hiện tại (điểm đặt lại ${fmtN(rule.reorderPoint)}, tối đa ${fmtN(rule.max)}).`,
          evidence: { actualMonthly: Math.round(actualMonthly), impliedMonthly, confidence: f.confidence },
          currentValue: { min: rule.min, reorderPoint: rule.reorderPoint, max: rule.max }, proposedValue: { min: newMin, reorderPoint: newReorderPoint, max: newMax } });
      }
    }
    // (3) Vật tư tồn đọng: còn tồn nhưng không phát sinh xuất kho suốt lịch sử theo dõi.
    if (cur > 0 && f.weeks.every((w) => w === 0) && !f.firstIssueDate) {
      upsertRecommendation({ type: 'ton_dong', supplyId: rule.supplyId, warehouseId: rule.warehouseId,
        reason: `Không phát sinh xuất kho trong ${AI_HISTORY_DAYS} ngày qua dù đang tồn ${fmtN(cur)} ${Q.supply(rule.supplyId).unit}. Cân nhắc giảm định mức tối đa để giảm vốn tồn kho.`,
        evidence: { idleDays: AI_HISTORY_DAYS, stock: cur, stockValue: cur * Q.supply(rule.supplyId).price },
        currentValue: { max: rule.max }, proposedValue: { max: rule.reorderPoint } });
    }
  });
}
function applyRecommendation(id) {
  const r = findRec(id, 'cho_duyet'); if (!r) return;
  if (r.type === 'dat_hang') {
    createPR({ warehouseId: r.warehouseId, priority: 'cao', lines: [{ supplyId: r.supplyId, qty: r.proposedValue.qty }] });
  } else if (r.type === 'dieu_chinh_dinh_muc' || r.type === 'ton_dong') {
    const rule = DB.reorderRules.find((x) => x.supplyId === r.supplyId && x.warehouseId === r.warehouseId);
    if (!rule) return Toast.err('Quy tắc đặt hàng không còn tồn tại');
    const before = { ...rule }; Object.assign(rule, r.proposedValue);
    PurchaseAPI.save('reorderRules'); Audit.change('Áp dụng khuyến nghị AI: điều chỉnh quy tắc đặt hàng', Q.supplyName(r.supplyId), before, rule);
  }
  r.status = 'ap_dung'; r.reviewedBy = Auth.user.name; r.reviewedAt = new Date().toISOString();
  AiAPI.save('recommendations'); Audit.log('Áp dụng khuyến nghị AI', `${CONFIG.recommendationType[r.type]}: ${Q.supplyName(r.supplyId)}`); render(); Toast.ok('Đã áp dụng khuyến nghị');
}
function dismissRecommendation(id) {
  const r = findRec(id, 'cho_duyet'); if (!r) return;
  r.status = 'bo_qua'; r.reviewedBy = Auth.user.name; r.reviewedAt = new Date().toISOString();
  AiAPI.save('recommendations'); Audit.log('Bỏ qua khuyến nghị AI', `${CONFIG.recommendationType[r.type]}: ${Q.supplyName(r.supplyId)}`); render(); Toast.ok('Đã bỏ qua khuyến nghị');
}

/* ---------- Cảnh báo ---------- */
function upsertAlert(a) {
  const norm = { supplyId: '', equipmentId: '', warehouseId: '', ...a }; // chuẩn hóa trường vắng mặt về '' để so khớp nhất quán giữa các lần chạy
  const idx = DB.alerts.findIndex((x) => x.type === norm.type && x.supplyId === norm.supplyId && x.warehouseId === norm.warehouseId && x.equipmentId === norm.equipmentId && x.status === 'moi');
  if (idx >= 0) { Object.assign(DB.alerts[idx], norm, { updatedAt: new Date().toISOString() }); return DB.alerts[idx]; }
  const al = { id: uid('CB'), status: 'moi', createdAt: new Date().toISOString(), ...norm };
  DB.alerts.unshift(al); return al;
}
function buildAlerts() {
  // (1) Tồn thấp: đã có ở quy tắc đặt hàng (giai đoạn 2), nay hình thức hóa thành cảnh báo có mức độ.
  DB.reorderRules.forEach((rule) => {
    const cur = Q.whQty(rule.supplyId, rule.warehouseId);
    if (cur <= rule.reorderPoint) {
      const severity = cur <= rule.min ? 'cao' : 'trung_binh';
      upsertAlert({ type: 'ton_thap', severity, supplyId: rule.supplyId, warehouseId: rule.warehouseId,
        message: `${Q.supplyName(rule.supplyId)} tại ${Q.warehouseName(rule.warehouseId)} còn ${fmtN(cur)}, đã chạm hoặc dưới điểm đặt lại (${fmtN(rule.reorderPoint)}).` });
    }
  });
  // (2) Hạn dùng: lô đã hết hạn hoặc sắp hết hạn trong 30 ngày.
  Q.expiringLots(30).forEach(({ b, l }) => {
    const severity = l.expiry < today() ? 'cao' : l.expiry <= addDays(today(), 7) ? 'cao' : 'trung_binh';
    upsertAlert({ type: 'het_han', severity, supplyId: b.supplyId, warehouseId: b.warehouseId,
      message: `Lô ${l.lotNumber} của ${Q.supplyName(b.supplyId)} tại ${Q.warehouseName(b.warehouseId)} ${l.expiry < today() ? 'đã hết hạn' : 'sắp hết hạn'} (${fmtDate(l.expiry)}), còn ${fmtN(b.qty)}.` });
  });
  // (3) Tiêu hao bất thường: tuần gần nhất cao vượt trội so với trung bình các tuần trước, đủ dữ liệu để so sánh.
  DB.forecasts.forEach((f) => {
    if (f.confidence === 'thap' || !f.weeks) return;
    const last = f.weeks[11], priorAvg = f.weeks.slice(0, 11).reduce((t, w) => t + w, 0) / 11;
    if (priorAvg > 0 && last >= priorAvg * 2) {
      upsertAlert({ type: 'bat_thuong', severity: last >= priorAvg * 3 ? 'cao' : 'trung_binh', supplyId: f.supplyId, warehouseId: f.warehouseId,
        message: `${Q.supplyName(f.supplyId)} tại ${Q.warehouseName(f.warehouseId)} tiêu hao tuần gần nhất (${fmtN(last)}) cao gấp ${(last / priorAvg).toFixed(1)} lần trung bình ${11} tuần trước (${fmtN(Math.round(priorAvg))}).` });
    }
  });
  // (4) Thiết bị hỏng lặp lại: nhiều lệnh sửa chữa hoàn thành trong 60 ngày gần đây.
  const since = addDays(today(), -60);
  DB.equipment.forEach((e) => {
    const n = DB.repairs.filter((r) => r.equipmentId === e.id && r.status === 'hoan_thanh' && r.doneDate >= since).length;
    if (n >= 3) upsertAlert({ type: 'thiet_bi_hong_lap_lai', severity: n >= 5 ? 'cao' : 'trung_binh', equipmentId: e.id,
      message: `${e.name} đã có ${n} lệnh sửa chữa hoàn thành trong 60 ngày gần đây — có thể là hỏng hóc lặp lại, nên kiểm tra nguyên nhân gốc.` });
  });
}
function resolveAlert(id) {
  const a = DB.alerts.find((x) => x.id === id); if (!a || a.status !== 'moi') return;
  const allowed = Auth.can('ai.manage') || (a.type === 'thiet_bi_hong_lap_lai' && Auth.can('maintenance.write'));
  if (!allowed) return Toast.err('Bạn không có quyền xử lý cảnh báo này');
  a.status = 'da_xu_ly'; a.resolvedBy = Auth.user.name; a.resolvedAt = new Date().toISOString();
  AiAPI.save('alerts'); Audit.log('Xử lý cảnh báo', `${CONFIG.alertType[a.type]}: ${a.message}`); render(); Toast.ok('Đã đánh dấu xử lý');
}

/* ---------- Chạy toàn bộ: dự báo mọi (vật tư, kho) có quy tắc đặt hàng, rồi sinh khuyến nghị và cảnh báo ---------- */
function runAiEngine() {
  DB.reorderRules.forEach((rule) => { const f = computeForecast(rule.supplyId, rule.warehouseId, rule.leadTime || 30); if (f) upsertForecast(f); });
  buildRecommendations(); buildAlerts();
  AiAPI.save('forecasts'); AiAPI.save('recommendations'); AiAPI.save('alerts');
  Audit.log('Chạy dự báo & cảnh báo AI', `${DB.forecasts.length} dự báo, ${DB.recommendations.filter((r) => r.status === 'cho_duyet').length} khuyến nghị chờ xem xét, ${DB.alerts.filter((a) => a.status === 'moi').length} cảnh báo mới`);
  render(); Toast.ok('Đã cập nhật dự báo, khuyến nghị và cảnh báo');
}

Object.assign(Actions, {
  'ai-run': guard('ai.manage', runAiEngine),
  'rec-apply': guard('ai.manage', (d) => applyRecommendation(d.id)),
  'rec-dismiss': guard('ai.manage', (d) => dismissRecommendation(d.id)),
  'alert-resolve': (d) => resolveAlert(d.id),
});
