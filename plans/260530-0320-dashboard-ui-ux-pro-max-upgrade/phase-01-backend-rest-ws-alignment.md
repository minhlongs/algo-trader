# Phase 01: Backend REST & WebSocket Alignment

*   **Ngày bắt đầu**: 2026-05-30
*   **Mức độ ưu tiên**: Cao nhất (Giai đoạn nền tảng)
*   **Trạng thái**: ✅ Đã hoàn thành

---

## 1. Bối cảnh & Mục tiêu
Báo cáo phân tích kỹ thuật cho thấy hệ thống API server chính chạy bằng Express, nhưng các endpoint quan trọng (như quản lý license, api key, audit, onboarding) lại được viết cho Fastify. Đồng thời WebSocket Server (`RedisWSAdapter`) chưa được tích hợp vào Express, khiến Dashboard hoàn toàn bị cô lập ngoại tuyến (Offline) và trả về lỗi 404 khi gọi một số endpoint.
**Mục tiêu**:
1. Đăng ký lại toàn bộ Fastify routes sang Express Router trong `src/api/server.ts`.
2. Hợp nhất Base URL client (thống nhất dùng `/api` hoặc `/api/v1` ở cả frontend và backend).
3. Đăng ký các API endpoint cho Backtest Engine (`POST /api/v1/backtest/submit`, `GET /api/v1/backtest/results`).
4. Tích hợp `RedisWSAdapter` trực tiếp vào máy chủ HTTP Express bằng thư viện `ws`.

---

## 2. Các tệp tin liên quan
*   [src/api/server.ts](file:///Users/macbook/algo-trader/src/api/server.ts) (Đăng ký routes và WebSocket)
*   [src/api/ws-adapter-redis.ts](file:///Users/macbook/algo-trader/src/api/ws-adapter-redis.ts) (WebSocket adapter)
*   [dashboard/src/lib/api-client.ts](file:///Users/macbook/algo-trader/dashboard/src/lib/api-client.ts) (API client)
*   [dashboard/src/hooks/use-api-client.ts](file:///Users/macbook/algo-trader/dashboard/src/hooks/use-api-client.ts) (API client hook)

---

## 3. Các bước thực hiện
- [x] **Bước 1: Hợp nhất Fastify Routes sang Express**:
  * Chuyển đổi mã nguồn trong các file routes (như `license-routes.ts`, `api-key-routes.ts`, `onboarding-routes.ts`) để sử dụng cú pháp của **Express Router** (`router.get`, `router.post`).
  * Đăng ký các router này vào server Express chính tại `src/api/server.ts` dưới tiền tố thống nhất.
- [x] **Bước 2: Xây dựng Routes cho Backtester**:
  * Tạo file route handler cho backtest tại `src/api/routes/backtest.ts`.
  * Kết nối trực tiếp endpoint với `BacktestEngine` (`src/arbitrage/backtester.ts`).
- [x] **Bước 3: Tích hợp WebSocket Server**:
  * Sửa đổi `RedisWSAdapter` để nó nhận đối tượng `http.Server` của Express làm server nền.
  * Khởi tạo adapter này khi máy chủ API Express bắt đầu lắng nghe (`app.listen`).
- [x] **Bước 4: Đồng bộ hóa Client Base URL**:
  * Cập nhật `dashboard/src/lib/api-client.ts` và `dashboard/src/hooks/use-api-client.ts` để sử dụng chung base URL là `/api/v1` (khớp hoàn chỉnh với router backend).

---

## 4. Tiêu chí thành công & Bảo mật
*   **Tiêu chí thành công**:
    *   Tất cả các endpoint `/api/v1/license/*`, `/api/v1/onboarding/*`, `/api/v1/backtest/*` phản hồi đúng mã HTTP (200/201) thay vì 404.
    *   WebSocket Server chấp nhận kết nối tại địa chỉ `ws://localhost:4000`.
*   **Bảo mật**:
    *   Toàn bộ endpoint mới phải được bảo vệ bởi middleware xác thực JWT hoặc API Key của Algo-Trader.
    *   Kiểm soát quyền truy cập theo tenant (Row-Level Security).
