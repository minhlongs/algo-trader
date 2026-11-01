# Kế Hoạch Chuẩn Bị Staging Cô Lập & Khắc Phục B2/B3 (SaaS/Paper)

- **Ngày lập:** 2026-10-31 18:50:00 (Asia/Saigon)
- **Base Commit (Release Candidate):** `4410d37edebe783a65f5041a1810bb1526c2eef7` (`origin/main`)
- **Nhánh dự kiến cho đợt fix/staging:** `fix/saas-paper-staging-hardening`
- **Worktree:** `/Users/macbook/algo-trader/.claude/worktrees/g1-saas-paper-hardening`
- **Ranh giới:** **KHÔNG DEPLOY PRODUCTION, KHÔNG TỰ BẬT LIVE, KHÔNG TỰ SỬA CODE NGOÀI REPORT TRONG PHIÊN TƯ VẤN.**

---

## 1. Bản Đồ Tính Năng SaaS/Paper & Ma Trận Kiến Trúc Thực Tế

| Tầng / Luồng tính năng | Giao diện / Entrypoint | Runtime xử lý | Cơ chế Auth / Tenant | Cơ chế Lưu trữ / Persistence | Hiệu ứng biên ngoài (External Effects) | Hiện trạng Kỹ thuật & Đánh giá |
|---|---|---|---|---|---|---|
| **1. Onboarding / BYOK / Credentials** | Dashboard `/settings`, `ApiServer` `/api/v1/subscriber/credentials` | Node.js Express (`dist/app.js`) | JWT Bearer / Better Auth Cookie, kiểm tra `tenantId` qua `tenantContext` | PostgreSQL (`tenant_credentials` v2 có mã hóa AES-256-GCM) | Không gọi sàn khi chỉ lưu key; gọi test connection nếu user bấm verify | **Chưa nối Edge Worker.** Trên Edge Worker, `/api/tenants/:id/config` chỉ lưu JSON vào KV (`config:<tenantId>`), không gọi DB. |
| **2. Auth & Quản lý Phiên (Session)** | Dashboard `auth-client.ts`, `/api/auth/*` | **Phân mảnh 2 nơi:**<br>1. Edge Worker: JWT độc lập trong KV (`user:<email>`)<br>2. Express API: Better Auth Postgres (`user`, `session`, `account`) | Edge Worker: JWT Bearer tự ký (`JWT_SECRET`).<br>Express: Better Auth Cookie Session (`better-auth.session_token`) | Edge Worker: Cloudflare KV (`CACHE`).<br>Express: PostgreSQL (`algo_trader_test_auth` / `algo_trader_prod`) | Không có outbound ngoài gửi email kích hoạt (nếu Resend được cấu hình). | **B2/B3 Rủi ro phân mảnh:** User đăng nhập qua Edge Worker chỉ lưu trên KV; nếu dashboard gọi sang Express API sẽ không nhận diện session nếu chưa cấu hình chia sẻ auth. |
| **3. Cổng Đăng Ký Gói & Nâng Cấp (Subscriptions & Tiers)** | Dashboard `/pricing`, `/api/v1/subscriptions/*` | Cloudflare Worker (`subscriptions-handlers.ts`) | JWT Bearer hoặc header user | Cloudflare D1 (`subscriptions`, `algo-trader-db`) | Gọi NOWPayments API tạo hóa đơn crypto (`POST https://api.nowpayments.io/v1/invoice`). | **HOẠT ĐỘNG TRÊN EDGE** nếu có D1 và `NOWPAYMENTS_API_KEY`. Trả fallback FREE nếu chưa có D1. |
| **4. Webhook Thanh Toán NOWPayments (Crypto IPN)** | `POST /api/webhooks/nowpayments` | **Có cả ở 2 runtime:**<br>1. Worker: `webhooks-nowpayments.ts`<br>2. Express: `nowpayments-webhook.ts` | HMAC-SHA512 qua header `X-NOWPayments-Sig` | Worker: D1 `payment_logs` & `subscriptions`.<br>Express: Postgres `payments` & `licenses`. | Trả 200/502 cho server NOWPayments; không gửi tiền đi. | **Cần staging secret riêng** (`NOWPAYMENTS_IPN_SECRET`), mô phỏng fixture có chữ ký HMAC hợp lệ. |
| **5. Telegram Bot Webhook** | `POST /api/telegram/webhook` | Cloudflare Worker (`telegram-bot.ts`) | Khóa bí mật token bot Telegram | Cloudflare KV (`tg_user:<id>`) & D1 `subscriptions` | Gửi tin nhắn phản hồi Telegram qua `POST https://api.telegram.org/bot<token>/sendMessage` | **Cần mock Telegram outbound** trên staging để không gửi tin nhắn tới bot/kênh thật. |
| **6. Paper Trading Loop & Ledger** | Cron 5 phút (`scheduled`), `POST /api/v1/paper-trading/tick`, `GET /api/v1/paper-trades` | Cloudflare Worker (`edge-proxy.ts` -> `paper-trading-entry.ts`) | Read-only ledger không cần auth; tick yêu cầu `CRON_SECRET` | KV `paper-trading-loop-state` và D1 `paper_trades_v3` | Lấy giá public từ Polymarket Gamma API (`https://gamma-api.polymarket.com/markets`); ghi log paper, **0 gửi lệnh sàn**. | **B2 Blocker:** Bảng `paper_trades_v3` chưa có trong `scripts/d1-schema.sql` (chỉ có `paper_trades`), và `/api/health` đọc nhầm `env.DB` thay vì `env.SUBSCRIBERS`. |

---

## 2. Kế Hoạch Thiết Lập Môi Trường Staging Cô Lập (Zero Production Leak)

### 2.1 Định danh Tài nguyên Staging riêng biệt
- **Hostname Staging:** `staging-api.cashclaw.cc` (Worker) và `staging.cashclaw.cc` (Pages). Tuyệt đối **không** dùng `api.cashclaw.cc` hay `cashclaw.cc`.
- **Cloudflare Worker Staging Environment:** Kế thừa từ `[env.staging]` trong `wrangler.toml:114-119`:
  - `name = "algo-trader-staging"`
  - `routes = []` (bắt buộc rỗng để không cướp route production).
- **D1 Staging Database:** Tạo database D1 riêng: `algo-trader-db-staging` (hoàn toàn tách biệt khỏi `f29559f2-8e0b-461a-bd01-5665581beeee`).
- **KV Staging Namespace:** Tạo KV riêng: `algo-trader-cache-staging` (tách biệt khỏi `6c7199c0259b42db943aa13b200d8ea1`).
- **PostgreSQL Staging:** CSDL riêng `algo_trader_staging` (không dùng chung `algo_trader_prod`), áp dụng bộ bảo vệ an toàn `assertTestDatabaseSafe` hoặc biến thể `assertStagingDatabaseSafe`.
- **Mock External Outbound:**
  - Mock Telegram Bot API: Chuyển hướng `https://api.telegram.org` sang mock server nội bộ hoặc biến cờ `TELEGRAM_MOCK=true`.
  - Mock NOWPayments API: Không dùng live API key; dùng test sandbox hoặc local test runner ký HMAC tổng hợp.
  - Sàn giao dịch: Bắt buộc `LIVE_TRADING_ENABLED="false"`, `POLYMARKET_TRADING_MODE="paper"`, không cấu hình private key ví tiền thật.

---

## 3. Kế Hoạch Sửa Lỗi Kỹ Thuật B2 & B3 Theo Phương Pháp TDD

### 3.1 Khắc phục B2 (D1 Binding Health & Schema `paper_trades_v3`)
1. **Kiểm thử đỏ (Red Test):**
   - Viết unit test cho `handleHealthRoute` chứng minh khi `env.SUBSCRIBERS` có giá trị thì `checks.d1` phải trả về `'configured'` (hiện tại code kiểm tra `env.DB` nên luôn trả về `'missing'`).
   - Bổ sung kiểm tra thực hiện truy vấn ping thật (`SELECT 1`) đối với D1 để phân biệt "đã bind" với "truy vấn thành công".
   - Viết contract test kiểm tra schema D1 cho `paper_trades_v3` đảm bảo các cột khớp 100% với câu lệnh INSERT trong `paper-trading-persistence.ts:95` và SELECT trong `edge-proxy-inline-routes.ts:47`.
2. **Bản vá xanh (Green Patch):**
   - Sửa `src/platform/workers/edge-proxy-inline-routes.ts:77`: Đọc `env.SUBSCRIBERS` thay vì `env.DB`.
   - Tạo file migration có phiên bản cho D1: `migrations/0003-create-paper-trades-v3-d1.sql` định nghĩa bảng `paper_trades_v3` đúng cú pháp SQLite, và đồng bộ vào `scripts/d1-schema.sql`.

### 3.2 Khắc phục B3 (Hợp nhất PostgreSQL Migration Runner & Tách Rõ D1/Postgres)
1. **Kiểm thử đỏ (Red Test):**
   - Viết test kiểm tra tính toàn vẹn của danh sách migration khởi động trong `src/app.ts`: Đảm bảo các bảng cốt lõi như `user` (Better Auth 004), `signals` (016) và `paper_trades_v3` (016) được áp dụng tự động khi chạy `runMigrations()`.
2. **Bản vá xanh (Green Patch):**
   - Xác định `src/db/migration-runner.ts` là migration runner đầy đủ hơn (35 migrations so với 19 của `src/shared/db/migration-runner.ts`).
   - Đảm bảo `src/shared/db/migration-runner.ts` re-export hoặc đồng bộ toàn bộ migration hợp lệ, đăng ký `004_better_auth_tables` và `016_qwen_paper_tracking`.
   - Tách bạch cấu trúc thư mục:
     - SQLite/D1 migrations: Giữ trong `migrations/d1/` (chỉ chứa file SQL SQLite).
     - PostgreSQL migrations: Giữ trong `src/db/migrations/` hoặc `src/shared/db/migrations/`.
     - Xóa bỏ sự nhầm lẫn của 2 file Postgres DDL nằm trong thư mục gốc `migrations/`.

---

## 4. Kịch Bản Diễn Tập Vận Hành & Khôi Phục (Drills & Verification Matrix)

1. **Diễn tập Di chuyển Schema (Migration & Rollback Drill):**
   - Chạy migration trên DB trắng (fresh DB) -> kiểm tra 100% bảng tạo thành công.
   - Chạy migration trên DB có sẵn dữ liệu ở revision cũ -> kiểm tra tính tương thích ngược, không mất dữ liệu.
   - Thử nghiệm rollback migration gần nhất (`rollbackLastMigration()`) và đo đạc thời gian thực hiện.
2. **Diễn tập Cầu Dao Khẩn Cấp (Kill-Switch Drill):**
   - Giả lập vòng lặp paper trading đang chạy; gửi lệnh bật `QWEN_KILL=1` -> xác nhận vòng lặp dừng ngay trong tick kế tiếp.
   - Chuyển `PAPER_TRADING_ENABLED="false"` -> xác nhận endpoint `/api/v1/paper-trading/tick` từ chối thực thi.
3. **Diễn tập Rollback Code Worker:**
   - Thực hiện lệnh rollback qua `npx wrangler rollback --config wrangler.toml` trên môi trường staging.
   - Đo thời gian phục hồi thực tế từ lúc phát lệnh đến lúc endpoint `/api/version` trả về commit cũ.
4. **Diễn tập Phục hồi Dữ liệu (Backup / Restore Drill):**
   - Xuất dữ liệu staging D1 ra file `.sql`.
   - Xóa bảng giả lập và phục hồi lại từ file backup. Ghi nhận thời gian khôi phục thực tế (RTO).

---

## 5. Tiêu Chí Nghiệm Thu Đợt Staging (Definition of Done)

1. **100% Suite Tests Xanh & Coverage Đạt Chuẩn H10:** Mọi thay đổi sửa lỗi B2/B3 phải có test đỏ trước, test xanh sau, và toàn bộ gate CI (bao gồm `Gate 1c` PostgreSQL Auth thật) đều đạt.
2. **Không Rò Rỉ Tài Nguyên Production:** 100% request và biến môi trường của staging trỏ tới DB, KV và secrets của staging; không có lệnh gọi thật nào gửi ra ngoài sàn Polymarket hoặc Telegram/NOWPayments thật.
3. **Báo Cáo Nghiệm Thu Rõ Ràng:** Lập biên bản nghiệm thu ghi nhận kết quả từng bài test (`PASS`/`FAIL`/`BLOCKED`/`NOT RUN`), đính kèm log đã che secret, thời gian phục hồi thực đo, và đưa ra kết luận **STAGING VERIFIED** hoặc **BLOCKED**.
4. **Điểm Dừng Tuyệt Đối:** Dừng lại sau khi hoàn tất nghiệm thu staging; không tự ý deploy production.
