/* MODULE: VẬT TƯ TIÊU HAO — tab: danh mục / nhập / xuất / nhà cung cấp / kiểm kê. Chỉ render UI; logic ở app.js */
const SUPPLY_TABS = [['items', 'Danh mục & tồn kho'], ['in', 'Nhập kho'], ['out', 'Xuất kho'], ['suppliers', 'Nhà cung cấp'], ['count', 'Kiểm kê']];

Views.supplies = function (st) {
  const tab = st.tab || 'items';
  const action = {
    items: can('supplies.write', btn('+ Thêm vật tư', 'supply-new', {}, 'primary')) + btn('Xuất CSV', 'export', { kind: 'stock' }),
    in: can('supplies.write', btn('+ Phiếu nhập', 'receipt-new', {}, 'primary')) + btn('Xuất CSV', 'export', { kind: 'receipts' }),
    out: can('supplies.write', btn('+ Phiếu xuất', 'issue-new', {}, 'primary')) + btn('Xuất CSV', 'export', { kind: 'issues' }),
    suppliers: can('suppliers.write', btn('+ Nhà cung cấp', 'supplier-new', {}, 'primary')),
    count: can('stocktake', btn('+ Phiếu kiểm kê', 'stocktake-new', {}, 'primary')),
  }[tab];
  return pageHead('Vật tư tiêu hao', 'Quản lý danh mục, tồn kho, nhập, xuất và kiểm kê', action) + tabsBar(SUPPLY_TABS, tab) + toolbar('Tìm kiếm…') + suppliesTab(tab);
};

function suppliesTab(tab) {
  if (tab === 'in') {
    const rows = DB.receipts.filter((r) => matchQ(r.id, Q.supplyName(r.supplyId), Q.supplierName(r.supplierId))).map((r) =>
      `<tr><td>${esc(r.id)}</td><td>${fmtDate(r.date)}</td><td>${esc(Q.supplyName(r.supplyId))}</td><td class="num">${fmtN(r.qty)}</td><td class="num">${fmtVND(r.price)}</td><td>${esc(Q.supplierName(r.supplierId) || '—')}</td></tr>`).join('');
    return tableShell(['Mã phiếu', 'Ngày', 'Vật tư', '#SL', '#Đơn giá', 'Nhà cung cấp'], rows, 'Chưa có phiếu nhập');
  }
  if (tab === 'out') {
    const rows = DB.issues.filter((r) => matchQ(r.id, Q.supplyName(r.supplyId), r.purpose)).map((r) =>
      `<tr><td>${esc(r.id)}</td><td>${fmtDate(r.date)}</td><td>${esc(Q.supplyName(r.supplyId))}</td><td class="num">${fmtN(r.qty)}</td><td>${esc(r.purpose || '—')}</td><td>${esc(r.repairId || '—')}</td></tr>`).join('');
    return tableShell(['Mã phiếu', 'Ngày', 'Vật tư', '#SL', 'Mục đích', 'Lệnh sửa'], rows, 'Chưa có phiếu xuất');
  }
  if (tab === 'suppliers') {
    const rows = DB.suppliers.filter((s) => matchQ(s.id, s.name, s.phone)).map((s) =>
      `<tr><td>${esc(s.id)}</td><td>${esc(s.name)}</td><td>${esc(s.phone || '—')}</td><td>${esc(s.address || '—')}</td>
      <td>${can('suppliers.write', btn('Sửa', 'supplier-edit', { id: s.id }, 'sm') + ' ' + btn('Xóa', 'supplier-delete', { id: s.id }, 'sm danger'))}</td></tr>`).join('');
    return tableShell(['Mã', 'Tên nhà cung cấp', 'Điện thoại', 'Địa chỉ', ''], rows, 'Chưa có nhà cung cấp');
  }
  if (tab === 'count') {
    const rows = DB.stocktakes.filter((k) => matchQ(k.id, k.by, k.note)).map((k) => {
      const diff = k.lines.filter((l) => l.diff !== 0).length;
      return `<tr><td>${esc(k.id)}</td><td>${fmtDate(k.date)}</td><td>${esc(k.by)}</td><td class="num">${k.lines.length}</td><td class="num">${diff ? `<span class="badge b-amber">${diff}</span>` : '0'}</td><td>${esc(k.note || '—')}</td><td>${btn('Xem', 'stocktake-open', { id: k.id }, 'sm')}</td></tr>`;
    }).join('');
    return tableShell(['Mã phiếu', 'Ngày', 'Người kiểm', '#Số dòng', '#Dòng lệch', 'Ghi chú', ''], rows, 'Chưa có phiếu kiểm kê');
  }
  const rows = DB.supplies.filter((s) => matchQ(s.id, s.name)).map((s) => {
    const low = Number(s.stock) <= Number(s.minStock);
    return `<tr><td>${esc(s.id)}</td><td>${esc(s.name)}</td><td>${esc((Q.category(s.categoryId) || {}).name || '—')}</td><td>${esc(s.unit)}</td>
      <td class="num">${fmtN(s.stock)} ${low ? '<span class="badge b-red">Thấp</span>' : ''}</td><td class="num">${fmtN(s.minStock)}</td><td class="num">${fmtVND(s.price)}</td>
      <td>${can('supplies.write', btn('Sửa', 'supply-edit', { id: s.id }, 'sm') + ' ' + btn('Xóa', 'supply-delete', { id: s.id }, 'sm danger'))}</td></tr>`;
  }).join('');
  return tableShell(['Mã', 'Tên vật tư', 'Nhóm', 'ĐVT', '#Tồn', '#Định mức', '#Đơn giá', ''], rows, 'Chưa có vật tư');
}

/* ---------- Form ---------- */
function openSupplyForm(id) {
  const s = id ? Q.supply(id) : {};
  Modal.open(id ? 'Sửa vật tư' : 'Thêm vật tư',
    field('Tên vật tư', 'name', { value: s.name, required: true }) +
    `<div class="grid2">${field('Nhóm', 'categoryId', { value: s.categoryId, options: DB.categories.map((c) => [c.id, c.name]) })}${field('Đơn vị tính', 'unit', { value: s.unit || 'cái', options: CONFIG.units.map((u) => [u, u]) })}
    ${field('Tồn tối thiểu', 'minStock', { type: 'number', value: s.minStock ?? 0, attrs: 'min="0"' })}${field('Đơn giá', 'price', { type: 'number', value: s.price ?? 0, attrs: 'min="0"' })}</div>`,
    btn('Hủy', 'modal-close') + btn('Lưu', 'supply-save', { id: id || '' }, 'primary'));
}
function openReceiptForm() {
  Modal.open('Phiếu nhập kho',
    field('Vật tư', 'supplyId', { options: DB.supplies.map((s) => [s.id, `${s.id} — ${s.name} (gốc: ${s.unit})`]) }) +
    `<div class="grid2">${field('Số lượng', 'qty', { type: 'number', required: true, attrs: 'min="0.01" step="any"' })}${field('Đơn vị (trống = đơn vị gốc)', 'unit', { options: [['', 'Đơn vị gốc'], ...CONFIG.units.map((u) => [u, u])] })}
    ${field('Đơn giá (theo đơn vị nhập)', 'price', { type: 'number', value: 0, attrs: 'min="0"' })}${field('Ngày nhập', 'date', { type: 'date', value: today() })}
    ${field('Kho nhận', 'warehouseId', { options: whOptions() })}${field('Vị trí', 'locationId', { options: [['', '— không —'], ...DB.locations.map((l) => [l.id, `${Q.warehouseName(l.warehouseId)} / ${l.code}`])] })}
    ${field('Số lô (nếu có)', 'lotNumber')}${field('Hạn dùng', 'expiry', { type: 'date' })}</div>` +
    field('Nhà cung cấp', 'supplierId', { options: [['', '— không chọn —'], ...DB.suppliers.map((s) => [s.id, s.name])] }) + field('Ghi chú', 'note', { type: 'textarea' }),
    btn('Hủy', 'modal-close') + btn('Lưu phiếu', 'receipt-save', {}, 'primary'), true);
}
function openIssueForm() {
  Modal.open('Phiếu xuất kho',
    field('Kho xuất', 'warehouseId', { options: whOptions() }) +
    field('Vật tư', 'supplyId', { options: DB.supplies.map((s) => [s.id, `${s.id} — ${s.name} (tổng tồn ${fmtN(s.stock)})`]) }) +
    `<div class="grid2">${field('Số lượng', 'qty', { type: 'number', required: true, attrs: 'min="0.01" step="any"' })}${field('Ngày xuất', 'date', { type: 'date', value: today() })}</div>` +
    '<p class="hint">Hệ thống lấy theo lô có hạn dùng gần nhất trước (FIFO).</p>' + field('Mục đích sử dụng', 'purpose') + field('Ghi chú', 'note', { type: 'textarea' }),
    btn('Hủy', 'modal-close') + btn('Lưu phiếu', 'issue-save', {}, 'primary'));
}
function openSupplierForm(id) {
  const s = id ? DB.suppliers.find((x) => x.id === id) : {};
  Modal.open(id ? 'Sửa nhà cung cấp' : 'Thêm nhà cung cấp',
    field('Tên nhà cung cấp', 'name', { value: s.name, required: true }) + field('Điện thoại', 'phone', { value: s.phone }) + field('Địa chỉ', 'address', { value: s.address }),
    btn('Hủy', 'modal-close') + btn('Lưu', 'supplier-save', { id: id || '' }, 'primary'));
}
function openStocktakeForm(wh = defaultWh()) {
  const rows = DB.supplies.map((s) => `<tr><td>${esc(s.name)}</td><td class="num">${fmtN(Q.whQty(s.id, wh))} ${esc(s.unit)}</td><td><input type="number" name="act_${esc(s.id)}" min="0" step="any" placeholder="Thực tế" style="width:110px"></td></tr>`).join('');
  Modal.open('Phiếu kiểm kê',
    `<div class="grid2">${selectHTML('warehouseId', whOptions(), wh, 'data-change="stocktake-wh"').replace(/^/, '<div class="fld"><label>Kho kiểm kê</label>').replace(/$/, '</div>')}${field('Ngày kiểm', 'date', { type: 'date', value: today() })}</div>${field('Ghi chú', 'note')}
    <p class="hint">Chỉ nhập số thực tế cho vật tư đã kiểm; dòng để trống sẽ được bỏ qua. Khi lưu, tồn của kho này được điều chỉnh theo số thực tế.</p>` +
    tableShell(['Vật tư', '#Tồn hệ thống (kho này)', 'Thực tế'], rows),
    btn('Hủy', 'modal-close') + btn('Lưu & điều chỉnh tồn', 'stocktake-save', {}, 'primary'), true);
}
function openStocktakeDetail(id) {
  const k = DB.stocktakes.find((x) => x.id === id); if (!k) return;
  const rows = k.lines.map((l) => `<tr><td>${esc(Q.supplyName(l.supplyId))}</td><td class="num">${fmtN(l.system)}</td><td class="num">${fmtN(l.actual)}</td><td class="num">${l.diff === 0 ? '0' : `<span class="badge ${l.diff > 0 ? 'b-green' : 'b-red'}">${l.diff > 0 ? '+' : ''}${fmtN(l.diff)}</span>`}</td></tr>`).join('');
  Modal.open(`Kiểm kê ${k.id} — ${fmtDate(k.date)}`, tableShell(['Vật tư', '#Hệ thống', '#Thực tế', '#Chênh lệch'], rows), btn('Đóng', 'modal-close'), true);
}
