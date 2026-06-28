# Báo cáo Phân tích Kiến trúc Kỹ thuật Dashboard và Backend API/WebSocket

## 1. Cấu trúc Định tuyến (Routing) & Quản lý Trạng thái (State Management)
* **Cấu trúc Định tuyến (Routing)**:
  * Sử dụng thư viện `react-router-dom` (v7.2.0) được cấu hình tại `dashboard/src/App.tsx`.
  * **Public Routes**: Các trang công khai (`/`, `/pricing`, `/docs`, `/login`, `/signup`, v.v.) hiển thị toàn trang độc lập, không có thanh sidebar điều hướng.
  * **App Routes**: Các trang dashboard ứng dụng (`/app`, `/app/strategies`, `/app/backtests`, v.v.) được bảo vệ bởi `AuthGuard` và bọc trong giao diện `LayoutShell` (chứa sidebar định tuyến chính).
* **Quản lý Trạng thái (State Management)**:
  * Sử dụng thư viện `zustand` (v5.0.3), tổ chức thành 3 store độc lập:
    * `auth-store.ts`: Quản lý trạng thái xác thực bằng Better Auth client (`signIn`, `signUp`), quyền hạn (`tier`, `role`), lưu trạng thái thông tin người dùng vào LocalStorage (không lưu token và apiKey để đảm bảo an toàn thông tin).
    * `dashboard-store.ts`: Lưu trữ dữ liệu về Phase 3 bao gồm tín hiệu (`signals`), các số liệu hiệu suất tổng quát (`metrics`), trạng thái admin (`adminStatus`), sức khỏe hệ thống (`health`) và cấu hình tần suất làm mới UI.
    * `trading-store.ts`: Quản lý các dữ liệu giao dịch real-time bao gồm giá thị trường (`prices`), vị thế mở/đóng (`positions`), cơ hội chênh lệch giá (`spreads`), trạng thái bot (`botStatus`), cấu hình bot (`strategies`) và danh sách lịch sử lệnh (`trades` - giới hạn tối đa 100 bản ghi).

## 2. Cách Dashboard kết nối Backend để lấy dữ liệu
* **API Clients**:
  * Sử dụng API client xây dựng trên `fetch` có cơ chế tự động đính kèm token xác thực JWT dưới dạng header `Authorization: Bearer <token>`.
  * Có sự không nhất quán giữa hai client: `useApiClient` hook (trong `hooks/use-api-client.ts`) dùng base URL `/api/v1` trong khi `apiClient` tĩnh (trong `lib/api-client.ts`) dùng base URL `/api`.
* **Cơ chế lấy dữ liệu cụ thể**:
  * **P&L**: Lấy qua HTTP REST endpoints `GET /api/pnl` và `GET /api/pnl/daily` (thông qua `usePnlAnalytics.ts`). Nếu là khách hàng RaaS, dữ liệu được tải từ `GET /api/v1/subscriber/:id/pnl` và `/api/v1/subscriber/:id/equity` (trong `use-subscriber-pnl.ts`).
  * **Active Positions**: Không có REST API cho vị thế. Trạng thái vị thế được lấy lần đầu thông qua snapshot lúc mở kết nối WebSocket, sau đó cập nhật real-time qua WebSocket message (`positions` channel / `position_update` event).
  * **Trades**: Lấy danh sách lịch sử thông qua REST API `GET /api/trades` (hoặc `GET /api/v1/subscriber/:id/trades` đối với khách hàng RaaS) và cập nhật thời gian thực bằng sự kiện WS `trade_update` / `trade_executed`.
  * **Backtests**: Trang `/app/backtests` gửi yêu cầu chạy test qua `POST /api/v1/backtest/submit` và lấy lịch sử qua `GET /api/v1/backtest/results`.

## 3. Các vấn đề & Thử thách Kỹ thuật hiện tại
1. **Xung đột framework backend (Express vs Fastify Mismatch)**:
   * Engine API server chính (`src/api/server.ts`) sử dụng **Express**.
   * Tuy nhiên, các module tính năng quan trọng được thêm vào sau đó (như `license-routes.ts`, `api-key-routes.ts`, `audit-routes.ts`, `onboarding-routes.ts` và toàn bộ các middleware liên quan đến xác thực giấy phép/giới hạn cuộc gọi) lại được viết bằng **Fastify**. Do không có server Fastify nào chạy, các endpoint quản lý license và onboarding hoàn toàn không được đăng ký và trả về lỗi 404 khi truy cập.
2. **WebSocket Server chưa được khởi tạo**:
   * `RedisWSAdapter` (`src/api/ws-adapter-redis.ts`) được thiết kế chạy trên Fastify và hoàn toàn chưa được tích hợp vào server Express (`server.ts`). Vì vậy, không có WebSocket server nào thực sự chạy trên cổng API của bot, dẫn đến việc dashboard không thể kết nối thời gian thực (hiển thị trạng thái "Offline").
3. **Thiếu API Endpoint cho Backtest**:
   * Backtest Engine backend (`src/arbitrage/backtester.ts`) đã hoàn thiện và có unit test đầy đủ, nhưng **không có route handler nào** đăng ký endpoint `/api/v1/backtest/submit` và `/api/v1/backtest/results`. Yêu cầu chạy backtest từ frontend sẽ bị lỗi 404.
4. **Không nhất quán Base URL Client và Backend Route**:
   * Client tĩnh (`lib/api-client.ts`) truy xuất `/api/subscriber/...` nhưng router backend (`server.ts`) đăng ký route này tại `/api/v1/subscriber`, dẫn tới 404 khi tải thông tin P&L của subscriber.
5. **Vấn đề biểu đồ và dữ liệu thời gian thực**:
   * Recharts (sử dụng trong `PnLAnalyticsChart`) dựng biểu đồ dạng SVG, dễ gây suy giảm hiệu năng render của trình duyệt khi số lượng dữ liệu lịch sử lớn hoặc tần suất cập nhật cao.
   * `EquityCurveChart` dùng `lightweight-charts` nhưng nhãn thời gian của các vị thế đóng được sinh giả lập (`toDateString` lùi ngày lùi số thứ tự) chứ không sử dụng thuộc tính thời gian thực (`positions.closedAt`), làm mất tính chính xác của lịch sử giao dịch.
