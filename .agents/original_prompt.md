## 2026-05-30T06:52:50Z

Dự án tối ưu hóa hiệu năng và stress test hệ thống Algo-Trader RaaS hỗ trợ tải cao (5000+ người dùng đồng thời).

Working directory: /Users/macbook/algo-trader

## Requirements

### R1. Tối ưu hóa Database & Redis Cluster
Thực hiện phân tích chỉ mục (index analysis) và tối ưu hóa các câu lệnh truy vấn PostgreSQL. Đảm bảo Redis Cluster tự động rebalance tải hiệu quả khi số lượng kết nối tăng vọt.

### R2. WebSocket Compression & Dashboard Render Polish
Tích hợp nén thông điệp WebSocket (permessage-deflate) để giảm tải băng thông mạng. Polish và tối ưu hóa hiệu năng render real-time của component biểu đồ nến và danh sách tín hiệu trên Bento Grid Dashboard.

### R3. Load Testing & Stress Verification
Xây dựng và chạy kịch bản load test tự động (k6) mô phỏng 5000+ người dùng đồng thời truy cập API Gateway và nhận dữ liệu thời gian thực qua WebSocket.

## Acceptance Criteria

### Performance & Quality
- Tỷ lệ API Latency (p95) duy trì dưới 100ms khi chạy stress test với 5000 VUs.
- Toàn bộ 1500+ tests backend và 35 tests frontend duy trì trạng thái PASS 100% sau tối ưu.
- Không xảy ra lỗi rò rỉ bộ nhớ (memory leak) trên M1 Max khi chạy stress test liên tục trong 5 phút.
