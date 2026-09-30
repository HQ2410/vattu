/* MODULE: BÁO CÁO — tồn kho, tiêu hao và chi phí sửa chữa theo khoảng ngày */
Views.reports = function () {
  const stockRows = DB.supplies.map((s) => `<tr><td>${esc(s.name)}</td><td class="num">${fmtN(s.stock)} ${esc(s.unit)}</td><td class="num">${fmtVND(s.stock * s.price)}</td></tr>`).join('');
  const used = {};
  DB.issues.filter((i) => inRange(i.date)).forEach((i) => { const u = used[i.supplyId] || (used[i.supplyId] = { q: 0, v: 0 }); u.q += Number(i.qty); u.v += Number(i.qty) * (i.price || 0); });
  const usedRows = Object.entries(used).sort((a, b) => b[1].v - a[1].v).map(([id, u]) => `<tr><td>${esc(Q.supplyName(id))}</td><td class="num">${fmtN(u.q)}</td><td class="num">${fmtVND(u.v)}</td></tr>`).join('');
  const cost = {};
  DB.repairs.filter((r) => r.status === 'hoan_thanh' && inRange(r.doneDate || '')).forEach((r) => { const c = cost[r.equipmentId] || (cost[r.equipmentId] = { n: 0, v: 0 }); c.n++; c.v += r.cost || 0; });
  const costRows = Object.entries(cost).sort((a, b) => b[1].v - a[1].v).map(([id, c]) => `<tr><td>${esc(Q.equipmentName(id))}</td><td class="num">${c.n}</td><td class="num">${fmtVND(c.v)}</td></tr>`).join('');
  const totalUsed = Object.values(used).reduce((t, u) => t + u.v, 0), totalCost = Object.values(cost).reduce((t, c) => t + c.v, 0);
  return pageHead('Báo cáo', 'Lọc theo khoảng ngày cho phần tiêu hao và chi phí sửa chữa', btn('Xuất CSV tồn kho', 'export', { kind: 'stock' }) + btn('Xuất CSV chi phí sửa', 'export', { kind: 'repairs' })) +
    `<div class="toolbar"><label>Từ ngày <input type="date" data-f="from" value="${esc(State.from)}"></label><label>Đến ngày <input type="date" data-f="to" value="${esc(State.to)}"></label></div>
    <div class="kpis">${kpi('Giá trị tồn kho', fmtVND(Q.inventoryValue()))}${kpi('Giá trị vật tư đã xuất', fmtVND(totalUsed))}${kpi('Chi phí sửa chữa', fmtVND(totalCost))}</div>
    <div class="card"><h3>Tồn kho hiện tại</h3>${tableShell(['Vật tư', '#Tồn', '#Giá trị'], stockRows)}</div>
    <div class="card"><h3>Vật tư đã tiêu hao</h3>${tableShell(['Vật tư', '#Tổng xuất', '#Giá trị'], usedRows, 'Không có phiếu xuất trong khoảng này')}</div>
    <div class="card"><h3>Chi phí sửa chữa theo thiết bị</h3>${tableShell(['Thiết bị', '#Số lệnh', '#Chi phí'], costRows, 'Không có lệnh hoàn thành trong khoảng này')}</div>`;
};
