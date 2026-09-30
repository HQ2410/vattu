/* DATA LAYER — config tĩnh + dữ liệu demo seed. Không gọi API, không render UI ở đây. */
const CONFIG = {
  repairStatus: { moi: ['Mới', 'b-gray'], dang_sua: ['Đang sửa', 'b-blue'], hoan_thanh: ['Hoàn thành', 'b-green'], huy: ['Đã hủy', 'b-red'] },
  requestStatus: { cho_duyet: ['Chờ duyệt', 'b-amber'], da_duyet: ['Đã duyệt', 'b-blue'], da_xuat: ['Đã xuất kho', 'b-green'], tu_choi: ['Từ chối', 'b-red'] },
  scheduleStatus: { qua_han: ['Quá hạn', 'b-red'], sap_den: ['Sắp đến hạn', 'b-amber'], binh_thuong: ['Bình thường', 'b-green'] },
  priority: { thap: ['Thấp', 'b-gray'], trung_binh: ['Trung bình', 'b-amber'], cao: ['Cao', 'b-red'] },
  equipmentStatus: { hoat_dong: ['Hoạt động', 'b-green'], dang_sua: ['Đang sửa', 'b-amber'], ngung: ['Ngừng', 'b-gray'] },
  units: ['cái', 'bộ', 'kg', 'lít', 'mét', 'cuộn', 'hộp', 'thùng'],
  purchaseStatus: { cho_duyet: ['Chờ duyệt', 'b-amber'], da_duyet: ['Đã duyệt', 'b-blue'], da_dat: ['Đã tạo đơn mua', 'b-green'], tu_choi: ['Từ chối', 'b-red'] },
  poStatus: { da_dat: ['Đã đặt', 'b-blue'], nhan_mot_phan: ['Nhận một phần', 'b-amber'], hoan_thanh: ['Hoàn thành', 'b-green'], huy: ['Đã hủy', 'b-red'] },
  standardStatus: { nhap: ['Nháp', 'b-gray'], hieu_luc: ['Hiệu lực', 'b-green'] },
  warehouseTypes: { chinh: 'Kho chính', phu: 'Kho phụ', tam: 'Kho tạm' },
  taskStatus: { chua: ['Chưa làm', 'b-gray'], dang: ['Đang làm', 'b-blue'], xong: ['Hoàn tất', 'b-green'], bo_qua: ['Bỏ qua', 'b-amber'] },
  approvalStatus: { dang_duyet: ['Đang duyệt', 'b-amber'], da_duyet: ['Đã duyệt', 'b-green'], tu_choi: ['Từ chối', 'b-red'] },
  docTypes: { purchase: 'Đề nghị mua' },
  recommendationType: { dat_hang: 'Đề xuất đặt hàng sớm', dieu_chinh_dinh_muc: 'Điều chỉnh định mức', ton_dong: 'Vật tư tồn đọng' },
  recommendationStatus: { cho_duyet: ['Chờ xem xét', 'b-amber'], ap_dung: ['Đã áp dụng', 'b-green'], bo_qua: ['Đã bỏ qua', 'b-gray'] },
  alertType: { ton_thap: 'Tồn thấp', het_han: 'Hạn dùng', bat_thuong: 'Tiêu hao bất thường', thiet_bi_hong_lap_lai: 'Thiết bị hỏng lặp lại' },
  alertSeverity: { thap: ['Thấp', 'b-gray'], trung_binh: ['Trung bình', 'b-amber'], cao: ['Cao', 'b-red'] },
  alertStatus: { moi: ['Mới', 'b-amber'], da_xu_ly: ['Đã xử lý', 'b-green'] },
  forecastConfidence: { thap: ['Thấp', 'b-gray'], trung_binh: ['Trung bình', 'b-amber'], cao: ['Cao', 'b-green'] },
  aiModelVersion: 'MA-LR-v1', // trung bình trượt + hồi quy tuyến tính đơn giản trên dữ liệu xuất kho — không gọi dịch vụ AI ngoài
  // Luồng phê duyệt nhiều bước; bước có minAmount chỉ áp dụng khi giá trị chứng từ ≥ ngưỡng.
  approvalFlows: { purchase: [{ role: 'quanly', label: 'Quản lý' }, { role: 'admin', label: 'Giám đốc', minAmount: 10000000 }] },
  basis: { thang: 'Theo tháng', lan_bao_tri: 'Theo lần bảo trì' },
  // Phân quyền theo vai trò: '*' = toàn quyền.
  roles: {
    admin: ['Quản trị', ['*']],
    thukho: ['Thủ kho', ['supplies.write', 'suppliers.write', 'stocktake', 'requests.issue', 'requests.create', 'purchase.write', 'ai.manage']],
    kythuat: ['Kỹ thuật', ['repairs.write', 'maintenance.write', 'requests.create']],
    quanly: ['Quản lý', ['requests.approve', 'repairs.write', 'maintenance.write', 'requests.create', 'purchase.approve', 'purchase.write', 'ai.manage']],
  },
};

const _seedDate = (n) => { const d = new Date(), p = (x) => String(x).padStart(2, '0'); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };

const DB = {
  // Mật khẩu demo dạng thô — khi nối server thật phải băm phía server, không lưu ở frontend.
  users: [
    { id: 'U-01', username: 'admin', name: 'Quản trị viên', role: 'admin', password: '123456', active: true },
    { id: 'U-02', username: 'thukho', name: 'Thủ kho', role: 'thukho', password: '123456', active: true },
    { id: 'U-03', username: 'kythuat', name: 'Kỹ thuật viên', role: 'kythuat', password: '123456', active: true },
    { id: 'U-04', username: 'quanly', name: 'Quản lý xưởng', role: 'quanly', password: '123456', active: true },
  ],
  audit: [],
  categories: [
    { id: 'CAT-01', name: 'Dầu mỡ – hóa chất' },
    { id: 'CAT-02', name: 'Phụ tùng thay thế' },
    { id: 'CAT-03', name: 'Vật tư tiêu hao chung' },
  ],
  suppliers: [
    { id: 'NCC-01', name: 'Công ty Cơ khí An Phát', phone: '0281234567', address: 'Q. Bình Tân, TP.HCM' },
    { id: 'NCC-02', name: 'Vật tư Công nghiệp Minh Long', phone: '0287654321', address: 'TP. Thủ Đức, TP.HCM' },
  ],
  supplies: [
    { id: 'VT-001', name: 'Dầu nhớt máy', categoryId: 'CAT-01', unit: 'lít', stock: 60, minStock: 20, price: 65000 },
    { id: 'VT-002', name: 'Vòng bi 6204', categoryId: 'CAT-02', unit: 'cái', stock: 8, minStock: 10, price: 45000 },
    { id: 'VT-003', name: 'Dây curoa B-52', categoryId: 'CAT-02', unit: 'cái', stock: 15, minStock: 5, price: 120000 },
    { id: 'VT-004', name: 'Găng tay bảo hộ', categoryId: 'CAT-03', unit: 'bộ', stock: 100, minStock: 30, price: 12000 },
  ],
  equipment: [
    { id: 'TB-001', name: 'Máy nghiền số 1', location: 'Xưởng A', status: 'hoat_dong' },
    { id: 'TB-002', name: 'Băng tải chính', location: 'Xưởng B', status: 'hoat_dong' },
  ],
  schedules: [
    { id: 'BT-001', equipmentId: 'TB-001', title: 'Thay nhớt và kiểm tra vòng bi', tasks: [{ name: 'Xả nhớt cũ và thay nhớt mới', minutes: 30 }, { name: 'Kiểm tra độ rơ vòng bi', minutes: 20 }], intervalDays: 30, lastDate: _seedDate(-40), nextDate: _seedDate(-10) },
    { id: 'BT-002', equipmentId: 'TB-002', title: 'Kiểm tra dây curoa', tasks: [{ name: 'Kiểm tra độ căng dây', minutes: 15 }], intervalDays: 90, lastDate: _seedDate(-85), nextDate: _seedDate(5) },
  ],
  warehouses: [
    { id: 'KHO-01', code: 'KHO-01', name: 'Kho chính', type: 'chinh' },
    { id: 'KHO-02', code: 'KHO-02', name: 'Kho xưởng B', type: 'phu' },
  ],
  locations: [{ id: 'LOC-01', warehouseId: 'KHO-01', code: 'A1', name: 'Kệ A1' }],
  lots: [],       // { id, supplyId, lotNumber, expiry, receivedAt }
  balances: [],   // { id, warehouseId, locationId, supplyId, lotId, qty } — tổng theo vật tư luôn bằng supplies.stock
  transfers: [],  // { id, date, fromWh, toWh, by, lines:[{supplyId,lotId,qty}] }
  conversions: [{ id: 'QD-01', supplyId: 'VT-001', fromUnit: 'thùng', toUnit: 'lít', factor: 20 }],
  standards: [],  // { id, name, equipmentId, basis, status, lines:[{supplyId,qty}] }
  reorderRules: [{ id: 'RR-01', supplyId: 'VT-002', warehouseId: 'KHO-01', min: 5, max: 30, reorderPoint: 10, leadTime: 7, safety: 3 }],
  purchaseRequests: [], // { id, date, requester, warehouseId, priority, requiredDate, status, lines:[{supplyId,qty}] }
  quotes: [{ id: 'BG-01', supplierId: 'NCC-01', date: _seedDate(-10), validUntil: _seedDate(60), lines: [{ supplyId: 'VT-002', price: 46000 }] }],
  orders: [],     // { id, supplierId, requestId, date, expected, status, lines:[{supplyId,qty,price,received}] }
  compat: [       // vật tư ↔ thiết bị tương thích; vật tư không khai báo dòng nào = dùng chung mọi thiết bị
    { id: 'TT-01', supplyId: 'VT-002', equipmentId: 'TB-001', qty: 2 },
    { id: 'TT-02', supplyId: 'VT-002', equipmentId: 'TB-002', qty: 4 },
    { id: 'TT-03', supplyId: 'VT-003', equipmentId: 'TB-002', qty: 1 },
  ],
  maintLogs: [],  // { id, repairId, equipmentId, date, before, action, after, technician }
  usage: [],      // { id, repairId, issueId, supplyId, equipmentId, qty, unitCost, reason }
  approvals: [],  // { id, docType, docId, requestedBy, submittedAt, status, steps:[{order,role,label,decision,by,at,comment}] }
  forecasts: [],       // { id, supplyId, warehouseId, forecastDate, horizonDays, predictedQuantity, dailyRate, trend, confidence, modelVersion }
  recommendations: [], // { id, type, supplyId, warehouseId, reason, evidence, currentValue, proposedValue, status, createdAt, reviewedBy, reviewedAt }
  alerts: [],           // { id, type, severity, supplyId, equipmentId, warehouseId, message, createdAt, updatedAt, status, resolvedBy, resolvedAt }
  receipts: [],   // { id, date, supplyId, qty, price, supplierId, note }
  issues: [],     // { id, date, supplyId, qty, price, purpose, repairId, note }
  stocktakes: [], // { id, date, by, note, lines:[{supplyId,system,actual,diff}] }
  requests: [],   // { id, date, requester, purpose, equipmentId, repairId, lines, status, approvedBy, issuedBy, rejectReason }
  repairs: [],    // { id, date, equipmentId, title, priority, status, assignee, lines, cost, doneDate, scheduleId, note }
};
