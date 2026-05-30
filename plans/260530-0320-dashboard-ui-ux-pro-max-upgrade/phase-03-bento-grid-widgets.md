# Phase 03: Bento Grid Widgets & Advanced Charts

*   **Ngày bắt đầu**: 2026-05-30
*   **Mức độ ưu tiên**: Cao
*   **Trạng thái**: ⏳ Chưa bắt đầu

---

## 1. Bối cảnh & Mục tiêu
Các trang giao dịch hiện tại hiển thị biểu đồ và số liệu chưa được tối ưu hóa hiệu năng, thiếu tính liên kết dạng Bento và sử dụng nhãn thời gian giả lập cho lịch sử giao dịch.
**Mục tiêu**:
1. Thiết kế lại trang Dashboard chính (`dashboard-page.tsx`) theo cấu trúc Bento Grid 12-cột.
2. Tích hợp thư viện Lightweight Charts (TradingView) để hiển thị biểu đồ Candlestick & Volume real-time cho bot.
3. Thay thế biểu đồ P&L SVG tĩnh bằng Recharts động với hiệu ứng chuyển động mượt mà.
4. Nâng cấp bảng lịch sử Trades sử dụng `tabular-nums` và ánh xạ thời gian thực (`closedAt`).
5. Tạo Form chạy Backtest chuyên nghiệp với đầy đủ tùy chọn chiến thuật, chỉ số, thời gian, vốn khởi điểm.

---

## 2. Các tệp tin liên quan
*   [dashboard/src/pages/dashboard-page.tsx](file:///Users/macbook/algo-trader/dashboard/src/pages/dashboard-page.tsx) (Giao diện chính)
*   [dashboard/src/pages/backtests-page.tsx](file:///Users/macbook/algo-trader/dashboard/src/pages/backtests-page.tsx) (Trang backtest)
*   [dashboard/src/components/PnLAnalyticsChart.tsx](file:///Users/macbook/algo-trader/dashboard/src/components/PnLAnalyticsChart.tsx) (Biểu đồ P&L)
*   [dashboard/src/components/EquityCurveChart.tsx](file:///Users/macbook/algo-trader/dashboard/src/components/EquityCurveChart.tsx) (Biểu đồ Equity)

---

## 3. Các bước thực hiện
- [ ] **Bước 1: Tái cấu trúc Bento Grid**:
  * Chuyển đổi layout `dashboard-page.tsx` sang CSS Grid. Chia các widget thành:
    *   *Widget 1 (col-span-8)*: Biểu đồ giá thời gian thực (Lightweight Charts).
    *   *Widget 2 (col-span-4)*: Trạng thái bot, Connection Latency & nút Bật/Tắt khẩn cấp.
    *   *Widget 3 (col-span-12)*: Biểu đồ P&L và Equity Curve (Recharts).
    *   *Widget 4 (col-span-6)*: Danh sách Vị thế mở (Active Positions) & Lịch sử lệnh.
    *   *Widget 5 (col-span-6)*: Logs hệ thống thời gian thực (Terminal log stream).
- [ ] **Bước 2: Tích hợp Lightweight Charts**:
  * Cài đặt `@types/lightweight-charts` và `@tradingview/lightweight-charts` nếu chưa có.
  * Xây dựng wrapper component nhận dữ liệu nến thời gian thực từ WebSocket và cập nhật biểu đồ Canvas.
- [ ] **Bước 3: Tối ưu hóa Recharts**:
  * Nâng cấp `PnLAnalyticsChart` để hiển thị Area Chart mượt mà với gradient tô bóng phía dưới.
  * Sửa lỗi thời gian giả lập của `EquityCurveChart` để hiển thị đúng trục thời gian dựa trên timestamp của trade.
- [ ] **Bước 4: Thiết kế Backtest Form**:
  * Tạo form tương tác cao cấp sử dụng `shadcn` Form + Zod validation.
  * Cung cấp các input để người dùng chọn cặp giao dịch, sàn giao dịch, vốn và chiến thuật.

---

## 4. Tiêu chí thành công & Bảo mật
*   **Tiêu chí thành công**:
    *   Biểu đồ nến Lightweight Charts hiển thị mượt mà với độ trễ <50ms sau khi nhận WebSocket message.
    *   Form backtest validate dữ liệu đầu vào thành công và gửi request chính xác lên backend.
*   **Bảo mật**:
    *   Ngăn chặn lỗ hổng XSS khi hiển thị logs hệ thống thời gian thực từ server bằng cách escape ký tự đặc biệt.
