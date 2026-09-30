/* MODULE: HỆ THỐNG — người dùng & nhật ký thao tác (chỉ quyền users.manage) */
const SYSTEM_TABS = [['users', 'Người dùng'], ['audit', 'Nhật ký thao tác']];

Views.system = function (st) {
  const tab = st.tab || 'users';
  let body;
  if (tab === 'audit') {
    const change = (l) => (l.new ? Object.keys(l.new).map((k) => `${esc(k)}: <s>${esc(l.old ? l.old[k] : '')}</s> → <b>${esc(l.new[k])}</b>`).join('<br>') : '—');
    const rows = DB.audit.filter((l) => matchQ(l.user, l.action, l.target)).slice(0, 200).map((l) => `<tr><td>${fmtTime(l.time)}</td><td>${esc(l.user)}</td><td>${esc(l.action)}</td><td>${esc(l.target)}</td><td style="white-space:normal">${change(l)}</td></tr>`).join('');
    body = tableShell(['Thời gian', 'Người dùng', 'Thao tác', 'Đối tượng', 'Thay đổi (cũ → mới)'], rows, 'Chưa có nhật ký');
  } else {
    const rows = DB.users.filter((u) => matchQ(u.username, u.name)).map((u) =>
      `<tr><td>${esc(u.username)}</td><td>${esc(u.name)}</td><td>${esc((CONFIG.roles[u.role] || [u.role])[0])}</td><td>${u.active === false ? '<span class="badge b-gray">Khóa</span>' : '<span class="badge b-green">Hoạt động</span>'}</td><td>${btn('Sửa', 'user-edit', { id: u.id }, 'sm')}</td></tr>`).join('');
    body = tableShell(['Tên đăng nhập', 'Họ tên', 'Vai trò', 'Trạng thái', ''], rows);
  }
  return pageHead('Người dùng & nhật ký', 'Quản lý tài khoản và theo dõi thao tác', tab === 'users' ? btn('+ Thêm người dùng', 'user-new', {}, 'primary') : '') + tabsBar(SYSTEM_TABS, tab) + toolbar('Tìm kiếm…') + body;
};

function openUserForm(id) {
  const u = id ? DB.users.find((x) => x.id === id) : {};
  Modal.open(id ? 'Sửa người dùng' : 'Thêm người dùng',
    `<div class="grid2">${field('Tên đăng nhập', 'username', { value: u.username, required: true, attrs: id ? 'readonly' : '' })}${field('Họ tên', 'name', { value: u.name, required: true })}
    ${field('Vai trò', 'role', { value: u.role || 'kythuat', options: Object.entries(CONFIG.roles).map(([k, v]) => [k, v[0]]) })}${field('Trạng thái', 'active', { value: u.active === false ? 'no' : 'yes', options: [['yes', 'Hoạt động'], ['no', 'Khóa']] })}</div>` +
    field(id ? 'Mật khẩu mới (bỏ trống = giữ nguyên)' : 'Mật khẩu', 'password', { type: 'password', required: !id }),
    btn('Hủy', 'modal-close') + btn('Lưu', 'user-save', { id: id || '' }, 'primary'));
}
