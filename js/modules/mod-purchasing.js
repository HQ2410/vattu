/* MODULE: MUA HÀNG & ĐỊNH MỨC — tab: đề nghị mua / báo giá / đơn mua / định mức / quy tắc đặt hàng */
const PURCHASE_TABS = [['prs', 'Đề nghị mua'], ['quotes', 'Báo giá NCC'], ['orders', 'Đơn mua'], ['standards', 'Định mức'], ['rules', 'Quy tắc đặt hàng'], ['approvals', 'Phê duyệt']];

Views.purchasing = function (st) {
  const tab = st.tab || 'prs';
  const action = { prs: can('purchase.write', btn('+ Đề nghị mua', 'pr-new', {}, 'primary')), quotes: can('purchase.write', btn('+ Báo giá', 'quote-new', {}, 'primary')), orders: '',
    standards: can('purchase.write', btn('+ Định mức', 'standard-new', {}, 'primary')),
    rules: can('purchase.write', btn('Đề xuất mua từ quy tắc', 'rule-suggest') + btn('+ Quy tắc', 'rule-new', {}, 'primary')), approvals: '' }[tab];
  return pageHead('Mua hàng & định mức', 'Từ đề nghị đến nhận hàng, kèm định mức và quy tắc đặt hàng', action) + tabsBar(PURCHASE_TABS, tab) + toolbar('Tìm kiếm…') + purchasingTab(tab);
};

function purchasingTab(tab) {
  if (tab === 'quotes') {
    const rows = DB.quotes.filter((q) => matchQ(q.id, Q.supplierName(q.supplierId), Q.linesText(q.lines.map((l) => ({ supplyId: l.supplyId, qty: l.price }))))).map((q) =>
      `<tr><td>${esc(q.id)}</td><td>${esc(Q.supplierName(q.supplierId))}</td><td>${fmtDate(q.date)}</td><td>${fmtDate(q.validUntil)}</td><td>${q.validUntil >= today() ? '<span class="badge b-green">Còn hiệu lực</span>' : '<span class="badge b-gray">Hết hạn</span>'}</td>
      <td>${esc(q.lines.map((l) => `${Q.supplyName(l.supplyId)}: ${fmtVND(l.price)}`).join('; '))}</td></tr>`).join('');
    return tableShell(['Mã', 'Nhà cung cấp', 'Ngày', 'Hiệu lực đến', 'Tình trạng', 'Đơn giá'], rows, 'Chưa có báo giá');
  }
  if (tab === 'orders') {
    const rows = DB.orders.filter((o) => matchQ(o.id, Q.supplierName(o.supplierId))).map((o) =>
      `<tr><td>${esc(o.id)}</td><td>${esc(Q.supplierName(o.supplierId))}</td><td>${fmtDate(o.date)}</td><td>${fmtDate(o.expected)}</td><td class="num">${fmtVND(poTotal(o))}</td><td>${badge(CONFIG.poStatus, o.status)}</td>
      <td>${btn('Xem', 'po-open', { id: o.id }, 'sm')}${can('purchase.write', ['da_dat', 'nhan_mot_phan'].includes(o.status) ? ' ' + btn('Nhận hàng', 'po-receive', { id: o.id }, 'sm primary') : '')}${can('purchase.write', o.status === 'da_dat' ? ' ' + btn('Hủy', 'po-cancel', { id: o.id }, 'sm danger') : '')}</td></tr>`).join('');
    return tableShell(['Mã đơn', 'Nhà cung cấp', 'Ngày đặt', 'Dự kiến về', '#Tổng tiền', 'Trạng thái', ''], rows, 'Chưa có đơn mua — tạo từ đề nghị mua đã duyệt');
  }
  if (tab === 'standards') {
    const rows = DB.standards.filter((s) => matchQ(s.name, Q.equipmentName(s.equipmentId))).map((s) =>
      `<tr><td>${esc(s.name)}</td><td>${esc(Q.equipmentName(s.equipmentId))}</td><td>${esc(CONFIG.basis[s.basis] || s.basis)}</td><td>${esc(Q.linesText(s.lines))}</td><td>${badge(CONFIG.standardStatus, s.status)}</td>
      <td>${s.status === 'nhap' ? can('purchase.approve', btn('Phê duyệt', 'standard-approve', { id: s.id }, 'sm primary') + ' ') : can('requests.create', btn('Lập yêu cầu', 'standard-request', { id: s.id }, 'sm primary') + ' ')}${can('purchase.write', btn('Xóa', 'standard-delete', { id: s.id }, 'sm danger'))}</td></tr>`).join('');
    return tableShell(['Định mức', 'Thiết bị áp dụng', 'Cơ sở', 'Vật tư', 'Trạng thái', ''], rows, 'Chưa có định mức');
  }
  if (tab === 'rules') {
    const rows = DB.reorderRules.filter((r) => matchQ(Q.supplyName(r.supplyId), Q.warehouseName(r.warehouseId))).map((r) => {
      const cur = Q.whQty(r.supplyId, r.warehouseId), need = cur <= r.reorderPoint;
      return `<tr><td>${esc(Q.supplyName(r.supplyId))}</td><td>${esc(Q.warehouseName(r.warehouseId))}</td><td class="num">${fmtN(cur)}</td><td class="num">${fmtN(r.min)}</td><td class="num">${fmtN(r.reorderPoint)}</td><td class="num">${fmtN(r.max)}</td><td class="num">${fmtN(r.leadTime)} ngày</td><td class="num">${fmtN(r.safety)}</td>
        <td>${need ? '<span class="badge b-red">Cần đặt hàng</span>' : '<span class="badge b-green">Đủ</span>'}</td><td>${can('purchase.write', btn('Xóa', 'rule-delete', { id: r.id }, 'sm danger'))}</td></tr>`;
    }).join('');
    return tableShell(['Vật tư', 'Kho', '#Tồn', '#Tối thiểu', '#Điểm đặt lại', '#Tối đa', '#Lead time', '#Tồn an toàn', 'Tình trạng', ''], rows, 'Chưa có quy tắc đặt hàng');
  }
  if (tab === 'approvals') {
    const rows = DB.approvals.filter((a) => matchQ(a.docId, a.requestedBy, CONFIG.docTypes[a.docType])).map((a) =>
      `<tr><td>${esc(CONFIG.docTypes[a.docType] || a.docType)}</td><td>${esc(a.docId)}</td><td>${esc(a.requestedBy)}</td><td>${fmtDate(a.submittedAt)}</td><td class="num">${fmtVND(a.amount || 0)}</td><td>${esc(Approvals.summary(a))}</td><td>${badge(CONFIG.approvalStatus, a.status)}</td>
      <td>${Approvals.canAct(a) ? btn('Duyệt', 'approval-approve', { id: a.id }, 'sm primary') + ' ' + btn('Từ chối', 'approval-reject', { id: a.id }, 'sm danger') : ''}</td></tr>`).join('');
    return tableShell(['Loại', 'Mã chứng từ', 'Người gửi', 'Ngày gửi', '#Giá trị', 'Các bước', 'Trạng thái', ''], rows, 'Chưa có chứng từ cần phê duyệt');
  }
  const rows = DB.purchaseRequests.filter((r) => matchQ(r.id, r.requester, Q.linesText(r.lines))).map((r) => {
    const a = Approvals.forDoc('purchase', r.id), step = Approvals.current(a);
    const canDecide = r.status === 'cho_duyet' && (a ? Approvals.canAct(a) : Auth.can('purchase.approve'));
    return `<tr><td>${esc(r.id)}</td><td>${fmtDate(r.date)}</td><td>${esc(r.requester)}</td><td>${esc(Q.warehouseName(r.warehouseId))}</td><td>${badge(CONFIG.priority, r.priority)}</td><td>${esc(Q.linesText(r.lines))}</td><td>${badge(CONFIG.purchaseStatus, r.status)}${step ? `<br><small>Chờ: ${esc(step.label)} (${step.order}/${a.steps.length})</small>` : ''}</td>
    <td>${btn('Xem', 'pr-open', { id: r.id }, 'sm')}${canDecide ? ' ' + btn('Duyệt', 'pr-approve', { id: r.id }, 'sm primary') + ' ' + btn('Từ chối', 'pr-reject', { id: r.id }, 'sm danger') : ''}${r.status === 'da_duyet' ? can('purchase.write', ' ' + btn('Tạo đơn mua', 'po-new', { id: r.id }, 'sm primary')) : ''}</td></tr>`;
  }).join('');
  return tableShell(['Mã', 'Ngày', 'Người đề nghị', 'Kho nhận', 'Ưu tiên', 'Vật tư', 'Trạng thái', ''], rows, 'Chưa có đề nghị mua');
}

function docModal(title, meta, tableHTML) {
  Modal.open(title, `<div class="grid2">${meta.map(([k, v]) => `<div class="fld"><label>${esc(k)}</label><div>${v}</div></div>`).join('')}</div>${tableHTML}`, btn('Đóng', 'modal-close'), true);
}
function openPRDetail(id) {
  const r = findPR(id); if (!r) return;
  const rows = r.lines.map((l) => `<tr><td>${esc(Q.supplyName(l.supplyId))}</td><td class="num">${fmtN(l.qty)}</td><td class="num">${fmtN(Q.whQty(l.supplyId, r.warehouseId))}</td></tr>`).join('');
  const a = Approvals.forDoc('purchase', id);
  const steps = a ? a.steps.map((s) => `<tr><td>${s.order}</td><td>${esc(s.label)}</td><td>${s.decision ? badge({ da_duyet: ['Đã duyệt', 'b-green'], tu_choi: ['Từ chối', 'b-red'] }, s.decision) : '<span class="badge b-gray">Chờ</span>'}</td><td>${esc(s.by || '—')}</td><td>${s.at ? fmtTime(s.at) : '—'}</td></tr>`).join('') : '';
  docModal('Đề nghị mua ' + r.id, [['Người đề nghị', esc(r.requester)], ['Kho nhận', esc(Q.warehouseName(r.warehouseId))], ['Cần trước ngày', fmtDate(r.requiredDate)], ['Trạng thái', badge(CONFIG.purchaseStatus, r.status)]],
    tableShell(['Vật tư', '#Số lượng', '#Tồn kho nhận'], rows) + (a ? '<b>Các bước phê duyệt</b>' + tableShell(['Bước', 'Vai trò', 'Quyết định', 'Người duyệt', 'Lúc'], steps) : ''));
}
function openPODetail(id) {
  const o = findPO(id); if (!o) return;
  const rows = o.lines.map((l) => `<tr><td>${esc(Q.supplyName(l.supplyId))}</td><td class="num">${fmtN(l.qty)}</td><td class="num">${fmtN(l.received)}</td><td class="num">${fmtVND(l.price)}</td><td class="num">${fmtVND(l.qty * l.price)}</td></tr>`).join('');
  const rej = DB.receipts.filter((r) => r.poId === id).reduce((t, r) => t + (r.rejected || 0), 0);
  docModal('Đơn mua ' + o.id, [['Nhà cung cấp', esc(Q.supplierName(o.supplierId))], ['Trạng thái', badge(CONFIG.poStatus, o.status)], ['Tổng tiền', fmtVND(poTotal(o))], ['Số lượng bị từ chối', fmtN(rej)]], tableShell(['Vật tư', '#Đặt', '#Đã nhận', '#Đơn giá', '#Thành tiền'], rows));
}

function openPRForm() {
  Modal.open('Đề nghị mua', `<div class="grid2">${field('Kho nhận', 'warehouseId', { required: true, options: whOptions() })}${field('Ưu tiên', 'priority', { value: 'trung_binh', options: Object.entries(CONFIG.priority).map(([k, v]) => [k, v[0]]) })}</div>` +
    field('Cần trước ngày', 'requiredDate', { type: 'date' }) + '<b>Vật tư cần mua</b> ' + REQ + linesEditor(), btn('Hủy', 'modal-close') + btn('Gửi đề nghị', 'pr-save', {}, 'primary'), true);
}
function openQuoteForm() {
  Modal.open('Báo giá nhà cung cấp', `<div class="grid2">${field('Nhà cung cấp', 'supplierId', { required: true, options: [['', '— chọn —'], ...DB.suppliers.map((s) => [s.id, s.name])] })}${field('Hiệu lực đến', 'validUntil', { required: true, type: 'date', value: addDays(today(), 30) })}</div>` +
    '<b>Vật tư và đơn giá (theo đơn vị gốc)</b> ' + REQ + linesEditor([{}], 'Đơn giá'), btn('Hủy', 'modal-close') + btn('Lưu báo giá', 'quote-save', {}, 'primary'), true);
}
function openPOForm(prId) {
  const r = findPR(prId, 'da_duyet'); if (!r) return;
  const lead = Math.max(7, ...r.lines.map((l) => (DB.reorderRules.find((x) => x.supplyId === l.supplyId) || {}).leadTime || 0));
  Modal.open('Tạo đơn mua từ ' + r.id, field('Nhà cung cấp', 'supplierId', { required: true, options: [['', '— chọn —'], ...DB.suppliers.map((s) => [s.id, s.name])] }) + field('Dự kiến về', 'expected', { type: 'date', value: addDays(today(), lead) }) +
    `<p class="hint">Đơn giá lấy từ báo giá còn hiệu lực của nhà cung cấp; nếu không có sẽ dùng đơn giá gần nhất của vật tư.</p><p>${esc(Q.linesText(r.lines))}</p>`, btn('Hủy', 'modal-close') + btn('Tạo đơn', 'po-save', { id: prId }, 'primary'));
}
function openReceiveForm(id) {
  const o = findPO(id); if (!o) return;
  const rows = o.lines.map((l, i) => `<tr><td>${esc(Q.supplyName(l.supplyId))}<br><small>còn ${fmtN(l.qty - l.received)}</small></td><td><input type="number" name="qty_${i}" min="0" step="any" value="${l.qty - l.received}" style="width:80px"></td><td><input type="number" name="rej_${i}" min="0" step="any" value="0" style="width:70px"></td><td><input name="lot_${i}" placeholder="Số lô" style="width:100px"></td><td><input type="date" name="exp_${i}"></td></tr>`).join('');
  Modal.open('Nhận hàng ' + o.id, field('Kho nhận', 'warehouseId', { required: true, options: whOptions() }) + tableShell(['Vật tư', 'Đạt', 'Từ chối', 'Lô', 'Hạn dùng'], rows), btn('Hủy', 'modal-close') + btn('Nhập kho', 'po-receive-save', { id }, 'primary'), true);
}
function openStandardForm() {
  Modal.open('Định mức vật tư', field('Tên định mức', 'name', { required: true }) + `<div class="grid2">${field('Thiết bị áp dụng', 'equipmentId', { options: [['', '— chung —'], ...DB.equipment.map((e) => [e.id, e.name])] })}${field('Cơ sở tính', 'basis', { options: Object.entries(CONFIG.basis) })}</div>` +
    '<b>Vật tư và số lượng</b> ' + REQ + linesEditor(), btn('Hủy', 'modal-close') + btn('Lưu (nháp)', 'standard-save', {}, 'primary'), true);
}
function openRuleForm() {
  const n = (label, name, value = 0, required = false) => field(label, name, { required, type: 'number', value, attrs: 'min="0" step="any"' });
  Modal.open('Quy tắc đặt hàng', `<div class="grid2">${field('Vật tư', 'supplyId', { required: true, options: DB.supplies.map((s) => [s.id, s.name]) })}${field('Kho', 'warehouseId', { required: true, options: whOptions() })}
    ${n('Tồn tối thiểu', 'min', 0, true)}${n('Điểm đặt lại', 'reorderPoint', 0, true)}${n('Tồn tối đa', 'max', 0, true)}${n('Lead time (ngày)', 'leadTime', 7)}${n('Tồn an toàn', 'safety')}</div>`, btn('Hủy', 'modal-close') + btn('Lưu', 'rule-save', {}, 'primary'));
}
