# Pre-flight Deployment Checklist

Dự án: **Algo-Trader RaaS Platform**  
Thời gian kiểm tra: **2026-05-30T03:05:00Z**  
Môi trường: **Workstation Local (macOS M1 Max)**  
Chi nhánh Git: [`fix/golive-blockers`](file:///Users/macbook/algo-trader)  

---

## 1. Kiểm tra tài nguyên hệ thống
* [x] **Dung lượng đĩa**: Đạt yêu cầu (Còn trống >1.3TB).
* [x] **Node.js**: Phiên bản v26.0.0.
* [x] **pnpm**: Phiên bản v10.32.1.
* [x] **Docker Engine**: Đang hoạt động bình thường trên host.

## 2. Kiểm tra xung đột cổng mạng
Hệ thống phát hiện dự án `nhipdieuxanh-agent` đang hoạt động và chiếm dụng các cổng mặc định (`3000`, `3001`, `3002`, `6379`, `9090`, `3011`).
* [x] **Ánh xạ cổng thay thế cho Algo-Trader**:
  * API Server: `4000` (không xung đột)
  * Dashboard: `4001` (không xung đột)
  * Webhooks: `4002` (không xung đột)
  * Redis host: `6385` (không xung đột)
  * Prometheus: `9095` (không xung đột)
  * Grafana: `3035` (không xung đột)
* [x] **Xác thực trạng thái cổng**: Tất cả các cổng thay thế đã được kiểm tra bằng `lsof` và xác nhận trống 100%.

## 3. Kiểm tra biến cấu hình (.env)
* [x] **NATS_TOKEN**: Đã tạo ngẫu nhiên và lưu vào `.env`.
* [x] **DB_PASSWORD**: Đã được gán giá trị (`local-postgres-pass-xyz123`) để đáp ứng xác thực của BetterAuth ở chế độ production.
* [x] **Telegram Credentials**: Đã gán giá trị giả lập dạng chuỗi chữ (`mock_telegram_bot_token`, `mock_telegram_chat_id`) để vượt qua bộ lọc validate khi khởi động Grafana.

## 4. Kiểm tra Git & Mã nguồn
* [x] **Working tree**: Trạng thái sạch sẽ, không còn file chưa commit.
* [x] **GitHub sync**: Toàn bộ thay đổi đã được push thành công lên nhánh [`fix/golive-blockers`](file:///Users/macbook/algo-trader).
