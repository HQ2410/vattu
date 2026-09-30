/* MODULE: KHO & LÔ HÀNG — tab: tồn theo kho/lô / kho & vị trí / chuyển kho / quy đổi đơn vị */
const WAREHOUSE_TABS = [['stock', 'Tồn theo kho & lô'], ['warehouses', 'Kho & vị trí'], ['transfers', 'Chuyển kho'], ['units', 'Quy đổi đơn vị']];

Views.warehouse = function (st) {
  const tab = st.tab || 'stock';
  const action = { stock: '', warehouses: can('supplies.write', btn('+ Vị trí', 'location-new') + btn('+ Kho', 'warehouse-new', {}, 'primary')),
    transfers: can('supplies.write', btn('+ Phiếu chuyển kho', 'transfer-new', {}, 'primary')), units: can('supplies.write', btn('+ Quy đổi', 'conversion-new', {}, 'primary')) }[tab];
  return pageHead('Kho & lô hàng', 'Tồn theo kho, vị trí, lô và hạn dùng', action) + tabsBar(WAREHOUSE_TABS, tab) + toolbar('Tìm kiếm…') + warehouseTab(tab);
};

function expiryBadge(l) {
  if (!l || !l.expiry) return '—';
  const t = today();
  const cls = l.expiry < t ? 'b-red' : l.expiry <= addDays(t, 30) ? 'b-amber' : 'b-green';
  return `<span class="badge ${cls}">${fmtDate(l.expiry)}${l.expiry < t ? ' · hết hạn' : ''}</span>`;
}
function warehouseTab(tab) {
  if (tab === 'warehouses') {
    const wr = DB.warehouses.filter((w) => matchQ(w.code, w.name)).map((w) =>
      `<tr><td>${esc(w.code)}</td><td>${esc(w.name)}</td><td>${esc(CONFIG.warehouseTypes[w.type] || w.type)}</td><td class="num">${DB.locations.filter((l) => l.warehouseId === w.id).length}</td><td class="num">${fmtN(DB.balances.filter((b) => b.warehouseId === w.id).length)}</td>
      <td>${can('supplies.write', btn('Sửa', 'warehouse-edit', { id: w.id }, 'sm') + ' ' + btn('Xóa', 'warehouse-delete', { id: w.id }, 'sm danger'))}</td></tr>`).join('');
    const lr = DB.locations.map((l) => `<tr><td>${esc(Q.warehouseName(l.warehouseId))}</td><td>${esc(l.code)}</td><td>${esc(l.name)}</td><td>${can('supplies.write', btn('Xóa', 'location-delete', { id: l.id }, 'sm danger'))}</td></tr>`).join('');
    return tableShell(['Mã', 'Tên kho', 'Loại', '#Vị trí', '#Dòng tồn', ''], wr, 'Chưa có kho') + `<div class="card" style="margin-top:16px"><h3>Vị trí trong kho</h3>${tableShell(['Kho', 'Mã vị trí', 'Tên', ''], lr, 'Chưa có vị trí')}</div>`;
  }
  if (tab === 'transfers') {
    const rows = DB.transfers.filter((t) => matchQ(t.id, Q.warehouseName(t.fromWh), Q.warehouseName(t.toWh), Q.linesText(t.lines))).map((t) =>
      `<tr><td>${esc(t.id)}</td><td>${fmtDate(t.date)}</td><td>${esc(Q.warehouseName(t.fromWh))}</td><td>${esc(Q.warehouseName(t.toWh))}</td><td>${esc(Q.linesText(t.lines))}</td><td>${esc(t.by)}</td></tr>`).join('');
    return tableShell(['Mã', 'Ngày', 'Từ kho', 'Đến kho', 'Vật tư', 'Người chuyển'], rows, 'Chưa có phiếu chuyển kho');
  }
  if (tab === 'units') {
    const rows = DB.conversions.filter((c) => matchQ(Q.supplyName(c.supplyId), c.fromUnit)).map((c) =>
      `<tr><td>${esc(Q.supplyName(c.supplyId))}</td><td>1 ${esc(c.fromUnit)}</td><td class="num">${fmtN(c.factor)} ${esc(c.toUnit)}</td><td>${can('supplies.write', btn('Xóa', 'conversion-delete', { id: c.id }, 'sm danger'))}</td></tr>`).join('');
    return tableShell(['Vật tư', 'Đơn vị nguồn', '#Quy đổi', ''], rows, 'Chưa có quy đổi đơn vị');
  }
  const rows = DB.balances.filter((b) => b.qty > 0 && matchQ(Q.supplyName(b.supplyId), Q.warehouseName(b.warehouseId), (Q.lot(b.lotId) || {}).lotNumber)).sort((a, b) => a.warehouseId.localeCompare(b.warehouseId)).map((b) => {
    const loc = DB.locations.find((l) => l.id === b.locationId), l = Q.lot(b.lotId);
    return `<tr><td>${esc(Q.warehouseName(b.warehouseId))}</td><td>${esc(loc ? loc.code : '—')}</td><td>${esc(Q.supplyName(b.supplyId))}</td><td>${esc(l ? l.lotNumber : '—')}</td><td>${expiryBadge(l)}</td><td class="num">${fmtN(b.qty)} ${esc((Q.supply(b.supplyId) || {}).unit || '')}</td></tr>`;
  }).join('');
  return tableShell(['Kho', 'Vị trí', 'Vật tư', 'Lô', 'Hạn dùng', '#Tồn'], rows, 'Chưa có tồn kho');
}

const whOptions = () => DB.warehouses.map((w) => [w.id, w.name]);
function openWarehouseForm(id) {
  const w = id ? DB.warehouses.find((x) => x.id === id) : {};
  Modal.open(id ? 'Sửa kho' : 'Thêm kho', `<div class="grid2">${field('Mã kho', 'code', { value: w.code, required: true })}${field('Loại', 'type', { value: w.type || 'phu', options: Object.entries(CONFIG.warehouseTypes) })}</div>` + field('Tên kho', 'name', { value: w.name, required: true }),
    btn('Hủy', 'modal-close') + btn('Lưu', 'warehouse-save', { id: id || '' }, 'primary'));
}
function openLocationForm() {
  Modal.open('Thêm vị trí', field('Kho', 'warehouseId', { required: true, options: whOptions() }) + `<div class="grid2">${field('Mã vị trí', 'code', { required: true })}${field('Tên', 'name')}</div>`, btn('Hủy', 'modal-close') + btn('Lưu', 'location-save', {}, 'primary'));
}
function openTransferForm() {
  const o = whOptions();
  Modal.open('Phiếu chuyển kho', `<div class="grid2">${field('Từ kho', 'fromWh', { required: true, options: o })}${field('Đến kho', 'toWh', { required: true, value: (o[1] || o[0])[0], options: o })}</div>` + field('Ngày chuyển', 'date', { type: 'date', value: today() }) + '<b>Vật tư chuyển</b> ' + REQ + linesEditor(),
    btn('Hủy', 'modal-close') + btn('Chuyển kho', 'transfer-save', {}, 'primary'), true);
}
function openConversionForm() {
  Modal.open('Quy đổi đơn vị', field('Vật tư', 'supplyId', { required: true, options: DB.supplies.map((s) => [s.id, `${s.name} (gốc: ${s.unit})`]) }) +
    `<div class="grid2">${field('Đơn vị nguồn', 'fromUnit', { required: true, options: CONFIG.units.map((u) => [u, u]) })}${field('1 đơn vị nguồn = … đơn vị gốc', 'factor', { type: 'number', required: true, attrs: 'min="0.0001" step="any"' })}</div>`,
    btn('Hủy', 'modal-close') + btn('Lưu', 'conversion-save', {}, 'primary'));
}
