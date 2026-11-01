# Kế Hoạch & Prompt Triển Khai Staging Cô Lập (SaaS/Paper Hardening)

- **Ngày lập:** 2026-10-31 18:55:00 (Asia/Saigon)
- **Base Commit (Release Candidate):** `4410d37edebe783a65f5041a1810bb1526c2eef7` (`origin/main`)
- **Tài liệu tham chiếu:** `plans/261031-1830-saas-paper-staging-validation/plan.md`
- **Ranh giới:** **KHÔNG DEPLOY PRODUCTION, KHÔNG TỰ BẬT LIVE, KHÔNG TỰ SỬA CODE NGOÀI BÁO CÁO.**

---

## 1. Báo Cáo Phân Tích Hiện Trạng Kiến Trúc & Các Điểm Chặn Kỹ Thuật (RC `4410d37e`)

### 1.1 Bản đồ Tính năng SaaS/Paper vs Runtime Thực tế
1. **Auth & Quản lý Phiên (Session):**
   - **Frontend Dashboard:** Dùng `better-auth/react` gọi `/api/auth/sign-in/email`, `/api/auth/get-session` (`dashboard/src/lib/auth-client.ts`).
   - **Cloudflare Worker:** Chỉ có endpoint tự viết lưu JWT vào KV `CACHE` (`user:<email>`). Khi dashboard gọi `/api/auth/*` vào Worker, request rơi vào fallback `handleVpsFallbackRoute` và trả về `501 Not Implemented: VPS backend removed — endpoint not yet migrated to CF Worker`.
   - **Express API:** Có Better Auth thật gắn vào Postgres (`user`, `session`, `account`).
   - ⚠️ **Kết luận:** **Auth bị phân mảnh.** Staging cần kiểm thử luồng đăng nhập tách bạch rõ giữa Webhook/Edge và Web Dashboard.

2. **Onboarding / BYOK (Tenant Credentials):**
   - **Cloudflare Worker:** `POST /api/tenants/:tenantId/config` ghi thẳng JSON vào KV `CACHE` (`config:<tenantId>`), **hoàn toàn không có xác thực auth hay kiểm tra tenantId**.
   - **Express API:** `/api/v1/subscriber/credentials` ghi vào PostgreSQL `tenant_credentials` có mã hóa AES-256-GCM.
   - ⚠️ **Kết luận:** Lỗ hổng cấu hình bảo mật trên Worker; cần khóa chặt xác thực và cô lập trên Staging.

3. **Cổng Webhook NOWPayments (Crypto IPN):**
   - **Lỗi cú pháp SQL nghiêm trọng trên Worker (`src/platform/workers/api/webhooks-nowpayments-helpers.ts:107-110`):**
     Câu lệnh `INSERT INTO subscriptions (...) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` liệt kê **11 cột** nhưng chỉ có **10 dấu chấm hỏi `?`** và **10 giá trị `.bind()`** (thiếu giá trị cột `updated_at`). Trên runtime SQLite/D1 thật, mọi giao dịch nạp tiền thành công sẽ gây ra lỗi `SQLite column/placeholder mismatch`!
   - ⚠️ **Kết luận:** Điểm chặn nghiêm trọng (Blocker) cho luồng nạp tiền subscription trên Edge.

4. **Telegram Bot Webhook:**
   - Worker route `POST /api/telegram/webhook` (`src/platform/workers/api/telegram-bot.ts`) chưa kiểm tra token bí mật `X-Telegram-Bot-Api-Secret-Token` đối chiếu với `env.TELEGRAM_WEBHOOK_SECRET`.
   - Hàm `sendTelegramMessage` gửi trực tiếp ra `https://api.telegram.org`.
   - ⚠️ **Kết luận:** Staging bắt buộc phải mock toàn bộ outbound HTTP gọi sang Telegram để tránh bắn tin nhắn vào kênh/bot thật.

5. **Blocker B2 (D1 Binding Health & Bảng `paper_trades_v3`):**
   - `handleHealthRoute` (`edge-proxy-inline-routes.ts:77`) kiểm tra `env.DB` thay vì `env.SUBSCRIBERS` (tên binding cấu hình trong `wrangler.toml:83`). Vì vậy D1 luôn bị báo `missing`. Ngoài ra chưa có ping kiểm tra truy vấn thật (`SELECT 1`).
   - Bảng `paper_trades_v3` được Worker truy vấn (`SELECT` tại `edge-proxy-inline-routes.ts:47` và `INSERT` tại `paper-trading-persistence.ts:95`), nhưng file `scripts/d1-schema.sql` và thư mục `migrations/` hoàn toàn không có DDL khởi tạo bảng này cho D1.

6. **Blocker B3 (Phân mảnh PostgreSQL Migration Runner & Thư mục D1/Postgres):**
   - `src/app.ts:23` import runner `src/db/migration-runner.ts` (35 migrations).
   - `src/db/index.ts:16` export runner `src/shared/db/migration-runner.ts` (19 migrations, thiếu bảng Better Auth `004` và `paper_trades_v3`).
   - `wrangler.toml:86` chỉ định `migrations_dir = "src/shared/db/migrations"` cho Cloudflare D1, trong khi thư mục đó chứa code TypeScript và file SQL của PostgreSQL.

---

## 2. Kế Hoạch Thiết Lập Môi Trường Staging Cô Lập (Zero Production Leak)

1. **Định danh Tài nguyên Tách biệt:**
   - **Hostname:** `staging-api.cashclaw.cc` (Edge Worker) & `staging.cashclaw.cc` (Pages). Tuyệt đối cấm trỏ `api.cashclaw.cc` hay `cashclaw.cc`.
   - **Worker Staging Env:** Kích hoạt `[env.staging]` trong `wrangler.toml` với `routes = []` (ngăn cướp route production).
   - **D1 Database Staging:** `algo-trader-db-staging` (tách biệt khỏi ID `f29559f2-8e0b-461a-bd01-5665581beeee`).
   - **KV Namespace Staging:** `algo-trader-cache-staging` (tách biệt khỏi ID `6c7199c0259b42db943aa13b200d8ea1`).
   - **PostgreSQL Staging:** `algo_trader_staging` trên host an toàn `localhost` / `postgres`.

2. **Chốt Bảo Vệ An Toàn Tự Động (`assertStagingDatabaseSafe` & Mock Outbound):**
   - Bộ chặn fail-closed: Từ chối khởi động nếu chuỗi kết nối chứa tên `algo_trader_prod` hoặc host production.
   - Live trading lock: Bắt buộc `LIVE_TRADING_ENABLED="false"`, `POLYMARKET_TRADING_MODE="paper"`. Bất kỳ lệnh gọi sàn thực tế nào đều trả về `ROUTED_DRY_RUN` (`simulated: true, venueSubmitted: false`).
   - Chặn rò rỉ outbound bên ngoài: Mock toàn bộ outbound `https://api.telegram.org` và `https://api.nowpayments.io` bằng interceptor test hoặc biến cờ mock.

---

## 3. Kế Hoạch Khắc Phục B2 & B3 Theo Phương Pháp TDD

1. **Khắc phục B2 (Edge Health & D1 Schema):**
   - **Red Test:** Viết unit test cho `handleHealthRoute` giả lập `env.SUBSCRIBERS` có giá trị và kiểm tra `checks.d1` chuyển sang `'ok'` sau khi chạy `SELECT 1` thành công.
   - **Green Patch:** Sửa `src/platform/workers/edge-proxy-inline-routes.ts:77` sang `env.SUBSCRIBERS`.
   - **D1 Migration:** Tạo file migration SQLite có phiên bản `migrations/d1/0003-create-paper-trades-v3-d1.sql` tạo bảng `paper_trades_v3` đầy đủ cột tương thích với câu lệnh INSERT trong `paper-trading-persistence.ts`. Đồng thời sửa lỗi 11-cột vs 10-placeholder trong `webhooks-nowpayments-helpers.ts`.

2. **Khắc phục B3 (Hợp nhất Runner PostgreSQL & Chuẩn hóa Cấu trúc Thư mục):**
   - **Red Test:** Viết test kiểm tra migration runner thực thi khi khởi động ứng dụng đảm bảo tạo đủ các bảng quan trọng (`user`, `session`, `tenant_credentials`, `signals`, `paper_trades_v3`).
   - **Green Patch:** Hợp nhất `src/shared/db/migration-runner.ts` trỏ tới danh sách 35 migrations chuẩn của `src/db/migration-runner.ts`. Sửa `wrangler.toml:86` trỏ `migrations_dir = "migrations/d1"`. Di chuyển các file SQL SQLite sang `migrations/d1/` và file SQL Postgres sang `src/db/migrations/`.

---

## 4. Kịch Bản Diễn Tập Vận Hành & Đo Lường (Drills & Verification Matrix)

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

## 5. Handoff Prompt Cho Executor (Dùng để chạy trên nhánh riêng)

Sau đây là nội dung prompt độc lập, có thể copy-paste để giao cho Claude chạy thực thi trên nhánh riêng `fix/saas-paper-staging-hardening`:

```markdown
Bạn là Claude Code làm việc trên worktree cô lập của kho lưu trữ minhlongs/algo-trader.

MỤC TIÊU:
Thực hiện kế hoạch Staging Hardening và khắc phục triệt để các lỗi kỹ thuật B2 & B3 trên nhánh riêng `fix/saas-paper-staging-hardening` từ base commit `4410d37edebe783a65f5041a1810bb1526c2eef7`, tuân thủ nghiêm ngặt quy trình TDD (Red -> Green -> Refactor) và các rào chắn an toàn.

ĐIỀU KIỆN TIÊN QUYẾT & AN TOÀN TUYỆT ĐỐI:
1. KHÔNG DEPLOY PRODUCTION, KHÔNG TỰ BẬT LIVE TRADING, KHÔNG TẠO VÍ/ALLOWANCE/TRANSFER THẬT.
2. Mọi kiểm thử phải trỏ vào database thử nghiệm an toàn (localhost / postgres / algo_trader_test_auth).
3. Đảm bảo toàn bộ 100% test suites hiện hữu và test mới đều XANH, coverage đạt chuẩn H10 (>= 80/80/80/80).

CÁC BƯỚC THỰC HIỆN CHI TIẾT:

Bước 1: Khắc phục Blocker B2 (D1 Binding Health & Schema paper_trades_v3)
- Tạo test đỏ (Red Test) kiểm tra `handleHealthRoute`: khi `env.SUBSCRIBERS` có giá trị và câu lệnh `SELECT 1` thành công, trường `checks.d1` phải trả về `ok` (hoặc `configured` nếu ping pass). Hiện tại code đọc `env.DB` nên luôn trả về `missing`.
- Cập nhật `src/platform/workers/edge-proxy-inline-routes.ts:77` để đọc `env.SUBSCRIBERS` và thực hiện ping query thật.
- Tạo migration D1: `migrations/d1/0003-create-paper-trades-v3-d1.sql` tạo bảng `paper_trades_v3` với đầy đủ cấu trúc tương thích với `paper-trading-persistence.ts:95` và `edge-proxy-inline-routes.ts:47`. Cập nhật `scripts/d1-schema.sql`.
- Sửa lỗi cú pháp SQL 11 cột vs 10 placeholder trong `src/platform/workers/api/webhooks-nowpayments-helpers.ts:107-110` (bổ sung tham số hoặc placeholder cho `updated_at`).
- Chạy test xanh và xác minh không còn lỗi logic.

Bước 2: Khắc phục Blocker B3 (Hợp nhất Runner Migration PostgreSQL & Chuẩn hóa Cấu trúc Thư mục)
- Tạo test đỏ (Red Test) kiểm tra danh sách migration khi ứng dụng khởi động (`runMigrations()`), xác nhận tất cả 35 migration bao gồm `004_better_auth_tables` và `016_qwen_paper_tracking` được áp dụng đầy đủ.
- Đồng bộ `src/shared/db/migration-runner.ts` và `src/db/migration-runner.ts` để sử cùng một danh sách migration chuẩn.
- Sửa cấu hình `migrations_dir` trong `wrangler.toml:86` trỏ về `migrations/d1` (chỉ chứa file SQL SQLite).
- Phân loại rõ: file SQLite đặt trong `migrations/d1/`, file PostgreSQL đặt trong `src/db/migrations/`.
- Chạy test kiểm tra migration trên cả DB trắng (fresh DB) và DB nâng cấp từ revision cũ.

Bước 3: Bổ sung Bộ Kiểm Thử E2E Staging & Kịch Bản Diễn Tập (Drills)
- Viết test kiểm thử ký HMAC webhook NOWPayments với fixture chuẩn và fixture giả mạo/chữ ký sai.
- Viết test xác nhận vòng lặp paper trading dừng lập tức khi bật cờ khẩn cấp `QWEN_KILL=1` hoặc `PAPER_TRADING_ENABLED=false`.
- Viết test xác minh bộ chặn an toàn ngăn chặn cấu hình staging trỏ nhầm vào DB production.

Bước 4: Báo Cáo Nghiệm Thu & Đóng Hồ Sơ
- Chạy toàn bộ các gate kiểm thử:
  * npm run test
  * npm run typecheck
  * npm run build
  * STRICT_PG_TEST=true npx vitest run tests/integration/platform/auth/
- Lập bảng tổng kết nghiệm thu: trạng thái từng bài test (PASS/FAIL/BLOCKED), thời gian chạy, log đã che secret.
- DỪNG LẠI và báo cáo, KHÔNG merge vào main, KHÔNG deploy production.
```
