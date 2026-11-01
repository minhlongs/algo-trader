# Báo Cáo Nghiệm Thu: SaaS/Paper Staging Hardening & Khắc Phục B2/B3

- **Thời gian thực hiện:** 31/10/2026, 19:35 (Asia/Saigon)
- **Nhánh làm việc:** `fix/saas-paper-staging-hardening`
- **Mục tiêu:** Hoàn thiện hạ tầng Staging độc lập tuyệt đối (fail-closed), khắc phục toàn diện 2 Blocker B2 (Edge Health Probe & D1 Schema) và B3 (Migration Runner Split-Brain & Phân tách thư mục D1 SQLite), vá lỗi toàn vẹn webhook NOWPayments/Telegram, và thực thi xác thực/cô lập cấu hình Tenant.
- **Ranh giới tuân thủ nghiêm ngặt:** KHÔNG deploy production, KHÔNG bật live trading, KHÔNG signing/allowance/transfer, KHÔNG tự ý merge nhánh hay gửi comment ra hệ thống bên ngoài khi chưa được phê duyệt.

---

## 1. Kết Quả Khắc Phục Các Hạng Mục Kỹ Thuật

### 1.1. Blocker B2: Sửa Health Probe D1 & Bổ Sung D1 Schema `paper_trades_v3`
- **Nguyên nhân gốc:** `handleHealthRoute` trước đây chỉ kiểm tra binding `env.DB` (vốn không tồn tại trên Cloudflare Worker do tên binding thực tế là `env.SUBSCRIBERS`). Ngoài ra, bảng `paper_trades_v3` được route ledger đọc và paper loop ghi nhưng chưa có file migration D1 SQLite.
- **Giải pháp thực thi:**
  - Cập nhật `handleHealthRoute` tại `src/platform/workers/edge-proxy-inline-routes.ts`: kiểm tra cả `env.SUBSCRIBERS` và `env.DB` để xác định trạng thái D1 (`configured` / `missing`).
  - Tạo mới `migrations/d1/0003-paper-trades-v3.sql` với đầy đủ cấu trúc SQLite chuẩn (`id`, `market_id`, `side`, `size_usd`, `entry_price`, `exit_price`, `pnl`, `strategy`, `source`, `confidence`, `status`, `created_at`, `closed_at`) và 3 index (`idx_paper_trades_v3_created_at`, `idx_paper_trades_v3_status_source`, `idx_paper_trades_v3_market_id`).
  - Đồng bộ `scripts/d1-schema.sql` để bảo đảm môi trường SQLite local mirror nhất quán 100%.

### 1.2. Blocker B3: Hợp Nhất Migration Runner & Phân Tách Thư Mục D1 / PostgreSQL
- **Nguyên nhân gốc:** Tồn tại split-brain giữa `src/db/migration-runner.ts` (35 migrations + hỗ trợ rollback) và `src/shared/db/migration-runner.ts` (chỉ có 19 migrations). Đồng thời, `wrangler.toml` trỏ `migrations_dir = "src/shared/db/migrations"` chứa các file SQL chứa cú pháp PostgreSQL (`TIMESTAMPTZ`, `UUID`, `DO $$`), có nguy cơ làm hỏng D1 khi chạy `wrangler d1 migrations apply`.
- **Giải pháp thực thi:**
  - Hợp nhất `src/shared/db/migration-runner.ts` bằng cách re-export trực tiếp từ canonical runner `src/db/migration-runner.ts`. Xóa bỏ hoàn toàn tình trạng lệch pha version và migration logic.
  - Phân tách riêng thư mục D1 SQLite sang `migrations/d1/`:
    - `0001-subscriptions.sql`
    - `0002-phase33-indexes.sql`
    - `0003-paper-trades-v3.sql`
  - Cập nhật `wrangler.toml`: trỏ `migrations_dir = "migrations/d1"`. Kiểm tra tất cả file trong `migrations/d1/` không chứa bất kỳ từ khóa chuyên biệt nào của PostgreSQL (`TIMESTAMPTZ`, `UUID PRIMARY`, `DO $$`, `SERIAL PRIMARY`, `JSONB`).

### 1.3. Vá Lỗi Toàn Vẹn NOWPayments Webhook SQL
- **Nguyên nhân gốc:** Tại `src/platform/workers/api/webhooks-nowpayments-helpers.ts:107-110`, câu lệnh `INSERT INTO subscriptions` liệt kê 11 cột nhưng chỉ có 10 dấu `?` và 10 giá trị bind, dẫn đến lỗi runtime khi nhận IPN thanh toán.
- **Giải pháp thực thi:** Thêm dấu `?` thứ 11 và bind giá trị `now` cho cột `updated_at`. Đã kiểm chứng bằng test tự động đếm chính xác 11 placeholder và 11 bound values.

### 1.4. Bảo Mật Telegram Webhook & Outbound Mock Chặn Rò Rỉ Mạng
- **Giải pháp thực thi:**
  - Thêm kiểm tra header `X-Telegram-Bot-Api-Secret-Token` so với `env.TELEGRAM_WEBHOOK_SECRET` trong `handleTelegramWebhook` (`src/platform/workers/api/telegram-bot.ts`). Trả về HTTP 401 Unauthorized nếu thiếu hoặc sai token.
  - Trong `sendTelegramMessage` (`src/platform/workers/api/telegram-bot-dispatch.ts`), bổ sung cờ `env.TELEGRAM_MOCK === 'true'` để chặn toàn bộ outbound HTTP request đến `api.telegram.org` khi chạy trên môi trường staging hoặc test, log lại thông tin `[telegram] mock send message intercepted (outbound network suppressed)`.

### 1.5. Xác Thực & Cô Lập Tenant Config (Tenant Isolation Guard)
- **Giải pháp thực thi:** Cập nhật `handleTenantConfigSave` tại `src/platform/workers/edge-proxy-inline-routes.ts`. Khi `env.JWT_SECRET` được cấu hình, bắt buộc có Authorization Bearer token hợp lệ, kiểm tra quyền hạn và đảm bảo `payload.tenantId === pathTenantId` (hoặc role `admin`/`MASTER`), từ chối mọi hành vi ghi chéo tenant với HTTP 403 Forbidden.

### 1.6. Chốt An Toàn Staging Fail-Closed (`assertStagingEnvironmentSafe`)
- **Giải pháp thực thi:** Bổ sung hàm `assertStagingEnvironmentSafe` trong `tests/helpers/test-db-safety-guard.ts` để chặn đứng từ gốc:
  - Tên DB chứa `prod`, `live`, hoặc trỏ `algo_trader_prod`.
  - Cloudflare D1 ID trùng với Production D1 (`f29559f2-8e0b-461a-bd01-5665581beeee`).
  - Cloudflare KV ID trùng với Production KV (`6c7199c0259b42db943aa13b200d8ea1`).
  - Bật live trading execution (`liveTradingEnabled = true` hoặc `polymarketTradingMode = 'live'`).

---

## 2. Bằng Chứng Kiểm Thử & Kiểm Soát Chất Lượng

1. **Bộ Test Suite Mới (TDD):**
   - File: `tests/unit/platform/workers/saas-paper-staging-hardening.test.ts`
   - Kết quả: **13/13 tests PASS (100%)**
2. **Các Test Suite Liên Quan Đến DB, Migration & Worker:**
   - `tests/unit/db/migration-runner.test.ts`: PASS
   - `tests/integration/shared-db-contract.test.ts`: PASS
   - `tests/integration/db-migration-numbering-discipline-sync.test.ts`: PASS
   - `tests/integration/wrangler-cloudflare-deploy-discipline-sync.test.ts`: PASS
   - `src/platform/workers/__tests__/edge-proxy-health-route.test.ts`: PASS
   - **Tổng cộng cụm liên quan: 6 test files / 106 tests PASS.**
3. **Cụm Auth & Integration Toàn Hệ Thống:**
   - Lệnh: `npx vitest run tests/unit/platform/auth/ tests/integration/`
   - Kết quả: **95 test files / 1,057 tests PASS (100%)**.
4. **TypeScript Build & Lint:**
   - `npm run build`: Hoàn tất với **0 lỗi**.
   - `npx eslint`: **0 lỗi** trên tất cả các file mã nguồn chỉnh sửa.
   - Định mức dòng lệnh (LOC ceiling): Tất cả các file đều tuân thủ nghiêm ngặt giới hạn dưới 200 dòng (cao nhất là 178 dòng).

---

## 3. Trạng Thái Dừng & Bàn Giao

Hệ thống đã đạt đầy đủ tiêu chuẩn sẵn sàng của Staging cho SaaS và Paper Trading. Đúng theo chỉ thị an toàn:
- Toàn bộ thay đổi đang nằm cục bộ trên nhánh `fix/saas-paper-staging-hardening`.
- **DỪNG TRƯỚC MERGE:** Không merge vào main/beta, không deploy lên production, không bật live trading hay signing/allowance. Đợi lệnh phê duyệt tiếp theo từ người dùng.
