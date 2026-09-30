/* MODULE: YÊU CẦU VẬT TƯ — Kỹ thuật tạo → Quản lý duyệt/từ chối → Thủ kho xuất kho */
const REQUEST_TABS = [['all', 'Tất cả'], ['cho_duyet', 'Chờ duyệt'], ['da_duyet', 'Đã duyệt'], ['da_xuat', 'Đã xuất kho'], ['tu_choi', 'Từ chối']];

Views.requests = function (st) {
  const tab = st.tab || 'all';
  const list = DB.requests.filter((r) => (tab === 'all' || r.status === tab) && matchQ(r.id, r.requester, r.purpose, Q.linesText(r.lines)));
  const rows = list.map((r) => {
    const acts = btn('Xem', 'request-open', { id: r.id }, 'sm') +
      (r.status === 'cho_duyet' ? can('requests.approve', ' ' + btn('Duyệt', 'request-approve', { id: r.id }, 'sm primary') + ' ' + btn('Từ chối', 'request-reject', { id: r.id }, 'sm danger')) : '') +
      (r.status === 'da_duyet' ? can('requests.issue', ' ' + btn('Xuất kho', 'request-issue', { id: r.id }, 'sm primary')) : '');
    return `<tr><td>${esc(r.id)}</td><td>${fmtDate(r.date)}</td><td>${esc(r.requester)}</td><td>${esc(r.purpose)}</td><td>${esc(Q.equipmentName(r.equipmentId))}</td><td>${esc(Q.linesText(r.lines))}</td><td>${badge(CONFIG.requestStatus, r.status)}</td><td>${acts}</td></tr>`;
  }).join('');
  return pageHead('Yêu cầu vật tư', 'Kỹ thuật đề nghị → Quản lý duyệt → Thủ kho xuất', can('requests.create', btn('+ Tạo yêu cầu', 'request-new', {}, 'primary'))) +
    tabsBar(REQUEST_TABS, tab) + toolbar('Tìm kiếm…') + tableShell(['Mã', 'Ngày', 'Người yêu cầu', 'Mục đích', 'Thiết bị', 'Vật tư', 'Trạng thái', ''], rows, 'Chưa có yêu cầu nào');
};

function openRequestForm() {
  const openRepairs = DB.repairs.filter((r) => ['moi', 'dang_sua'].includes(r.status));
  Modal.open('Yêu cầu vật tư',
    field('Mục đích sử dụng', 'purpose', { required: true }) +
    `<div class="grid2">${field('Thiết bị (nếu có)', 'equipmentId', { options: [['', '— không —'], ...DB.equipment.map((e) => [e.id, e.name])] })}
    ${field('Lệnh sửa chữa (nếu có)', 'repairId', { options: [['', '— không —'], ...openRepairs.map((r) => [r.id, `${r.id} — ${r.title}`])] })}</div>` +
    `<b>Vật tư cần</b> ${REQ}` + linesEditor(), btn('Hủy', 'modal-close') + btn('Gửi yêu cầu', 'request-save', {}, 'primary'), true);
}
function openRequestDetail(id) {
  const r = DB.requests.find((x) => x.id === id); if (!r) return;
  const rows = r.lines.map((l) => { const s = Q.supply(l.supplyId) || { stock: 0, unit: '' }; return `<tr><td>${esc(Q.supplyName(l.supplyId))}</td><td class="num">${fmtN(l.qty)} ${esc(s.unit)}</td><td class="num">${fmtN(s.stock)}${l.qty > s.stock && r.status !== 'da_xuat' ? ' <span class="badge b-red">Thiếu</span>' : ''}</td></tr>`; }).join('');
  const meta = [['Người yêu cầu', r.requester], ['Ngày', fmtDate(r.date)], ['Mục đích', r.purpose], ['Thiết bị', Q.equipmentName(r.equipmentId)], ['Lệnh sửa chữa', r.repairId || '—'],
    ['Trạng thái', badge(CONFIG.requestStatus, r.status)], ['Người duyệt', r.approvedBy || '—'], ['Người xuất kho', r.issuedBy || '—'], ...(r.rejectReason ? [['Lý do từ chối', r.rejectReason]] : [])];
  Modal.open(`Yêu cầu ${r.id}`, `<div class="grid2">${meta.map(([k, v]) => `<div class="fld"><label>${esc(k)}</label><div>${k === 'Trạng thái' ? v : esc(v)}</div></div>`).join('')}</div>` + tableShell(['Vật tư', '#Cần', '#Tồn hiện tại'], rows), btn('Đóng', 'modal-close'), true);
}
function openRejectForm(id) {
  Modal.open('Từ chối yêu cầu', field('Lý do', 'reason', { type: 'textarea', required: true }), btn('Hủy', 'modal-close') + btn('Từ chối', 'request-reject-save', { id }, 'danger'));
}
