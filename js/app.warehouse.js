/* LOGIC: KHO & LÔ — sổ tồn theo kho/vị trí/lô, chuyển kho, quy đổi đơn vị.
 * Mọi thay đổi tồn phải đi qua addStock()/takeStock(); supplies.stock luôn là tổng các balances. */
const defaultWh = () => (DB.warehouses[0] || {}).id || '';
const expKey = (b) => { const l = Q.lot(b.lotId); return (l && l.expiry) || '9999-12-31'; };

function commitStock() {
  DB.balances = DB.balances.filter((b) => b.qty > 1e-9);
  SupplyAPI.save('supplies'); SupplyAPI.save('balances'); SupplyAPI.save('lots');
}
/** Dữ liệu cũ chưa có sổ theo kho: chuyển toàn bộ tồn hiện có vào kho mặc định. */
function ensureBalances() {
  if (DB.balances.length) return;
  DB.supplies.forEach((s) => { if (s.stock > 0) DB.balances.push({ id: uid('TON'), warehouseId: defaultWh(), locationId: '', supplyId: s.id, lotId: '', qty: s.stock }); });
  SupplyAPI.save('balances');
}
function addStock(wh, supplyId, qty, { lotId = '', locationId = '', total = true } = {}) {
  let b = DB.balances.find((x) => x.warehouseId === wh && x.supplyId === supplyId && (x.lotId || '') === lotId && (x.locationId || '') === locationId);
  if (!b) { b = { id: uid('TON'), warehouseId: wh, locationId, supplyId, lotId, qty: 0 }; DB.balances.push(b); }
  b.qty += qty;
  if (total) Q.supply(supplyId).stock += qty;
}
/** Lấy hàng theo FIFO hạn dùng (lô gần hết hạn trước, không lô sau cùng). Trả về các phần đã lấy. */
function takeStock(wh, supplyId, qty, { total = true } = {}) {
  const rows = DB.balances.filter((b) => b.warehouseId === wh && b.supplyId === supplyId && b.qty > 0).sort((a, b) => expKey(a).localeCompare(expKey(b)));
  let left = qty; const taken = [];
  for (const b of rows) { if (left <= 1e-9) break; const n = Math.min(b.qty, left); b.qty -= n; left -= n; taken.push({ lotId: b.lotId || '', qty: n }); }
  if (total) Q.supply(supplyId).stock -= qty;
  return taken;
}
/** Kho đầu tiên đủ toàn bộ các dòng (ưu tiên kho mặc định), '' nếu không có */
const pickWarehouse = (lines) => (DB.warehouses.find((w) => lines.every((l) => Q.whQty(l.supplyId, w.id) >= l.qty - 1e-9)) || {}).id || '';
function getLot(supplyId, lotNumber, expiry) {
  let l = DB.lots.find((x) => x.supplyId === supplyId && x.lotNumber === lotNumber);
  if (!l) { l = { id: uid('LOT'), supplyId, lotNumber, expiry: expiry || '', receivedAt: today() }; DB.lots.push(l); }
  else if (expiry && !l.expiry) l.expiry = expiry;
  return l;
}

/* ---------- Kho & vị trí ---------- */
function saveWarehouse(id) {
  const v = Modal.values();
  if (!v.name.trim() || !v.code.trim()) return Toast.err('Nhập mã và tên kho');
  if (DB.warehouses.some((w) => w.code === v.code.trim() && w.id !== id)) return Toast.err('Mã kho đã tồn tại');
  const data = { code: v.code.trim(), name: v.name.trim(), type: v.type };
  let before = null;
  if (id) { const w = DB.warehouses.find((x) => x.id === id); before = { ...w }; Object.assign(w, data); } else DB.warehouses.push({ id: uid('KHO'), ...data });
  SupplyAPI.save('warehouses'); if (id) Audit.change('Sửa kho', data.name, before, data); else Audit.log('Thêm kho', data.name); Modal.close(); render(); Toast.ok('Đã lưu kho');
}
function deleteWarehouse(id) {
  if (DB.warehouses.length <= 1) return Toast.err('Phải còn ít nhất một kho');
  if (DB.balances.some((b) => b.warehouseId === id && b.qty > 0)) return Toast.err('Kho còn tồn, hãy chuyển hết hàng trước khi xóa');
  if (DB.transfers.some((t) => t.fromWh === id || t.toWh === id) || DB.receipts.some((r) => r.warehouseId === id) || DB.issues.some((r) => r.warehouseId === id)) return Toast.err('Kho đã có chứng từ, không thể xóa');
  if (!confirm('Xóa kho này?')) return;
  DB.warehouses = DB.warehouses.filter((w) => w.id !== id); DB.locations = DB.locations.filter((l) => l.warehouseId !== id);
  SupplyAPI.save('warehouses'); SupplyAPI.save('locations'); Audit.log('Xóa kho', id); render();
}
function saveLocation() {
  const v = Modal.values();
  if (!v.code.trim()) return Toast.err('Nhập mã vị trí');
  if (DB.locations.some((l) => l.warehouseId === v.warehouseId && l.code === v.code.trim())) return Toast.err('Vị trí đã tồn tại trong kho này');
  DB.locations.push({ id: uid('LOC'), warehouseId: v.warehouseId, code: v.code.trim(), name: v.name.trim() || v.code.trim() });
  SupplyAPI.save('locations'); Modal.close(); render(); Toast.ok('Đã thêm vị trí');
}
function deleteLocation(id) {
  if (DB.balances.some((b) => b.locationId === id && b.qty > 0)) return Toast.err('Vị trí còn hàng, không thể xóa');
  DB.locations = DB.locations.filter((l) => l.id !== id); SupplyAPI.save('locations'); render();
}

/* ---------- Chuyển kho: lấy FIFO ở kho nguồn, giữ nguyên lô khi vào kho đích ---------- */
function saveTransfer() {
  const v = Modal.values(), lines = Modal.lines();
  if (v.fromWh === v.toWh) return Toast.err('Kho nguồn và kho đích phải khác nhau');
  if (!lines.length) return Toast.err('Thêm ít nhất một vật tư');
  const short = lines.find((l) => l.qty > Q.whQty(l.supplyId, v.fromWh) + 1e-9);
  if (short) return Toast.err(`Kho nguồn không đủ: ${Q.supplyName(short.supplyId)} còn ${fmtN(Q.whQty(short.supplyId, v.fromWh))}`);
  const moved = [];
  lines.forEach((l) => takeStock(v.fromWh, l.supplyId, l.qty, { total: false }).forEach((p) => { addStock(v.toWh, l.supplyId, p.qty, { lotId: p.lotId, total: false }); moved.push({ supplyId: l.supplyId, lotId: p.lotId, qty: p.qty }); }));
  DB.transfers.unshift({ id: uid('CK'), date: v.date, fromWh: v.fromWh, toWh: v.toWh, by: Auth.user.name, lines: moved });
  SupplyAPI.save('transfers'); commitStock(); Audit.log('Chuyển kho', `${Q.warehouseName(v.fromWh)} → ${Q.warehouseName(v.toWh)}`); Modal.close(); render(); Toast.ok('Đã chuyển kho');
}

/* ---------- Quy đổi đơn vị (về đơn vị gốc của vật tư) ---------- */
function saveConversion() {
  const v = Modal.values(), s = Q.supply(v.supplyId), factor = Number(v.factor);
  if (!(factor > 0)) return Toast.err('Hệ số quy đổi phải lớn hơn 0');
  if (v.fromUnit === s.unit) return Toast.err('Đơn vị nguồn trùng đơn vị gốc');
  if (DB.conversions.some((c) => c.supplyId === s.id && c.fromUnit === v.fromUnit)) return Toast.err('Đã có quy đổi cho đơn vị này');
  DB.conversions.push({ id: uid('QD'), supplyId: s.id, fromUnit: v.fromUnit, toUnit: s.unit, factor });
  SupplyAPI.save('conversions'); Modal.close(); render(); Toast.ok('Đã lưu quy đổi');
}
function deleteConversion(id) { DB.conversions = DB.conversions.filter((c) => c.id !== id); SupplyAPI.save('conversions'); render(); }
/** Quy đổi (qty, unit) về đơn vị gốc; trả null nếu chưa khai báo quy đổi */
function toBaseUnit(supplyId, qty, unit) {
  const s = Q.supply(supplyId);
  if (!unit || unit === s.unit) return { qty, factor: 1 };
  const c = DB.conversions.find((x) => x.supplyId === supplyId && x.fromUnit === unit);
  return c ? { qty: qty * c.factor, factor: c.factor } : null;
}

Object.assign(Actions, {
  'stocktake-wh': guard('stocktake', (d) => openStocktakeForm(d.value)),
  'warehouse-new': guard('supplies.write', () => openWarehouseForm()), 'warehouse-edit': guard('supplies.write', (d) => openWarehouseForm(d.id)),
  'warehouse-save': guard('supplies.write', (d) => saveWarehouse(d.id)), 'warehouse-delete': guard('supplies.write', (d) => deleteWarehouse(d.id)),
  'location-new': guard('supplies.write', () => openLocationForm()), 'location-save': guard('supplies.write', saveLocation), 'location-delete': guard('supplies.write', (d) => deleteLocation(d.id)),
  'transfer-new': guard('supplies.write', () => openTransferForm()), 'transfer-save': guard('supplies.write', saveTransfer),
  'conversion-new': guard('supplies.write', () => openConversionForm()), 'conversion-save': guard('supplies.write', saveConversion), 'conversion-delete': guard('supplies.write', (d) => deleteConversion(d.id)),
});
