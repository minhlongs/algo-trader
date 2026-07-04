# Design Guidelines - AGI Trader RaaS Platform (UI/UX Pro Max)

## Brand Personality
Professional, tech-first, premium, high-density. Bloomberg Terminal density meets futuristic Cyberpunk minimalist clarity.

---

## 1. Color Palette (Obsidian Deep Dark Theme)

| Token | Hex | Usage |
|-------|-----|-------|
| `--bg-primary` | `#060814` | Page background (Deep Navy-Black) |
| `--bg-secondary` | `#101426` | Card/panel background (Obsidian Dark) |
| `--bg-tertiary` | `#171c36` | Elevated surfaces, popovers, hover states |
| `--border-base` | `rgba(255,255,255,0.05)` | Default card and button border |
| `--border-active` | `rgba(255,255,255,0.20)` | Hover and active borders |
| `--text-primary` | `#f1f5f9` | Primary headings and text (Slate 100) |
| `--text-secondary` | `#94a3b8` | Subheadings, labels, descriptions (Slate 400) |
| `--text-muted` | `#475569` | Disabled/placeholder text (Slate 600) |
| `--profit` | `#00FFA3` | Neon Mint Green: Positive P&L, Buy/Long signals |
| `--profit-glow` | `rgba(0,255,163,0.15)` | Area chart fill, badge glow background |
| `--loss` | `#FF2E93` | Electric Crimson: Negative P&L, Sell/Short signals |
| `--loss-glow` | `rgba(255,46,147,0.15)` | Area chart fill, loss glow background |
| `--accent` | `#00D8FF` | Cyber Cyan: Webhooks, networks, active states |
| `--accent-secondary` | `#8B5CF6` | Tech Violet: Premium features, AI status |

---

## 2. Typography & Numbers

| Role | Font | Weight | Size / Style |
|------|------|--------|--------------|
| UI Headings | `Plus Jakarta Sans, sans-serif` | 600 | 24/18/14px |
| UI Body | `Inter, sans-serif` | 400 | 14/13px |
| Data/Numbers | `JetBrains Mono, monospace` | 500 | 14/13/12px (`tabular-nums` active) |
| System Logs | `Fira Code, monospace` | 400 | 12px (syntax highlighted) |

*   **Tabular Numbers Enforcement**: Mọi hiển thị số liệu động (PnL, Số dư, Giá) bắt buộc sử dụng `font-variant-numeric: tabular-nums` (Tailwind: `tabular-nums`) để triệt tiêu hiện tượng chữ nhảy (jittering).
*   **Case styling**: Tiêu đề nhãn (Labels) dùng `text-xs uppercase font-semibold letter-spacing-wide`.

---

## 3. Spacing & Borders (Bento Grid)
*   **Bento Layout**: Khoảng cách mặc định giữa các card trong Bento Grid là `16px` (`gap-4`).
*   **Border Radius**:
    *   Các Widget chính (Card, Charts): `12px` (`rounded-xl`).
    *   Các Input, Button, Badge: `6px` (`rounded-md`).
*   **Glassmorphism Effect**:
    *   Card background: `background: rgba(16, 20, 38, 0.6)`
    *   Glass blur: `backdrop-filter: blur(12px)`
    *   Border: `1px solid rgba(255, 255, 255, 0.05)`

---

## 4. Components & Micro-Interactions

### A. Glassmorphic Card
Card Obsidian Glass có hiệu ứng hover đổi màu border:
*   Mặc định: `border-white/5`
*   Hover: `border-white/20`, phóng to nhẹ `scale-[1.01]`, tăng nhẹ cường độ đổ bóng `shadow-2xl`.

### B. Real-Time Price/PnL Flash
Khi giá trị thay đổi thông qua WebSocket:
*   **Tăng**: Tạo hiệu ứng flash nền xanh lục nhạt `rgba(0,255,163,0.1)` trong 200ms sau đó mờ dần.
*   **Giảm**: Tạo hiệu ứng flash nền đỏ nhạt `rgba(255,46,147,0.1)` trong 200ms sau đó mờ dần.

### C. Pulse Status Indicator
Đèn LED hiển thị trạng thái hoạt động của Bot hoặc RaaS node:
*   `Active/Running`: Đèn xanh Mint Green (`#00FFA3`) kết hợp animation nhấp nháy `animate-pulse`.
*   `Error/Disconnected`: Đèn đỏ Crimson (`#FF2E93`).

---

## 5. Charts Integration
*   **Candlestick Chart (Lightweight Charts)**:
    *   Background: `#101426` (đồng bộ màu card).
    *   Grid lines: Vertical/Horizontal grid lines màu `rgba(255,255,255,0.02)`.
    *   Nến tăng: Nền xanh `#00FFA3`, viền xanh.
    *   Nến giảm: Nền đỏ `#FF2E93`, viền đỏ.
*   **PnL & Equity Curve Chart (Recharts)**:
    *   Line color: `#00FFA3` (PnL dương) hoặc `#8B5CF6` (Tổng tài sản).
    *   Area Fill: LinearGradient chuyển dần từ `--profit-glow` hoặc `--accent-secondary` sang hoàn toàn trong suốt (`opacity: 0`).
