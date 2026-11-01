# Hồ Sơ Đóng Hardening (PR #214) & Chuẩn Bị Release Candidate SaaS/Paper

- **Ngày lập:** 2026-10-31 18:05:00 (Asia/Saigon)
- **Repository:** `minhlongs/algo-trader`
- **Release Candidate SHA (`origin/main`):** `4410d37edebe783a65f5041a1810bb1526c2eef7`
- **PR / Issue liên quan:** [PR #214](https://github.com/minhlongs/algo-trader/pull/214) (`MERGED`), [Issue #213](https://github.com/minhlongs/algo-trader/issues/213) (`CLOSED`)
- **Trạng thái thẩm quyền merge PR #214:** **Chưa xác minh quyền merge** (xem Mục 1.1)
- **Kết luận Hardening:** **Đã merge và CI hậu merge đạt** *(Không phải “GO LIVE hoàn tất”)*
- **Quyết định triển khai hiện tại:** **BLOCKED** *(Chờ chủ dự án duyệt và xử lý các điều kiện tiên quyết trước khi deploy — xem Mục 6)*

---

## 1. Kết Luận Hardening, Đối Chiếu Trạng Thái & Giới Hạn Bằng Chứng

### 1.1 Đối chiếu trạng thái Git/GitHub & Quyền thực hiện
- **`origin/main` HEAD:** `4410d37edebe783a65f5041a1810bb1526c2eef7` (`fix(polymarket): harden order lifecycle, execution mode, arb pricing and coverage gates (#214)`, squash-merged lúc `2026-10-31T10:52:08Z` từ nhánh `fix/g1-saas-paper-hardening` ở SHA `1758e0db70d62ddc19ecde36a455c65ba4f8b87c`).
- **Issue #213:** Đã đóng (`CLOSED` lúc `2026-10-31T10:52:10Z`), đang gắn nhãn `ready to ship stable`.
- **Kiểm toán quyền merge (`--ship`):**
  - Các báo cáo bàn giao trước đó (`advise-261030-pr214-auth-security-plan.md`, `advise-261030-pr214-claude-security-handoff.md`) và chỉ thị ban đầu của chủ dự án yêu cầu **DỪNG TRƯỚC MERGE**.
  - Lệnh `/ak-vibe go next --ship` ở lượt trước đã kích hoạt bước 13 của quy trình `ak-vibe` (tự động squash-merge PR #214 và đăng comment tổng kết `#issuecomment-6542460498` trên Issue #213, `#issuecomment-6542460745` trên PR #214).
  - Do không có phê duyệt văn bản tường minh của chủ dự án hủy lệnh “DỪNG TRƯỚC MERGE” sau khi rà soát SHA `1758e0db70d62ddc19ecde36a455c65ba4f8b87c`, quyền thực hiện merge được ghi nhận là **“chưa xác minh quyền merge”**. Theo đúng quy tắc an toàn, không revert lịch sử `main` khi chưa có lệnh của chủ dự án.

### 1.2 Tổng hợp kết quả CI hậu merge trên `4410d37edebe783a65f5041a1810bb1526c2eef7`

| Workflow | Run ID & Link | Kết quả từng Job | Phân loại |
|---|---|---|---|
| **CI** | [`41193760512`](https://github.com/minhlongs/algo-trader/actions/runs/41193760512) | `Gate 1` (`124515673769`), `Gate 1b` (`124516712901`), `Gate 1c` (`124515673797`), `Gate 2` (`124515673634`), `Gate 3` (`124515673805`), `Gate 4` (`124515673776`), `Gate 5` (`124516712875`), `Gate 6` (`124515673779`), `Gate 7` (`124515673895`), `Gate 8` (`124516712862`) | **10/10 PASS** |
| **CI/CD — Test, Build, Deploy** | [`41193760480`](https://github.com/minhlongs/algo-trader/actions/runs/41193760480) | `Test Suite` (`124515673592`): **PASS**<br>`Docker Build` (`124516416204`): **PASS**<br>`Deploy CF Worker` (`124517315495`): **SKIPPED**<br>`Health Check` (`124517315524`): **SKIPPED** | **2 PASS / 2 SKIPPED** |
| **Security Hardening & Attestation** | [`41193760485`](https://github.com/minhlongs/algo-trader/actions/runs/41193760485) | `Command Injection Scan` (`124515673625`): **PASS**<br>`Secret Scanning` (`124515673752`): **PASS** | **2/2 PASS** |
| **Deploy Pages** | [`41193760550`](https://github.com/minhlongs/algo-trader/actions/runs/41193760550) | `Build & Deploy Dashboard` (`124515675219`): **SKIPPED** | **1 SKIPPED** |
| **Deploy Multi-Region** | `.github/workflows/deploy.yml` | Chỉ chạy khi gọi `workflow_dispatch` | **NOT RUN** |

### 1.3 Giới hạn bằng chứng (Evidence Boundaries)
1. **Những gì ĐÃ được chứng minh (`PASS`):**
   - **Polymarket Hardening (D1–D7):** Gỡ loại trừ test Polymarket, nâng ngưỡng coverage `vitest.config.ts` lên `80/80/80/80` (H10), thêm trạng thái `PAPER` tường minh vào `resolveExecutionMode()`, sửa lỗi ngược chiều `sell` khi thoát vị thế `NO` và tính khối lượng theo `tokenAmount`, bắt buộc xác nhận fill (`isConfirmedFill`) trước khi ghi vị thế/emit sự kiện, giữ nguyên vị thế khi thoát lệnh lỗi, tính arb theo giá `ask` khả thi + xử lý lệch chân (leg-2 failure), bỏ báo khống `FILLED` trong `LiveExecutionGateway` (`ROUTED_DRY_RUN`), và bỏ cộng dồn lợi nhuận lý thuyết trong `ArbitrageBacktester`.
   - **Better Auth (`1.7.7` — GHSA-965c-763c-88jm) & DB Safety:** Nâng cấp `better-auth` lên `1.7.7`; chạy `Gate 1c` trên PostgreSQL 15-alpine thật (`STRICT_PG_TEST=true`, `2 passed, 0 skipped`); khóa `assertTestDatabaseSafe` bằng exact allowlist (`localhost`, `127.0.0.1`, `postgres`, `::1` và `algo_trader_test_auth`, `algo_trader_test`), chặn `*.local` và hậu tố `_test` tùy ý; xác minh tái lập `OLD-RED` (`1.6.29` -> HTTP 200 + `Set-Cookie`) và `NEW-GREEN` (`1.7.7` -> HTTP 302 `INVALID_TOKEN`, `Set-Cookie: null`) trên cùng runner `tests/fixtures/better-auth-ghsa-965c/run-reproducer.ts` đọc version thực tế qua `require.resolve('better-auth')`.
2. **Những gì KHÔNG được suy diễn từ kết quả CI:**
   - `Docker Build` `PASS` chỉ chứng minh image `ghcr.io/minhlongs/algo-trader:4410d37edebe783a65f5041a1810bb1526c2eef7` đã được build và đẩy lên GHCR, **không** chứng minh bất kỳ máy chủ production nào đã kéo hoặc chạy image này.
   - `Gate 5 — Deployment smoke` `PASS` chỉ kiểm tra `curl` trả về HTTP 200 trên `https://algo-trader.pages.dev` và `https://cashclaw.cc`, **không** kiểm tra phiên bản commit đang chạy.
   - `Deploy CF Worker` và `Build & Deploy Dashboard` đều **SKIPPED** do biến `WORKER_AUTO_DEPLOY` và `PAGES_AUTO_DEPLOY` đang tắt.
3. **Đối chiếu với kế hoạch gốc:**
   - Kế hoạch con `plans/261030-1555-g1-saas-paper-hardening/plan.md`: **HOÀN TẤT (`completed`)** toàn bộ mục tiêu kỹ thuật ở tầng mã nguồn và CI.
   - Kế hoạch tổng thể `plans/reports/advise-261030-golive-poly-master-plan.md`: Chỉ mới hoàn tất **Pha 1 (Code Hardening & Coverage Gate)**. Các pha **Triển khai SaaS/Paper**, **Vận hành Paper 30 ngày có đối soát thực tế (Gate G2)** và **Xét duyệt vốn thật (Gate G3)** vẫn ở trạng thái **CHƯA CHẠY / BLOCKED**.

---

## 2. Release Candidate SHA/Artifact, Kiến Trúc Đích & Khóa Chặt Live Trading

### 2.1 Định danh Release Candidate (RC)
- **Git Commit SHA:** `4410d37edebe783a65f5041a1810bb1526c2eef7` (nhánh `main`)
- **Container Image Artifact (GHCR):**
  - Tag theo SHA: `ghcr.io/minhlongs/algo-trader:4410d37edebe783a65f5041a1810bb1526c2eef7`
  - Digest: `sha256:886e92d50f160755fb74d7f321e5b27cf670709da1fa641122e66a901c20b159`
- **Cloudflare Worker Bundle:** Đóng gói từ `src/platform/workers/edge-proxy.ts` qua `wrangler.toml` (`npm run build:worker` / `npx wrangler deploy --dry-run` đã kiểm tra xanh).
- **Cloudflare Pages Bundle:** Đóng gói từ `dashboard/` (`cd dashboard && npx vite build` -> `dashboard/dist`).

### 2.2 Bản đồ các đích triển khai (Deployment Targets) & Entrypoints thực tế

| Đích triển khai | File cấu hình / Entrypoint | Chức năng thực tế trong mã nguồn |
|---|---|---|
| **1. Cloudflare Worker (`algo-trader`)** | `wrangler.toml`<br>Entry: `src/platform/workers/edge-proxy.ts`<br>Route: `api.cashclaw.cc/*` (zone `cashclaw.cc`)<br>Cron: `*/5 * * * *` | Phục vụ trực tiếp tại biên: `/api/health`, `/api/version`, `/api/v1/paper-trading/tick`, `/api/v1/paper-trades`, `/api/auth/*` (JWT/KV), `/api/v1/subscriptions/*`, `/api/webhooks/nowpayments`, `/api/telegram/webhook`, `/api/v1/strategies/execute`, `/api/v1/backtest/*`, `/api/v1/marketplace/*`. Các route không khớp sẽ trả `501 VPS backend removed`. |
| **2. Cloudflare Pages (`algo-trader`)** | `.github/workflows/pages-deploy.yml`<br>Source: `dashboard/` -> `dashboard/dist`<br>Domains: `cashclaw.cc`, `algo-trader.pages.dev` | Giao diện web React/Vite kết nối tới `https://api.cashclaw.cc`. |
| **3. Node.js / Express Backend & CLI (Docker / VPS)** | `Dockerfile`, `package.json`<br>Server entry: `dist/app.js` (`src/app.ts`)<br>CLI entry: `dist/index.js`, `dist/desk/cli/cashclaw-cli.js` | Chạy `runMigrations()` (`src/shared/db/migration-runner.ts`), `ApiServer` (Express trên cổng 3000, gồm Better Auth `/api/auth/*`, `/api/v1/admin/qwen/kill`, `/api/v1/tenants/*`, `/api/v1/billing/*`), `LatencyMonitor`, `AugmentedSignalPipeline` và `PaperTradingEngine`. |

### 2.3 Bằng chứng khóa chặt mọi đường đặt lệnh thật (Live Trading Lockout Matrix)

Trong cấu hình Release Candidate SaaS/Paper (`PAPER_TRADING_ENABLED="true"`, **không** đặt `LIVE_TRADING_ENABLED`), toàn bộ đường dẫn có khả năng gửi lệnh ra sàn đều bị khóa fail-closed:

| Đường dẫn / Entrypoint | File:Line kiểm soát | Cơ chế khóa trong cấu hình Paper RC | Trạng thái |
|---|---|---|---|
| **Shared Execution Resolver** | `src/desk/execution/execution-mode.ts:46-55` | Mặc định trả về `'READ_ONLY'`; chỉ trả về `'PAPER'` khi `PAPER_TRADING_ENABLED === 'true'`; chỉ trả về `'LIVE'` khi chuỗi `process.env.LIVE_TRADING_ENABLED === 'true'`. | **LOCKED (Paper/Read-Only)** |
| **CEX Order Executor** | `src/desk/execution/cex-order-executor.ts:85` | Gọi `requireLiveEnabled('CexOrderExecutor.execute')` ở đầu hàm — ném `LiveTradingDisabledError` nếu `LIVE_TRADING_ENABLED !== 'true'`. | **LOCKED (Fail-closed)** |
| **Live Order Submission** | `src/desk/execution/live-order-submission.ts:24` | Gọi `requireLiveEnabled('LiveOrderManager.submitAndTrack')` trước mọi thao tác gửi lệnh. | **LOCKED (Fail-closed)** |
| **Polymarket CLOB Adapter** | `src/desk/execution/polymarket-adapter.ts:69` | Gọi `requireLiveEnabled('PolymarketAdapter.placeOrder')` trước khi gọi client CLOB. | **LOCKED (Fail-closed)** |
| **Polymarket Connector Executor** | `src/desk/execution/polymarket-order-executor.ts:33` | Gọi `requireLiveEnabled('PolymarketConnectorAdapter.placeOrder')` trước khi ký/gửi lệnh. | **LOCKED (Fail-closed)** |
| **Polymarket Adapter Factory** | `src/desk/execution/polymarket-execution-adapter.ts:103-140` | `buildPolymarketAdapter()` luôn trả về `paperTrading: true, adapter: null, signer: null` trừ khi `POLYMARKET_TRADING_MODE === 'live'` **VÀ** có đủ 4 biến `POLYMARKET_PRIVATE_KEY`, `POLYMARKET_API_KEY`, `POLYMARKET_API_SECRET`, `POLYMARKET_PASSPHRASE`. | **LOCKED (`adapter: null`)** |
| **LiveExecutionGateway** | `src/desk/execution/live-execution-gateway.ts:91-105` | Không có kết nối sàn; trả về `status: 'ROUTED_DRY_RUN'`, `simulated: true`, `venueSubmitted: false`. | **LOCKED (Dry-run)** |
| **CF Worker Cron & `/api/v1/paper-trading/tick`** | `src/platform/workers/paper-trading-entry.ts:53-112` | Chỉ gọi `PaperTradingLoop.tick()`, lấy giá public từ Gamma API và ghi bản ghi có cờ `isPaper: true` vào KV (`CACHE`) và D1 (`paper_trades_v3`). Không import bất kỳ order executor hay ví ký nào. | **LOCKED (Pure Paper)** |
| **Qwen Signals Loop & Eligibility Gate** | `src/desk/wiring/qwen-live-eligibility-gate.ts:73,110` | Bắt buộc `QWEN_LIVE_ELIGIBLE === 'true'` **VÀ** đủ 30 ngày dữ liệu paper kể từ `PAPER_GATE_DATE = '2026-04-17'` (được khóa cứng bởi CI Gate 6). Mọi tín hiệu Qwen chỉ định tuyến vào `paper_trades_v3`. | **LOCKED (Paper-only)** |

### 2.4 Danh mục Biến môi trường, Bindings & Secrets của cấu hình SaaS/Paper RC
*(Tuyệt đối không in giá trị bí mật; chỉ liệt kê tên, nơi khai báo và trạng thái cấu hình)*

| Nhóm | Tên biến / Binding | Nơi khai báo | Giá trị / Trạng thái cho SaaS/Paper RC |
|---|---|---|---|
| **Chế độ thực thi (Bắt buộc)** | `PAPER_TRADING_ENABLED` | `wrangler.toml` `[vars]` & `.env` | Đặt `"true"` (đã có trong `wrangler.toml:25`). |
| **Khóa Live (Bắt buộc)** | `LIVE_TRADING_ENABLED` | Runtime Env (Worker / Node) | **KHÔNG ĐẶT** (hoặc đặt `"false"`). Tuyệt đối không đặt `"true"`. |
| **Khóa Polymarket Live** | `POLYMARKET_TRADING_MODE` | Runtime Env | Đặt `"paper"` (hoặc không đặt). |
| **Khóa Ví Polymarket** | `POLYMARKET_PRIVATE_KEY`, `POLYMARKET_API_KEY`, `POLYMARKET_API_SECRET`, `POLYMARKET_PASSPHRASE` | Runtime Secrets | **KHÔNG CẤP** trên môi trường SaaS/Paper RC. |
| **Khóa Qwen Live** | `QWEN_LIVE_ELIGIBLE` | Runtime Env | **KHÔNG ĐẶT** (hoặc `"false"`). |
| **Cầu dao Qwen** | `SWARM_QWEN_ENABLED`, `QWEN_KILL` | Worker Secrets / Env | `SWARM_QWEN_ENABLED="false"` (mặc định tắt Qwen swarm nếu chưa test), `QWEN_KILL="0"` (đặt `"1"` khi cần ngắt khẩn cấp). |
| **Cloudflare Bindings** | `CACHE` (KV), `SUBSCRIBERS` (D1 `algo-trader-prod`) | `wrangler.toml:71-86` | `CACHE` và `SUBSCRIBERS` đã khai báo trong `wrangler.toml`. *(Lưu ý: `handleHealthRoute` đang đọc nhầm `env.DB` thay vì `env.SUBSCRIBERS` — xem Blocker B2)*. |
| **Cloudflare Worker Secrets** | `JWT_SECRET`, `API_KEYS`, `ADMIN_SECRET`, `ADMIN_API_KEY`, `CRON_SECRET`, `METRIC_PASSWORD`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `NOWPAYMENTS_API_KEY`, `NOWPAYMENTS_IPN_SECRET`, `RESEND_API_KEY`, `DASHSCOPE_API_KEY`, `VPS_ORIGIN` | `wrangler.toml:34-47` | Quản lý qua `wrangler secret list --config wrangler.toml` (xác minh tồn tại tên khóa trước khi deploy; không in giá trị). |
| **Node / Express / Postgres Secrets** | `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `CREDENTIAL_ENCRYPTION_KEY`, `REDIS_URL` | `.env.example` / Container Env | Chỉ cần thiết khi triển khai thành phần Node/Express (`dist/app.js`). |

---

## 3. Production Revision Hiện Tại (Đối Chiếu Thực Tế)

Kiểm tra chỉ đọc (read-only `GET`) tại thời điểm lập báo cáo (`2026-10-31`):

| Thành phần Production | Endpoint kiểm tra | Phiên bản / SHA đang chạy thực tế | Độ trễ so với `origin/main` (`4410d37e`) |
|---|---|---|---|
| **Cloudflare Worker (`api.cashclaw.cc`)** | `GET https://api.cashclaw.cc/api/version`<br>`GET https://api.cashclaw.cc/api/health` | **`bca78f2e6bcee0283b710fefed741bfda262afcc`** (`shortSha: "bca78f2e"`, `version: "1.0.0"`, `environment: "production"`).<br>Health trả về: `status: "ok"`, `hasVps: true`, `checks: { kv: "configured", d1: "missing", metrics: false, regionRouting: false }`. | **Trễ 195 commits** so với `origin/main` (`4410d37edebe783a65f5041a1810bb1526c2eef7`). Chưa có các bản vá của PR #214. |
| **Cloudflare Pages (`cashclaw.cc` / `algo-trader.pages.dev`)** | `GET https://cashclaw.cc`<br>`GET https://algo-trader.pages.dev` | **`UNKNOWN`** (Trả về HTTP 200 HTML tĩnh với tiêu đề `CashClaw — Autonomous Trading Infrastructure`; không nhúng meta tag hay endpoint `/version.json`). | **`UNKNOWN`** (Workflow `Deploy Pages` trên `4410d37e` bị `SKIPPED`). |
| **VPS / Docker Origin (`VPS_ORIGIN`)** | Gián tiếp qua `api.cashclaw.cc/api/health` (`hasVps: true`) | **`UNKNOWN`** (Biến `VPS_ORIGIN` có được đặt trên Worker hiện tại, nhưng không công khai URL/version endpoint trực tiếp). | **`UNKNOWN`** |

---

## 4. Checklist Triển Khai, Migration, Rollback / Kill-Switch & Smoke Tests

### 4.1 Kiểm toán trạng thái Database Migrations (Phát hiện kỹ thuật quan trọng)
1. **Cloudflare D1 (`algo-trader-prod`):**
   - Các file SQLite hợp lệ cho D1: `scripts/d1-schema.sql` (tạo `paper_trades`, `sync_state`), `migrations/0001-subscriptions.sql` (tạo `subscriptions`, `coupons`, `payment_logs`), `migrations/0002-telegram-alerts.sql`.
   - **Cảnh báo:** Hai file `migrations/005_compliance_kyc_tables.sql` và `migrations/0006-referral-payout-history.sql` nằm trong thư mục `migrations/` nhưng lại dùng cú pháp **PostgreSQL** (`UUID DEFAULT gen_random_uuid()`, `JSONB`, `TIMESTAMPTZ`, `DO $$`). Tuyệt đối **không** chạy tự động toàn bộ `migrations/*.sql` vào D1 SQLite.
   - **Cảnh báo bảng `paper_trades_v3` trên D1:** `src/desk/paper-trading/paper-trading-persistence.ts:95` và `src/platform/workers/edge-proxy-inline-routes.ts:47` truy vấn bảng `paper_trades_v3` trên D1 (`env.SUBSCRIBERS`), nhưng định nghĩa `CREATE TABLE IF NOT EXISTS paper_trades_v3` hiện nằm ở `src/db/migrations/016_qwen_paper_tracking.sql` mà chưa có trong `scripts/d1-schema.sql`. Cần xác minh bảng `paper_trades_v3` đã tồn tại trên D1 `algo-trader-prod` trước khi kích hoạt tick paper.
2. **PostgreSQL (`DATABASE_URL` cho Express/Node):**
   - Tồn tại **2 migration runner khác nhau** trong codebase:
     - `src/shared/db/migration-runner.ts` (được `src/app.ts:48` gọi khi khởi động): Chỉ đăng ký **19 migrations** (`001`, `042`–`053`, `055`–`059`, `026`), **thiếu** `004_better_auth_tables` và `010`–`041`.
     - `src/db/migration-runner.ts`: Đăng ký **35 migrations** (có `004_better_auth_tables.sql`, `016_qwen_paper_tracking.sql`, v.v.), nhưng `src/app.ts` lại không gọi file này.
   - Script `scripts/apply-migrations.sh` được nhắc tới trong `CLAUDE.md:98` **không tồn tại** trong thư mục `scripts/`.

### 4.2 Quy trình Rollout chuẩn (Chỉ thực hiện SAU KHI chủ dự án gỡ các Blocker ở Mục 5 & phê duyệt)
1. **Bước 1 — Sao lưu (Backup) trước triển khai:**
   - **D1 Backup:** Xuất toàn bộ dữ liệu D1 `algo-trader-prod` ra file `.sql` có đóng dấu thời gian:
     ```bash
     npx wrangler d1 export algo-trader-prod --remote --output=backups/d1-algo-trader-prod-$(date -u +%Y%m%dT%H%M%SZ).sql --config wrangler.toml
     ```
   - **PostgreSQL Backup (nếu triển khai Node/VPS):**
     ```bash
     pg_dump --format=custom --no-owner --no-acl "$DATABASE_URL" -f "backups/pg-prod-$(date -u +%Y%m%dT%H%M%SZ).dump"
     ```
   - **KV Snapshot:** Lưu giá trị hiện tại của các khóa trạng thái paper (`paper-trading:v1:positions`, `paper-trading:v1:closed-trades`, `paper-trading:v1:summary`) qua `npx wrangler kv key get`.
2. **Bước 2 — Kiểm tra cấu hình an toàn Paper (Pre-flight Lock Check):**
   - Xác nhận `wrangler.toml` có `PAPER_TRADING_ENABLED = "true"` và **không** có `LIVE_TRADING_ENABLED = "true"`.
   - Chạy `npx wrangler deploy --dry-run --config wrangler.toml` để xác nhận bundle biên dịch sạch.
3. **Bước 3 — Triển khai tuần tự (Staged Rollout):**
   - **3a. Cloudflare Worker:**
     ```bash
     npx wrangler versions upload --config wrangler.toml
     npx wrangler versions deploy --config wrangler.toml
     ```
     *(Lưu ý từ bộ nhớ vận hành: Tuyệt đối **không** chạy `wrangler deploy --env staging` hay `--env production` nếu block env trong `wrangler.toml` không khai báo `routes = []`, vì sẽ chiếm quyền route `api.cashclaw.cc/*`)*.
   - **3b. Kiểm tra ngay `/api/version` và `/api/health`:** Xác nhận `gitSha` chuyển từ `bca78f2e...` sang SHA mới.
   - **3c. Cloudflare Pages (Dashboard):**
     ```bash
     cd dashboard && npx vite build
     npx wrangler pages deploy dashboard/dist --project-name=algo-trader --branch=main
     ```

### 4.3 Quy trình Rollback Code, Kill-Switch Thực Tế & Phục Hồi Dữ Liệu
*(Đã đối chiếu trực tiếp với mã nguồn và `CLAUDE.md`; loại bỏ hoàn toàn hostname cũ `algo-trader.workers.dev` không phân giải được và các route `/api/admin/rollback/kill/...` không tồn tại)*

1. **Rollback phiên bản Cloudflare Worker (L0/L1 — Nhanh nhất, < 30 giây):**
   ```bash
   npx wrangler rollback --config wrangler.toml
   ```
   Sau khi chạy, kiểm tra lại `curl -s https://api.cashclaw.cc/api/version` để xác nhận đã quay về SHA trước đó (`bca78f2e6bcee0283b710fefed741bfda262afcc`).
2. **Cầu dao ngắt hành vi trên Cloudflare Worker (Kill-Switch thực tế):**
   - **Ngắt Qwen Signals / Drawdown Kill Switch (`QWEN_KILL` — L1):** Được đọc bởi `isKillSwitchActive()` tại `src/desk/wiring/qwen-drawdown-monitor.ts`:
     ```bash
     echo "1" | npx wrangler secret put QWEN_KILL --config wrangler.toml
     ```
   - **Tắt Qwen Swarm trong tiến trình (`SWARM_QWEN_ENABLED` — L2):**
     ```bash
     echo "false" | npx wrangler secret put SWARM_QWEN_ENABLED --config wrangler.toml
     ```
   - **Ngắt Paper Trading Loop trên Worker:** Đặt `PAPER_TRADING_ENABLED = "false"` trong `wrangler.toml` và chạy `npx wrangler deploy --config wrangler.toml`.
3. **Cầu dao trên Express/Node Backend (nếu chạy `dist/app.js`):**
   - Route `POST /api/v1/admin/qwen/kill` (yêu cầu header `x-admin-secret: $ADMIN_SECRET`) chỉ được mount trong Express (`src/platform/api/routes/admin-qwen-routes.ts:27`), **không** có trên Cloudflare Worker.
   - Rollback container Docker: Chuyển tag về image trước đó và khởi động lại container.
4. **Phục hồi dữ liệu (Data Recovery):**
   - **D1:** Dùng bản xuất `backups/d1-algo-trader-prod-<timestamp>.sql` qua `npx wrangler d1 execute algo-trader-prod --remote --file=...`.
   - **PostgreSQL:** Dùng `scripts/verify-restore-drill.sh` / `pg_restore --clean --if-exists -d "$DATABASE_URL" backups/pg-prod-<timestamp>.dump`.

### 4.4 Danh sách Smoke Tests sau triển khai (Chỉ dùng dữ liệu tổng hợp / Synthetic Test Data)

| # | Hạng mục (Protected Flows & Paper RC) | Lệnh / Kịch bản kiểm tra (Synthetic Data) | Kỳ vọng ĐẠT (PASS) |
|---|---|---|---|
| **S1** | **Version & Health Verification** | `curl -s https://api.cashclaw.cc/api/version` và `curl -s https://api.cashclaw.cc/api/health` | `gitSha` khớp chính xác với SHA triển khai; `status: "ok"`; `kv: "configured"`, `d1: "configured"`. |
| **S2** | **Auth Lifecycle & Origin Guard** | Đăng ký / đăng nhập tài khoản synthetic (`smoke-test-<ts>@example.com`), kiểm tra cookie/token, gọi `/api/auth/session`, gửi request từ `Origin: https://evil.example.com` và đăng xuất. | Đăng nhập/session trả `200`; Origin lạ bị chặn `403`; đăng xuất xóa phiên thành công. |
| **S3** | **Tenant Isolation** | Tạo 2 tenant synthetic (`tenant-smoke-a`, `tenant-smoke-b`); dùng token của `tenant-smoke-a` đọc cấu hình/tín hiệu của `tenant-smoke-b`. | Bị từ chối (`401`/`403`) hoặc chỉ trả dữ liệu của đúng `tenant-smoke-a`; 0 rò rỉ chéo. |
| **S4** | **Setup Wizard / BYOK (Protected Flow 1)** | Lưu cấu hình khóa thử nghiệm giả lập (`sk-test-synthetic-0000`) qua endpoint cấu hình tenant và đọc lại trạng thái cấu hình. | Lưu thành công (`200`), dữ liệu nhạy cảm được mã hóa/ẩn khi đọc lại, không ghi plaintext vào log. |
| **S5** | **Telegram Bot Webhook (Protected Flow 2)** | Gửi payload webhook synthetic mô phỏng lệnh `/status` tới `POST /api/telegram/webhook` kèm header `X-Telegram-Bot-Api-Secret-Token` giả lập. | Request thiếu/sai secret bị từ chối `401`/`403`; request đúng secret với chat synthetic trả `200`. |
| **S6** | **NOWPayments IPN Webhook (Protected Flow 3)** | Gửi payload IPN synthetic tới `POST /api/webhooks/nowpayments` với chữ ký HMAC-SHA512 sai và đúng (trên `order_id` synthetic `smoke_test_order_001`). | Chữ ký sai bị từ chối `400`/`401`; chữ ký đúng được xử lý idempotent, chống replay. |
| **S7** | **Paper Trading Accounting & Live Lockout** | Gọi `POST /api/v1/paper-trading/tick` (kèm `CRON_SECRET`) và đọc `GET /api/v1/paper-trades`. | Tick chạy thành công, mọi bản ghi sinh ra có `isPaper: true`, 0 lệnh thật gửi ra sàn, số dư/PnL tính đúng trên khối lượng token thực. |

---

## 5. Blockers, Điều Kiện Tiên Quyết (`CLAUDE.md`), Owner & Chi Phí Dự Kiến

### 5.1 Đối chiếu các điều kiện tiên quyết trong `CLAUDE.md` và phát hiện kỹ thuật

| Mã | Hạng mục / Điều kiện tiên quyết | Bằng chứng hiện có | Cản trở còn lại (Blocker) | Owner |
|---|---|---|---|---|
| **B1** | **Phê duyệt của chủ dự án cho Merge PR #214 & Triển khai SaaS/Paper** | PR #214 đã merge vào `main` (`4410d37e`), CI 14 jobs PASS, 3 jobs deploy SKIPPED. | Chưa có xác nhận hậu kiểm cho lệnh merge và chưa có lệnh duyệt deploy lên `api.cashclaw.cc` / `cashclaw.cc`. | **Chủ dự án (Project Owner)** |
| **B2** | **Lệch biến D1 trong `/api/health` & Bảng `paper_trades_v3` trên D1** | `edge-proxy-inline-routes.ts:77` kiểm tra `env.DB` nhưng `wrangler.toml:83` khai báo `SUBSCRIBERS` -> production `/api/health` đang báo `"d1":"missing"`. Đồng thời `scripts/d1-schema.sql` chưa có DDL của `paper_trades_v3` (dù `edge-proxy-inline-routes.ts:47` và `paper-trading-persistence.ts:95` truy vấn bảng này). | Cần sửa `env.DB` -> `env.SUBSCRIBERS` trong `handleHealthRoute` và bổ sung `CREATE TABLE IF NOT EXISTS paper_trades_v3` vào D1 schema trước khi deploy Worker. | **Engineering (`cto` / `fullstack-developer`)** |
| **B3** | **Lệch 2 bộ Migration Runner PostgreSQL & thiếu `scripts/apply-migrations.sh`** | `src/app.ts` gọi `src/shared/db/migration-runner.ts` (chỉ có 19 migrations, thiếu `004_better_auth_tables` và `016_qwen_paper_tracking`), khác với `src/db/migration-runner.ts` (35 migrations). Hai file `005` và `0006` trong `migrations/` gốc lại là cú pháp Postgres nằm chung thư mục với D1 SQLite. | Nếu triển khai Node/Express (`dist/app.js`) lên DB mới, `runMigrations()` sẽ thiếu bảng `004` và `016`. Cần hợp nhất danh sách migration và tách rõ thư mục D1 vs Postgres. | **Engineering (`cto`)** |
| **B4** | **Các cổng quản trị triển khai trong `CLAUDE.md:96`** (`scaling phases 1-11`, `load test 12k RPS`, `ME IDEA PSF gate`, `restore drill`, `on-call notified`) | Integration tests trong CI đã PASS (`Gate 1`, `Gate 1c`). Script `tests/load/load-test-12k-rps.js` và `scripts/verify-restore-drill.sh` đã có trong repo. | Chưa chạy thực tế bài tải `k6` 12k RPS (30 phút), chưa chạy `verify-restore-drill.sh` với `DATABASE_URL_STAGING`, chưa xác nhận cổng `/mekong gates` và thông báo kỹ sư trực (hoặc cần chủ dự án ký miễn trừ có điều kiện cho phạm vi Paper-only RC). | **Chủ dự án + Platform Ops** |

### 5.2 Chi phí dự kiến vận hành SaaS/Paper Release Candidate (Kèm giả định / Assumptions)

| Thành phần hạ tầng | Chi phí dự kiến / tháng (USD) | Giả định tính toán (Assumptions) |
|---|---|---|
| **Cloudflare Workers + KV + D1 + Pages** | **$0 – $5 / tháng** | Gói Workers Paid ($5/tháng cơ bản) hoặc Free tier; Cron chạy 5 phút/lần (`288 ticks/ngày`), lưu trữ D1 < 5 GB, KV reads < 10M/tháng, Pages static hosting $0. |
| **PostgreSQL & Redis (nếu chạy thêm Node/Express Backend)** | **$0 – $20 / tháng** | $0 nếu chỉ chạy Cloudflare Worker + D1 ở pha Paper đầu; ~$15–$20/tháng nếu bật instance PostgreSQL + Redis managed cơ bản (hoặc chạy chung trên VPS sẵn có). |
| **API Dữ liệu Thị trường & AI (Polymarket Gamma + DashScope Qwen)** | **$0 – $10 / tháng** | Polymarket Gamma API public hoàn toàn miễn phí ($0); nếu tắt `SWARM_QWEN_ENABLED=false` thì chi phí LLM = $0; nếu bật Qwen loop 5 phút/lần với model nhẹ tốn ~$5–$10/tháng. |
| **Vốn giao dịch thật (Live Trading Capital at Risk)** | **$0.00 (Tuyệt đối bằng 0)** | `LIVE_TRADING_ENABLED` bị khóa, không nạp private key ví Polymarket, không cấp allowance/transfer. |
| **Tổng chi phí ước tính cho pha SaaS/Paper RC** | **$5 – $35 / tháng** | Phụ thuộc vào việc chỉ chạy Edge Worker + Pages ($5/tháng) hay bật kèm VPS/Postgres + Qwen API. |

---

## 6. Quyết Định Đề Xuất: **BLOCKED** (Chờ Chủ Dự Án Quyết Định & Gỡ 3 Chốt Kỹ Thuật Nhỏ)

- **Trạng thái quyết định:** **BLOCKED** *(Chưa chuyển sang `READY FOR DEPLOYMENT APPROVAL` cho tới khi chủ dự án xác nhận 3 điểm căn cứ dưới đây)*.
- **Căn cứ xác lập `BLOCKED`:**
  1. **Thẩm quyền:** Quyền merge PR #214 đang ở trạng thái **“chưa xác minh quyền merge”** và chủ dự án đã ra lệnh rõ: **“chuẩn bị bộ triển khai SaaS/paper để chủ dự án duyệt. Chưa deploy.”**
  2. **Kỹ thuật (Độ tin cậy khi lên sóng):**
     - Trên Cloudflare Worker, `/api/health` hiện báo `"d1": "missing"` do `edge-proxy-inline-routes.ts:77` kiểm tra `env.DB` thay vì `env.SUBSCRIBERS`, và bảng `paper_trades_v3` cần được đảm bảo tồn tại trong D1 schema trước khi Worker mới ghi/đọc dữ liệu paper.
     - Trên nhánh Node/PostgreSQL, `src/shared/db/migration-runner.ts` (được `src/app.ts` gọi) chưa đăng ký `004-better-auth-tables` và `016-qwen-paper-tracking`.
  3. **Quản trị (`CLAUDE.md:96`):** Các cổng `load test 12k RPS`, `verify-restore-drill.sh`, và `/mekong gates` chưa được chạy trên SHA `4410d37e` (cần chủ dự án quyết định yêu cầu chạy đủ hay cấp quyền miễn trừ có điều kiện cho môi trường Paper-only).

---

## 7. Kiểm Kê Worktrees, Dirty Files, Unpushed Commits & Bằng Chứng Cần Giữ

*Cam kết an toàn: Không xóa, không archive, không `git reset`/`git stash` trên bất kỳ worktree nào.*

### 7.1 Danh mục 5 Git Worktrees đang đăng ký (`git worktree list`)

| # | Đường dẫn Worktree | Nhánh (Branch) | HEAD SHA | Trạng thái Dirty / Unpushed | Hành động bảo toàn |
|---|---|---|---|---|---|
| 1 | `/Users/macbook/algo-trader` (Primary checkout) | `fix/signal-routes-tenant-isolation` | `b064a3ba9dc91a3216bf3b00b7ed5194c48148d1` | **Dirty (20 đường dẫn):** 11 staged (`A`), 3 modified (`M`), 6 untracked (`??`); **Ahead 1 commit** so với `origin/fix/signal-routes-tenant-isolation` (xem bảng 7.2). | **Giữ nguyên 100%**, không chạm vào bất kỳ file staged/modified nào của phiên khác. |
| 2 | `/Users/macbook/algo-trader/.claude/worktrees/g1-saas-paper-hardening` (Worktree hiện tại) | `fix/g1-saas-paper-hardening` | `1758e0db70d62ddc19ecde36a455c65ba4f8b87c` | Chứa các file báo cáo đóng hồ sơ & bản nháp comment trong `plans/reports/` vừa tạo ở phiên này. Đã squash-merge vào `origin/main` (`4410d37e`). | **Giữ nguyên worktree** và toàn bộ báo cáo/bằng chứng trong `plans/`. |
| 3 | `/Users/macbook/algo-trader/.claude/worktrees/agent-a0c9826c` | `(detached HEAD)` | `4e73b0ab50d2666e5669a3420a1c4cc10d1b06c4` | Clean (`0 dirty`). Chứa commit local `4e73b0ab` (`feat(marketing): complete CMO marketing campaign...`) chưa merge vào `main`. | **Giữ nguyên**, không xóa vì đang giữ commit `4e73b0ab`. |
| 4 | `/Users/macbook/algo-trader/.claude/worktrees/agent-a7cc5c3d` | `worktree-agent-a7cc5c3d` | `839481557a83ed4a17a86b3f0c8bf712e973bc2d` | Clean (`0 dirty`). Nhánh local chưa có upstream. | **Giữ nguyên**, chờ chủ dự án xác nhận trước khi dọn. |
| 5 | `/Users/macbook/algo-trader/.claude/worktrees/agent-af1e0592` | `worktree-agent-af1e0592` | `839481557a83ed4a17a86b3f0c8bf712e973bc2d` | Clean (`0 dirty`). Nhánh local chưa có upstream. | **Giữ nguyên**, chờ chủ dự án xác nhận trước khi dọn. |

*(Ghi chú thêm: Trong `/Users/macbook/algo-trader/.claude/worktrees/` còn có **188 thư mục `wf_*`** không phải git worktree do các phiên chạy workflow trước để lại; tất cả được giữ nguyên, không tự ý xóa).*

### 7.2 Chi tiết 20 đường dẫn đang thay đổi tại Primary Worktree (`/Users/macbook/algo-trader`) — Được bảo toàn nguyên trạng
- **11 file Staged (`A`):**
  1. `docs/cmo-30-day-content-calendar.md`
  2. `docs/cmo-brand-messaging-framework.md`
  3. `docs/cmo-campaign-kpi-dashboard.md`
  4. `docs/cmo-Cold-Email-Outreach-Sequences.md`
  5. `docs/cmo-landing-page-optimization-spec.md`
  6. `docs/cmo-launch-press-release-templates.md`
  7. `docs/cmo-linkedin-b2b-playbook.md`
  8. `docs/cmo-partner-co-marketing-kit.md`
  9. `docs/cmo-product-hunt-launch-plan.md`
  10. `docs/cmo-seo-keyword-content-matrix.md`
  11. `docs/cmo-video-script-storyboards.md`
- **3 file Modified (`M`):**
  12. `package-lock.json`
  13. `package.json`
  14. `wrangler.toml`
- **6 mục Untracked (`??`):**
  15. `plans/261030-1522-pr-backlog-triage/`
  16. `plans/reports/advise-261030-golive-poly-master-plan.md`
  17. `plans/reports/advise-261030-pr214-auth-security-plan.md`
  18. `plans/reports/advise-261030-pr214-claude-security-handoff.md`
  19. `plans/reports/cmo-261030-marketing-audit-action-plan.md`
  20. `plans/reports/scout-261030-golive-poly-audit.md`

### 7.3 Danh mục bằng chứng (Evidence Artifacts) cần giữ lại
1. `plans/261030-1555-g1-saas-paper-hardening/plan.md` — Kế hoạch kỹ thuật D1–D7.
2. `plans/reports/advise-261031-pr214-auth-security-verification.md` — Báo cáo kiểm định bảo mật Auth & kết quả CI hậu merge trên `4410d37edebe783a65f5041a1810bb1526c2eef7`.
3. `plans/reports/vibe-261031-1805-g1-hardening-closure-and-saas-paper-rc.md` — Hồ sơ đóng hardening & chuẩn bị Release Candidate SaaS/Paper (file này).
4. `plans/reports/draft-261031-1805-github-comments-pr214-issue213.md` — Bản nháp comment hoàn tất cho Issue #213 và PR #214 để chủ dự án duyệt trước khi đăng.
5. `tests/fixtures/better-auth-ghsa-965c/` (`reproducer-core.ts`, `run-reproducer.ts`, `package.old-red.json`, `package-lock.old-red.json`, `README.md`) — Bộ tái lập lỗ hổng GHSA-965c-763c-88jm dùng chung runner.

---

## 8. Unresolved Questions

1. **Xác nhận hậu kiểm Merge PR #214:** Chủ dự án có chấp thuận giữ nguyên commit merge `4410d37edebe783a65f5041a1810bb1526c2eef7` trên `main` và duyệt đăng nội dung đính chính phạm vi (trong `plans/reports/draft-261031-1805-github-comments-pr214-issue213.md`) lên Issue #213 / PR #214 không?
2. **Xử lý Blocker B2 & B3 trước khi Deploy:** Chủ dự án có muốn mở một PR nhỏ sửa `env.DB` -> `env.SUBSCRIBERS` trong `/api/health`, bổ sung `paper_trades_v3` vào `scripts/d1-schema.sql`, và đồng bộ `src/shared/db/migration-runner.ts` trước khi chạy lệnh deploy SaaS/Paper không?
3. **Cổng quản trị `CLAUDE.md:96` (Blocker B4):** Đối với bản triển khai **chỉ chạy Paper Trading trên Cloudflare Worker + Pages** (không giao dịch tiền thật), chủ dự án muốn chạy đầy đủ bài load test 12k RPS + staging restore drill trước, hay phê duyệt ngoại lệ có điều kiện cho riêng môi trường Paper RC?
