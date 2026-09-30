# Quản lý vật tư tiêu hao và sửa chữa

Frontend JavaScript thuần, cấu trúc theo project Lê Nam ERP: tách UI, business logic và persistence.

## Chạy
Mở bằng web server tĩnh (XAMPP `htdocs/vattu/`, hoặc `npx serve .`) rồi vào `http://localhost/vattu/`.
Dữ liệu lưu trên KIO server (`js/api/kio-api.js` là adapter của công ty, không chỉnh sửa; `js/api/kio-bridge.js` nối adapter với các `*-api.js`). Cần truy cập được `https://kio.dvqt.vn`.

Tài khoản demo (mật khẩu `123456`): `admin`, `thukho`, `kythuat`, `quanly`.
Mật khẩu demo lưu thô ở frontend; khi nối server thật phải xác thực và băm mật khẩu phía server.

## Kiến trúc
```text
UI (mod-*.js) → Actions/business logic (app.js) → DB.* → API (*-api.js) → KioStore → storage
```
- Module giao diện không gọi persistence trực tiếp.
- `data.js` chỉ chứa config, phân quyền và dữ liệu demo seed.
- Quyền kiểm tra ở hai lớp: ẩn nút trong view (`can()`) và chặn trong Action (`guard()`).

## Cấu trúc
```text
vattu/
├── index.html
├── css/style.css
├── docs/
└── js/
    ├── app.js                      # logic yêu cầu/sửa chữa/bảo trì/người dùng + Actions + boot
    ├── app.warehouse.js            # sổ tồn theo kho/lô, chuyển kho, quy đổi đơn vị
    ├── app.purchasing.js           # đề nghị mua, báo giá, đơn mua, định mức, quy tắc đặt hàng
    ├── app.maintenance.js          # hạng mục công việc, vật tư tương thích, phê duyệt đa bước dùng chung
    ├── app.ai.js                   # dự báo nhu cầu, khuyến nghị, cảnh báo (thống kê, không gọi AI ngoài)
    ├── api/    kio-config, kio-data-utils, kio-api, supply-api, purchase-api,
    │           request-api, repair-api, maintenance-api, system-api, ai-api
    ├── core/   app.core.js         # tiện ích, Toast/Modal, Auth, router, widget bảng/form
    ├── data/   data.js
    └── modules/ mod-dashboard, mod-supplies, mod-warehouse, mod-purchasing, mod-requests, mod-reports
```

## Vai trò và quyền
| Vai trò | Quyền chính |
|---|---|
| Quản trị | Toàn quyền, quản lý người dùng, xem nhật ký |
| Thủ kho | Vật tư, nhập/xuất, kho, chuyển kho, nhà cung cấp, kiểm kê, xuất kho theo yêu cầu, lập đề nghị mua/đơn mua/báo giá/định mức/quy tắc |
| Kỹ thuật | Lệnh sửa chữa, thiết bị, lịch bảo trì, tạo yêu cầu vật tư |
| Quản lý | Duyệt yêu cầu vật tư, duyệt đề nghị mua, phê duyệt định mức, sửa chữa, bảo trì |

## Nghiệp vụ
- **Vật tư:** danh mục, tồn tối thiểu (cảnh báo thấp), nhập kho theo nhà cung cấp, xuất kho (chặn khi thiếu tồn).
- **Kiểm kê:** nhập số thực tế, hệ thống lưu chênh lệch và điều chỉnh tồn.
- **Yêu cầu vật tư:** `Chờ duyệt → Đã duyệt → Đã xuất kho` (hoặc `Từ chối` kèm lý do). Xuất kho theo kiểu tất cả hoặc không.
- **Sửa chữa:** `Mới → Đang sửa → Hoàn thành` (hoặc `Hủy`). Vật tư đã xuất qua yêu cầu gắn lệnh không bị trừ lần nữa; chi phí tính theo giá lúc xuất.
- **Bảo trì định kỳ:** chu kỳ theo ngày, cảnh báo quá hạn/sắp đến hạn, tạo lệnh sửa từ lịch; hoàn thành lệnh tự cập nhật lần bảo trì kế tiếp.
- **Báo cáo:** tồn kho, tiêu hao và chi phí sửa theo khoảng ngày, xuất CSV.
- **Nhật ký thao tác:** ghi lại các thao tác quan trọng (tối đa 500 dòng gần nhất).

## Kho nâng cao và mua hàng (giai đoạn 1–2)
- **Sổ tồn:** `DB.balances` theo kho, vị trí, lô; `supplies.stock` luôn bằng tổng các dòng. Mọi thay đổi tồn đi qua `addStock()`/`takeStock()`.
- **Xuất kho FIFO theo hạn dùng:** lô gần hết hạn lấy trước; xuất và chuyển kho chỉ tính tồn của kho được chọn.
- **Chuyển kho** giữ nguyên lô; **quy đổi đơn vị** (ví dụ 1 thùng = 20 lít) áp dụng khi nhập kho, giá tự quy về đơn vị gốc.
- **Dữ liệu cũ:** lần chạy đầu tiên sau khi nâng cấp, tồn hiện có được chuyển vào kho đầu tiên.
- **Mua hàng:** Đề nghị mua (chờ duyệt → đã duyệt) → Đơn mua (đơn giá lấy từ báo giá còn hiệu lực) → Nhận hàng nhiều lần theo lô/hạn dùng, ghi số lượng từ chối.
- **Định mức:** nháp → phê duyệt → lập yêu cầu vật tư từ định mức. **Quy tắc đặt hàng:** tối thiểu/điểm đặt lại/tối đa/lead time/tồn an toàn; nút "Đề xuất mua" tạo đề nghị mua theo kho (tối đa − tồn), không tạo trùng.


## Bảo trì đầy đủ, vật tư tương thích, phê duyệt đa bước (giai đoạn 3)
- **Hạng mục công việc:** khai báo khi tạo lệnh sửa chữa hoặc lấy theo lịch bảo trì (mỗi dòng `Tên | số phút`). Không hoàn thành được lệnh khi còn hạng mục chưa xử lý; đánh dấu "Đạt"/"Không đạt" bắt buộc nhập kết quả.
- **Vật tư tương thích thiết bị:** khai báo cặp vật tư ↔ thiết bị kèm số lượng mỗi lần thay. Vật tư đã khai báo chỉ dùng được cho đúng thiết bị đó (áp dụng khi tạo lệnh sửa chữa, yêu cầu vật tư, định mức); vật tư chưa khai báo được coi là dùng chung. Nút "Nạp vật tư tương thích" tự điền vào lệnh theo thiết bị đã chọn.
- **Nhật ký bảo trì:** hoàn thành lệnh bắt buộc nhập tình trạng trước, công việc đã làm, tình trạng sau; ghi kèm vật tư sử dụng và lý do thay thế. Xem theo lệnh (chi tiết) hoặc theo thiết bị (lịch sử thiết bị, có tổng chi phí).
- **Phê duyệt đa bước dùng chung:** engine `Approvals` (trong `app.maintenance.js`) áp dụng cho đề nghị mua — dưới 10 triệu chỉ cần Quản lý duyệt, từ 10 triệu trở lên cần thêm Giám đốc (admin) duyệt tiếp. Mỗi bước chỉ người đúng vai trò (hoặc Quản trị) mới duyệt được; từ chối ở bất kỳ bước nào dừng luôn quy trình. Tab "Phê duyệt" trong Mua hàng liệt kê mọi chứng từ và tiến trình từng bước. Cấu hình luồng theo loại chứng từ ở `CONFIG.approvalFlows`.
- **Nhật ký thay đổi chi tiết:** `Audit.change()` so sánh và lưu giá trị cũ/mới cho từng trường khi sửa vật tư, thiết bị, lịch bảo trì, người dùng (mật khẩu chỉ ghi dấu đã đổi). Xem trong Hệ thống → Nhật ký thao tác, cột "Thay đổi (cũ → mới)".

## Dự báo nhu cầu, khuyến nghị, cảnh báo (giai đoạn 4)
**Đây không phải một dịch vụ AI/ML thật.** Toàn bộ phần "AI" là mô hình thống kê minh bạch — trung bình
theo tuần cộng hồi quy tuyến tính bình phương tối thiểu trên 12 tuần lịch sử xuất kho gần nhất
(`js/app.ai.js`, model version `MA-LR-v1`) — tính ngay trong trình duyệt, không gọi bất kỳ dịch vụ bên
ngoài nào. Vì đây là ứng dụng tĩnh không có tiến trình chạy nền, người có quyền (Thủ kho, Quản lý, Quản
trị) bấm nút **"Chạy dự báo & cảnh báo"** trong menu *Dự báo & AI* để tính lại theo yêu cầu — thay cho
một tác vụ định kỳ (cron) mà một hệ thống có backend thật sẽ tự chạy.

- **Dự báo nhu cầu:** tính cho mỗi cặp (vật tư, kho) đã có quy tắc đặt hàng, theo `horizonDays` = lead
  time của quy tắc đó. Hiển thị xu hướng (tăng/giảm/ổn định), độ tin cậy (theo số tuần có dữ liệu) và một
  biểu đồ mini (sparkline SVG) của 12 tuần gần nhất.
- **Khuyến nghị:**
  - *Đặt hàng sớm* — phát hiện xu hướng tiêu hao cho thấy tồn sẽ chạm điểm đặt lại trong vòng lead time,
    **trước khi** vật lý chạm ngưỡng (khác với quy tắc đặt hàng phản ứng ở giai đoạn 2 — chỉ kích hoạt
    sau khi đã chạm ngưỡng). Áp dụng sẽ tạo đề nghị mua, đi tiếp luồng phê duyệt đa bước sẵn có.
  - *Điều chỉnh định mức* — khi tiêu hao thực tế lệch trên 40% so với định mức hiện tại, đề xuất giá trị
    min/điểm đặt lại/tối đa mới. Áp dụng sẽ cập nhật quy tắc đặt hàng và ghi nhật ký giá trị cũ/mới.
  - *Vật tư tồn đọng* — vật tư còn tồn nhưng không phát sinh xuất kho suốt 84 ngày theo dõi, đề xuất
    giảm định mức tối đa để giảm vốn tồn kho.
  - Mỗi khuyến nghị có thể **Áp dụng** hoặc **Bỏ qua**; khuyến nghị cùng loại cho cùng vật tư/kho đang
    chờ xem xét sẽ được cập nhật lý do/số liệu thay vì tạo bản ghi trùng.
- **Cảnh báo:** tồn thấp (dưới điểm đặt lại), hạn dùng (lô sắp/đã hết hạn), tiêu hao bất thường (tuần
  gần nhất cao gấp ≥2 lần trung bình 11 tuần trước), thiết bị hỏng lặp lại (≥3 lệnh sửa chữa hoàn thành
  trong 60 ngày). Đánh dấu "Đã xử lý" theo quyền: cảnh báo tồn kho/hạn dùng/tiêu hao thuộc quyền
  `ai.manage` (Thủ kho, Quản lý, Quản trị); cảnh báo thiết bị thuộc quyền `maintenance.write` (Kỹ thuật
  cũng xử lý được, đúng chuyên môn). Cảnh báo đang mở cùng loại/đối tượng không bị nhân bản khi chạy lại.
- Dashboard hiển thị thêm số cảnh báo mức cao, số khuyến nghị chờ xem xét, và danh sách cảnh báo chưa xử lý.
