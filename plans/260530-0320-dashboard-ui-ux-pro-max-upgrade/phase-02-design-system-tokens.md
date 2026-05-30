# Phase 02: Design System & Visual Tokens

*   **Ngày bắt đầu**: 2026-05-30
*   **Mức độ ưu tiên**: Cao
*   **Trạng thái**: ✅ Đã hoàn thành

---

## 1. Bối cảnh & Mục tiêu
Để mang lại trải nghiệm **UI/UX Pro Max** cao cấp, chúng ta cần một ngôn ngữ thiết kế đồng nhất và tinh tế.
**Mục tiêu**:
1. Cấu hình bảng màu Obsidian Deep Dark Theme (`#060814` và `#101426` làm chủ đạo) trong `tailwind.config.ts`.
2. Khởi tạo các tiện ích Glassmorphism (`backdrop-blur`, border siêu mỏng `border-white/5` hoặc `border-white/10`).
3. Đồng bộ hóa font chữ Google Fonts (`Plus Jakarta Sans` / `Inter` cho UI và `JetBrains Mono` / `Fira Code` cho số liệu/tabular numbers).
4. Xây dựng các component UI cơ bản (Card, Button, Badge, Glow effects).

---

## 2. Các tệp tin liên quan
*   [dashboard/tailwind.config.ts](file:///Users/macbook/algo-trader/dashboard/tailwind.config.ts) (Bảng màu, fonts, borders)
*   [dashboard/src/index.css](file:///Users/macbook/algo-trader/dashboard/src/index.css) (CSS variables, backdrop-blur, custom utilities)
*   [dashboard/src/components/ui/card.tsx](file:///Users/macbook/algo-trader/dashboard/src/components/ui/card.tsx) (UI Card glassmorphism)
*   [dashboard/src/components/ui/button.tsx](file:///Users/macbook/algo-trader/dashboard/src/components/ui/button.tsx) (UI Button pro-max)

---

## 3. Các bước thực hiện
- [x] **Bước 1: Cấu hình Tailwind Tokens**:
  * Thêm bảng màu dark mode chuyên biệt vào file `tailwind.config.ts` (ví dụ: `obsidian-bg: '#060814'`, `obsidian-card: '#101426'`, `neon-green: '#00FFA3'`, `neon-pink: '#FF2E93'`).
  * Định nghĩa font families (`sans: ['Plus Jakarta Sans', 'Inter']`, `mono: ['JetBrains Mono', 'Fira Code']`).
- [x] **Bước 2: Viết CSS Utility Classes**:
  * Định nghĩa các class glassmorphism trong `index.css`:
    ```css
    .glass-card {
      background: rgba(16, 20, 38, 0.6);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.05);
    }
    ```
  * Cấu hình class `tabular-nums` mặc định cho các ô hiển thị số liệu.
- [x] **Bước 3: Phát triển Card & Button Component**:
  * Tạo Card Glassmorphic với hiệu ứng Backlight Gradient phát sáng nhẹ ở viền khi hover.
  * Thiết kế Button dạng nhám mịn, có hiệu ứng neon glow cho các nút hành động chính.
- [x] **Bước 4: Thiết lập Font-face**:
  * Nhập Google Fonts thông qua thẻ `<link>` hoặc `@import` trong `index.html` / `index.css`.

---

## 4. Tiêu chí thành công & Bảo mật
*   **Tiêu chí thành công**:
    *   Toàn bộ dashboard hiển thị đồng nhất bảng màu Obsidian Deep Dark.
    *   Hiệu ứng Glassmorphism và Glow border hoạt động mượt mà với 60 FPS trên màn hình Retina/High-Hz.
*   **Bảo mật**:
    *   Không để lộ các token nội bộ hoặc khóa API trong CSS/Tailwind configs.
