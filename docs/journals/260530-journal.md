# Dev Journal — 2026-05-30

Phiên làm việc: **Tối ưu hóa hiệu năng chuyên sâu & Triển khai Docker Production Stack**  
Nhánh Git: [`fix/golive-blockers`](file:///Users/macbook/algo-trader)  
Tác giả: **Antigravity (AI Coding Assistant)**  

---

## 1. Sự kiện & Quyết định quan trọng

### Tối ưu hóa hiệu năng & Concurrency
*   **WebSocket Event Loop**: Loại bỏ việc sắp xếp liên tục độ trễ WebSocket gây nghẽn CPU.
*   **GasBatchOptimizer**: Khắc phục lỗi nghẽn hàng đợi (`isFlushing`) bằng cờ trạng thái `flushRequested`.
*   **Batching RPC & Redis**: Thay thế các vòng lặp N+1 blockchain RPC và Redis bằng `balanceOfBatch` (chia nhỏ 100 items/đợt) và `MGET` nhằm giảm thiểu độ trễ mạng.
*   **LLM Swarm consolidation**: Gộp Swarm debate (3 model calls) + Validation (1 model call) thành 1 prompt JSON duy nhất. Tích hợp `GpuMutex` tuần tự hóa các truy vấn LLM để chống tràn bộ nhớ GPU (OOM) trên workstation local M1 Max.
*   **File Storage**: Chuyển `file-store.ts` sang bất đồng bộ không chặn luồng (`fs/promises`) kết hợp hàng đợi ghi tuần tự (50ms debounce) để chống ghi đè tệp tin `.tmp` đồng thời.
*   **Dọn dẹp mã nguồn thừa**: Di chuyển các module liên quan đến `GruStrategy` vào [backups/dormant/](file:///Users/macbook/algo-trader/backups/dormant/).

### Triển khai hệ thống (Docker Production Stack)
*   **Khắc phục xung đột cổng mạng**: Phát hiện máy host đang chạy dự án `nhipdieuxanh-agent` chiếm các cổng mặc định. Đã chuyển toàn bộ mapping cổng của stack Algo-Trader sang các cổng trống thay thế:
    *   API: `3000` ➔ `4000`
    *   Dashboard: `3001` ➔ `4001`
    *   Webhooks: `3002` ➔ `4002`
    *   Redis: `6379` ➔ `6385`
    *   Prometheus: `9090` ➔ `9095`
    *   Grafana: `3030` ➔ `3035`
*   **Sửa lỗi Dockerfile CMD & Healthcheck**:
    *   Cập nhật default CMD từ tệp không tồn tại `dist/cli/index.js` sang tệp khởi động máy chủ API thực tế: `dist/app.js`.
    *   Sửa đổi đường dẫn healthcheck từ `/api/health` thành `/health` để khớp với API Router của Express.
*   **Bổ sung cấu hình Môi trường (.env)**:
    *   Thêm `DB_PASSWORD` cho BetterAuth khi chạy ở chế độ production.
    *   Thêm Telegram mock credentials và bọc nháy kép các biến trong Grafana `contact-points.yml` để vượt qua lỗi unmarshal number thành string của Go parser trong Grafana.

---

## 2. Kết quả Xác thực
*   **Kiểm thử tự động**: Chạy thành công toàn bộ **137 test files (1506 tests)** đỗ 100% không lỗi.
*   **Smoke Test thực tế**: Gọi API `http://localhost:4000/health` phản hồi HTTP 200 OK với trạng thái `"status":"healthy"`.
*   **Trạng thái Git**: Commit và push thành công tất cả thay đổi mã nguồn và báo cáo triển khai lên GitHub (Working tree sạch sẽ).

---

## 3. Các bước tiếp theo (Next Steps)
1.  **Cập nhật thông tin cấu hình thực tế**: Khi người dùng muốn chuyển sang live trading thực tế, cần thay thế các khóa API của Polymarket, private key ví và Telegram Bot Token/Chat ID thật vào [.env](file:///Users/macbook/algo-trader/.env).
2.  **Giám sát Live Metrics**: Truy cập Grafana dashboard tại `http://localhost:3035` để theo dõi hiệu năng của Bot HFT loop.
