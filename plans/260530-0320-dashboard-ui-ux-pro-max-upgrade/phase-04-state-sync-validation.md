# Phase 04: Real-Time State Sync & E2E Validation

*   **Ngày bắt đầu**: 2026-05-30
*   **Mức độ ưu tiên**: Cao
*   **Trạng thái**: ⏳ Chưa bắt đầu

---

## 1. Bối cảnh & Mục tiêu
WebSocket Server và Client cần được đồng bộ hoàn hảo để đảm bảo trạng thái giao dịch (Số dư, Vị thế, Lệnh) được cập nhật ngay lập tức mà không cần F5 trình duyệt.
**Mục tiêu**:
1. Đồng bộ hóa WebSocket client trong dashboard với Zustand store (`trading-store.ts`).
2. Tích hợp cơ chế tự động kết nối lại (Auto-Reconnect) và đo lường độ trễ mạng (Network Latency).
3. Triển khai danh sách logs cuộn mượt mà có ảo hóa (Virtualization) bằng `tanstack-virtual` để tránh đơ giao diện khi có số lượng log lớn.
4. Chạy kiểm thử E2E (Playwright) và xác thực visual/functional trước khi Golive.

---

## 2. Các tệp tin liên quan
*   [dashboard/src/stores/trading-store.ts](file:///Users/macbook/algo-trader/dashboard/src/stores/trading-store.ts) (Zustand store)
*   [dashboard/src/hooks/use-websocket.ts](file:///Users/macbook/algo-trader/dashboard/src/hooks/use-websocket.ts) (WebSocket hook)
*   [dashboard/src/components/SystemLogs.tsx](file:///Users/macbook/algo-trader/dashboard/src/components/SystemLogs.tsx) (Widget hiển thị logs)
*   [dashboard/tests/e2e/dashboard-performance.spec.ts](file:///Users/macbook/algo-trader/dashboard/tests/e2e/dashboard-performance.spec.ts) (Playwright test)

---

## 3. Các bước thực hiện
- [ ] **Bước 1: Kết nối Zustand & WebSocket**:
  * Phát triển `useWebSocket` hook để khởi tạo kết nối `ws://` khi người dùng đăng nhập.
  * Lắng nghe các sự kiện: `price_update`, `position_update`, `trade_executed`, `system_health`.
  * Khi nhận được sự kiện, cập nhật tương ứng vào `tradingStore` của Zustand (ví dụ: `setPrices`, `updatePosition`, `addTrade`).
- [ ] **Bước 2: Đo lường độ trễ & Auto-Reconnect**:
  * Gửi định kỳ tin nhắn `ping` tới WebSocket server và đo thời gian nhận phản hồi `pong` để hiển thị Network Latency (ms) dạng nhấp nháy đèn neon trên Dashboard.
  * Tích hợp thuật toán Exponential Backoff để tự động kết nối lại khi mất mạng.
- [ ] **Bước 3: Tối ưu hóa System Logs Widget**:
  * Thay thế trình hiển thị logs thông thường bằng `@tanstack/react-virtual` để chỉ render các dòng log đang hiển thị trên màn hình.
  * Đảm bảo logs tự động cuộn xuống dưới (Auto-scroll to bottom) khi có log mới nhưng tạm dừng cuộn nếu người dùng đang cuộn lên để xem lại logs cũ.
- [ ] **Bước 4: Viết và chạy E2E Tests**:
  * Viết các kịch bản kiểm thử bằng Playwright để xác thực:
    *   Đăng nhập ➔ Chuyển sang Dashboard ➔ Mở kết nối WebSocket thành công.
    *   Yêu cầu chạy Backtest ➔ Nhận kết quả và render biểu đồ.
  * Đảm bảo toàn bộ test pass 100%.

---

## 4. Tiêu chí thành công & Bảo mật
*   **Tiêu chí thành công**:
    *   Màn hình dashboard chuyển từ trạng thái "Offline" sang "Online" ngay lập tức khi máy chủ backend hoạt động.
    *   Trình duyệt duy trì mức sử dụng RAM thấp (<150MB) ngay cả khi nhận liên tục 100 WebSocket messages/giây trong 1 giờ.
*   **Bảo mật**:
    *   Xác thực kết nối WebSocket bằng cách gửi JWT Token trong tin nhắn `auth` đầu tiên.
    *   Đóng kết nối ngay lập tức nếu token không hợp lệ hoặc hết hạn.
