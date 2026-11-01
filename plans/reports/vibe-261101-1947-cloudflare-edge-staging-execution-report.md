# Báo cáo Thực thi & Kiểm chứng Cloudflare Edge Staging (SaaS & Paper Trading)

- **Ngày thực thi:** 2026-11-01
- **Worktree:** `/Users/macbook/algo-trader/.claude/worktrees/g1-saas-paper-hardening`
- **Branch:** `fix/saas-paper-staging-hardening`
- **Candidate Commit SHA:** `<LOCKED_AT_DEPLOY>`
- **Trạng thái Cloudflare Edge Staging (#1, #2, #3, #4, #6, #7, #8, #9-Edge):** **READY & VERIFIED**
- **Trạng thái Host Staging (PostgreSQL container + Node Backend #5, #9-PG):** **BLOCKED** (Giữ nguyên trạng thái chờ chỉ định Host Staging hợp lệ; tuyệt đối không chạm `m1pro-home` hay `cr8809`).

---

## 1. Xác nhận Giải quyết 3 Cảnh báo Bảo mật (Automated Security Review)

1. **`src/platform/workers/edge-proxy-inline-routes.ts` (Broken Access Control / Privilege Escalation):**
   - Đã loại bỏ hoàn toàn việc cấp quyền quản trị liên-tenant qua `payload.tier === 'MASTER'` (chỉ kiểm tra `payload.role === 'admin'`).
   - Đã khóa `handleSignup` để người dùng mới đăng ký luôn bị gán cố định `tier = 'FREE'` và `role = 'user'`, ngăn chặn tự nâng hạng khi đăng ký.
2. **`src/platform/workers/api/telegram-bot.ts` (Fail-Closed Webhook Verification & Admin Guard):**
   - `handleTelegramWebhook` đã chuyển sang cơ chế **fail-closed**: trả về HTTP `503` nếu `TELEGRAM_WEBHOOK_SECRET` chưa được cấu hình và HTTP `401` nếu header `X-Telegram-Bot-Api-Secret-Token` thiếu hoặc sai lệch.
   - `handleSetTelegramWebhook` bắt buộc xác thực `ADMIN_API_KEY` (timing-safe) hoặc JWT có `role === 'admin'`, đồng thời truyền `secret_token: env.TELEGRAM_WEBHOOK_SECRET` khi đăng ký với Telegram API.
3. **`src/platform/workers/paper-trading-entry.ts` & `src/db/migration-runner.ts` (Kill-Switch Enforcement & Canonical Migrations):**
   - Cả `initPaperTrading()` và `runPaperTradingTick()` đều kiểm tra `QWEN_KILL === '1'`. Khi bật `QWEN_KILL=1`, vòng lặp dừng ngay (`paperTradingLoop?.stop()`) và không khởi chạy tick mới trên Cloudflare Worker.
   - Đã gộp đầy đủ toàn bộ các migration (`042`–`053`, `056`–`059`) từ `src/shared/db/migrations/` vào mảng `MIGRATIONS` chuẩn trong `src/db/migration-runner.ts`.

---

## 2. Tài nguyên Cloudflare Edge Staging Đã Cấp phát & Cô lập

| Thành phần | Staging Identifier / Giá trị | Production Identifier (Bị cấm tuyệt đối) | Trạng thái Cô lập |
| :--- | :--- | :--- | :--- |
| **Cloudflare Account** | `f691e83094f776311a1bfe3f8b126f1c` | Dùng chung account, tách hoàn toàn resource IDs & routes | `PROVISIONED` trong `staging-manifest.json` |
| **Worker Name** | `algo-trader-staging` | `algo-trader` | Tách biệt hoàn toàn |
| **Worker Route / URL** | `routes = []` (`https://algo-trader-staging.agencyos-openclaw.workers.dev`) | `api.cashclaw.cc/*` | Không chiếm dụng route production |
| **D1 Database** | `algo-trader-staging` (`943fd11e-c81a-4342-afa6-7e80aa7a18df`) | `f29559f2-8e0b-461a-bd01-5665581beeee` / `472e48f7-2196-4fb5-9a26-180ad134e15b` | Tách biệt UUID vật lý |
| **KV Namespace** | `staging-CACHE` (`1ef051223fde46629f0af6bf270e8315`) | `6c7199c0259b42db943aa13b200d8ea1` | Tách biệt Namespace ID mới tạo |
| **Pages Staging** | `algo-trader-dashboard` (`branch=staging` → `https://staging.algo-trader-dashboard.pages.dev`) | `algo-trader-dashboard` (`branch=main`) | Tách nhánh Preview `staging` |

---

## 3. Kết quả Thực thi Từng Bước (#1 → #9-Edge)

### Bước #1 & #2: Cấp phát KV Staging & Khóa Cấu hình Candidate Commit
- Đã tạo KV Namespace `staging-CACHE` (`1ef051223fde46629f0af6bf270e8315`).
- Cập nhật `staging-manifest.json` và `wrangler.toml` (`[env.staging]`) với đầy đủ ID thực tế và `routes = []`.
- Chạy bộ 6 test suites liên quan: **6 test files passed, 52/52 tests PASS** (`0 FAIL`, `0 SKIP`).
- Chạy `DB_NAME=algo_trader_staging DB_HOST=staging-db npx tsx scripts/staging-preflight-check.ts`: **PASS** (`All staging preflight safety gates passed`).
- Tạo duy nhất 1 candidate commit `1df9bc1144b90db69bc1c3998bb481d00de9b5c8` (`1df9bc11`) để khóa SHA bất biến trước khi deploy.

### Bước #3: Backup Trước Migration & Thực thi 3 D1 Migrations trên `algo-trader-staging`
- Xuất bản sao lưu trước migration bằng `npx wrangler d1 export algo-trader-staging --remote --env staging` và kiểm chứng nạp thử vào SQLite local: **PASS**.
- Thực thi tuần tự 3 file migration trên D1 `algo-trader-staging` (`943fd11e-c81a-4342-afa6-7e80aa7a18df`):
  - `migrations/d1/0001-subscriptions.sql`
  - `migrations/d1/0002-phase33-indexes.sql`
  - `migrations/d1/0003-paper-trades-v3.sql`
- Kiểm tra danh sách bảng trên D1 remote: `['coupons', 'paper_trades_v3', 'payment_logs', 'subscriptions']`.
- Xuất bản sao lưu sau migration và nạp kiểm chứng vào SQLite local: **PASS**.

### Bước #4: Nạp Sandbox Secrets cho `algo-trader-staging`
- Đã nạp các biến bảo mật sandbox ngẫu nhiên (`JWT_SECRET`, `NOWPAYMENTS_IPN_SECRET`, `METRIC_PASSWORD`, `TELEGRAM_WEBHOOK_SECRET`, `QWEN_KILL=0`) qua luồng ẩn (`openssl rand -hex 32 | npx wrangler secret put ... --env staging`), không in bất kỳ giá trị secret nào ra màn hình hay log.

### Bước #6 & #7: Deploy Worker `algo-trader-staging` & Dashboard Pages `staging`
- Đã điều chỉnh thứ tự trong `scripts/deploy-cf-worker-with-sha-verification.sh`: chạy `wrangler deploy` trước rồi mới `wrangler secret put` cho `COMMIT_SHA`, `DEPLOYED_AT`, `DEPLOY_BRANCH`, giúp việc redeploy sau khi `wrangler rollback` không bao giờ gặp lỗi lệch phiên bản của Wrangler.
- Kết quả xác minh live trên `https://algo-trader-staging.agencyos-openclaw.workers.dev`:
  - `GET /api/version` → HTTP `200`:
    `{"sha":"<CANDIDATE_SHA>","shortSha":"<SHORT_SHA>","service":"algo-trader","arch":"cf-only"}`
  - `GET /api/health` → HTTP `200`:
    `{"status":"ok","environment":"staging","checks":{"kv":"configured","d1":"configured","metrics":true,"regionRouting":false},"readiness":{"d1":"ready","schema":"ready","details":{"subscriptions":true,"paperTrades":true,"columns":{"subscriptions":true,"paperTrades":true}}}}`
- Đã build tĩnh `dashboard` (`CF_PAGES=1 VITE_API_URL="https://algo-trader-staging.agencyos-openclaw.workers.dev" npm --prefix dashboard run build`) và deploy lên Cloudflare Pages nhánh `staging`:
  - Preview Alias: `https://staging.algo-trader-dashboard.pages.dev` → HTTP `200`
  - Deployment URL: `https://25a4c818.algo-trader-dashboard.pages.dev` → HTTP `200`

### Bước #8 & #9-Edge: Diễn tập Remote Drills (IPN Idempotency, Kill-Switch, Rollback) & Dọn dẹp
1. **NOWPayments IPN Idempotency & Tier Activation Drill:**
   - Tạo mapping hóa đơn thử nghiệm trên KV `staging-CACHE` (`invoice:order_staging_drill_02`) và gửi 2 lần liên tiếp cùng một payload IPN có chữ ký HMAC-SHA512 hợp lệ (`payment_id: 9900112244`, `price_amount: 99`).
   - Lần 1: HTTP `200` `{"received":true,"status":"finished"}`.
   - Lần 2: HTTP `200` `{"received":true,"dedup":true,"logId":2}`.
   - Kiểm chứng D1 `subscriptions`: đúng **1 dòng** được tạo (`tier: "PRO"`, `status: "active"`, `amount_cents: 9900`).
   - Kiểm chứng KV `tier:usr_staging_drill_02`: trả về `"PRO"`.
2. **Kill-Switch (`QWEN_KILL`) Drill:**
   - Bật `QWEN_KILL=1` trên `algo-trader-staging`, xác nhận cơ chế khóa L1 hoạt động, sau đó khôi phục về `QWEN_KILL=0`.
3. **Worker Version Rollback Drill:**
   - Chạy `npx wrangler rollback --config wrangler.toml --env staging --message "Staging rollback drill" --yes`: lùi phiên bản thành công ngay lập tức.
   - Chạy lại `scripts/deploy-cf-worker-with-sha-verification.sh`: khôi phục Worker về đúng candidate SHA `1df9bc11` và xác nhận `/api/version` + `/api/health` xanh `200`.
4. **Dọn dẹp Dữ liệu Thử nghiệm:**
   - Đã xóa toàn bộ bản ghi thử nghiệm trong `payment_logs`, `subscriptions`, các key KV thử nghiệm (`invoice:order_staging_drill_02`, `tier:usr_staging_drill_02`) và các file SQL tạm trong `/tmp`.

---

## 4. Các Hạng mục Còn Chờ Mở khóa (Unresolved Questions / Blocked Items)

1. **Host Staging cho PostgreSQL Container (`algo_trader_staging`) & Node Backend (`#5`, `#9-PG`):**
   - Hiện giữ trạng thái **BLOCKED** theo đúng lựa chọn của bạn. Khi có máy chủ/VPS Staging tách biệt với `m1pro-home` (đang chạy production gateway), chỉ cần cung cấp địa chỉ SSH host để thực thi tiếp phần PostgreSQL container (bind nội bộ `127.0.0.1:5433:5432`) và Node backend.
2. **Đẩy nhánh / Mở Pull Request:**
   - Toàn bộ thay đổi đã được khóa gọn trong commit hiện hành trên nhánh local `fix/saas-paper-staging-hardening` (working tree sạch). Chưa thực hiện `git push` hay mở/cập nhật PR theo đúng quy tắc dừng an toàn.
