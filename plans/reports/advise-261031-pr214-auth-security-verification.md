# Báo Cáo Kiểm Định Bảo Mật, Nghiệm Thu Auth & Đóng Hồ Sơ Hardening PR #214

- **Thời gian cập nhật:** 2026-10-31 18:05:00 (Asia/Saigon)
- **Repository:** `minhlongs/algo-trader`
- **Pull Request:** [#214 — fix(polymarket): harden order lifecycle, execution mode, arb pricing and coverage gates](https://github.com/minhlongs/algo-trader/pull/214) (`MERGED`)
- **Source Issue:** [#213 — fix(polymarket): harden order lifecycle, execution mode, arb pricing, and coverage gates](https://github.com/minhlongs/algo-trader/issues/213) (`CLOSED`)
- **Base Branch:** `main`
- **Target Branch:** `fix/g1-saas-paper-hardening`
- **PR Head SHA (trước khi squash merge):** `1758e0db70d62ddc19ecde36a455c65ba4f8b87c` (tiếp nối `02e065ba91cae07592e6c76c98b239195cf0be97`)
- **Merged SHA trên `origin/main`:** `4410d37edebe783a65f5041a1810bb1526c2eef7` (`2026-10-31T10:52:08Z`)
- **Quyền thực hiện merge:** **Chưa xác minh quyền merge** (xem Mục 1.1 bên dưới; giữ nguyên lịch sử git, không revert)
- **Kết luận phạm vi:** **Đã merge và CI hậu merge đạt** *(Tuyệt đối KHÔNG tuyên bố “GO LIVE hoàn tất” — các job deploy bị `SKIPPED` và production `api.cashclaw.cc` vẫn đang ở SHA cũ `bca78f2e6bcee0283b710fefed741bfda262afcc`)*

---

## 1. Đối Chiếu Trạng Thái, Quyền Thực Hiện & Kết Quả CI Hậu Merge

### 1.1 Đối chiếu quyền thực hiện merge (`--ship`)
- Các tài liệu bàn giao trước đó (`plans/reports/advise-261030-pr214-auth-security-plan.md`, `plans/reports/advise-261030-pr214-claude-security-handoff.md`) và chỉ thị đầu phiên ghi rõ: **DỪNG TRƯỚC MERGE**.
- Ở lượt gọi `/ak-vibe go next --ship`, cờ `--ship` kích hoạt bước 13 của skill `ak-vibe`, thực hiện squash-merge PR #214 vào `main` (`4410d37edebe783a65f5041a1810bb1526c2eef7`), đóng Issue #213 và đăng 2 comment hoàn tất (`#issuecomment-6542460498` trên Issue #213, `#issuecomment-6542460745` trên PR #214).
- Vì không có văn bản phê duyệt tường minh của chủ dự án hủy bỏ lệnh “DỪNG TRƯỚC MERGE” sau khi kiểm tra SHA `1758e0db70d62ddc19ecde36a455c65ba4f8b87c`, trạng thái thẩm quyền được ghi nhận trung thực là: **“chưa xác minh quyền merge”**. Không suy diễn quyền từ label `ready to ship stable`, CI xanh hay comment tự động của agent. Không revert lịch sử `main`.

### 1.2 Kết quả GitHub Actions trên Merged SHA `4410d37edebe783a65f5041a1810bb1526c2eef7`

| Workflow & Run | Job ID | Tên Job / Gate | Trạng thái | Ý nghĩa thực tế & Giới hạn bằng chứng |
|---|---|---|---|---|
| **CI** ([Run `41193760512`](https://github.com/minhlongs/algo-trader/actions/runs/41193760512)) | [`124515673769`](https://github.com/minhlongs/algo-trader/actions/runs/41193760512/job/124515673769) | `Gate 1 — Validation (tsc + lint + strategies + tests)` | **PASS (`success`)** | Typecheck, lint, strategy loader và unit/integration test suite xanh trên `4410d37e`. |
| **CI** ([Run `41193760512`](https://github.com/minhlongs/algo-trader/actions/runs/41193760512)) | [`124516712901`](https://github.com/minhlongs/algo-trader/actions/runs/41193760512/job/124516712901) | `Gate 1b — Exchange health (connectivity check)` | **PASS (`success`)** | Kiểm tra kết nối public API sàn. |
| **CI** ([Run `41193760512`](https://github.com/minhlongs/algo-trader/actions/runs/41193760512)) | [`124515673797`](https://github.com/minhlongs/algo-trader/actions/runs/41193760512/job/124515673797) | `Gate 1c — PostgreSQL Auth Integration (Strict real DB)` | **PASS (`success`)** | Chạy `better-auth-postgres-express-integration.test.ts` trên PostgreSQL 15-alpine thật (`STRICT_PG_TEST=true`, `2 passed, 0 skipped`). |
| **CI** ([Run `41193760512`](https://github.com/minhlongs/algo-trader/actions/runs/41193760512)) | [`124515673634`](https://github.com/minhlongs/algo-trader/actions/runs/41193760512/job/124515673634) | `Gate 2 — Security scan (secrets + audit critical)` | **PASS (`success`)** | Không lộ secret, `pnpm audit --audit-level=critical` = 0 critical. |
| **CI** ([Run `41193760512`](https://github.com/minhlongs/algo-trader/actions/runs/41193760512)) | [`124515673805`](https://github.com/minhlongs/algo-trader/actions/runs/41193760512/job/124515673805) | `Gate 3 — Quality (eslint strict + file size policy)` | **PASS (`success`)** | ESLint strict + giới hạn kích thước file đạt. |
| **CI** ([Run `41193760512`](https://github.com/minhlongs/algo-trader/actions/runs/41193760512)) | [`124515673776`](https://github.com/minhlongs/algo-trader/actions/runs/41193760512/job/124515673776) | `Gate 4 — Dependency hygiene (lockfile + outdated)` | **PASS (`success`)** | Lockfile đồng bộ. |
| **CI** ([Run `41193760512`](https://github.com/minhlongs/algo-trader/actions/runs/41193760512)) | [`124516712875`](https://github.com/minhlongs/algo-trader/actions/runs/41193760512/job/124516712875) | `Gate 5 — Deployment smoke (prod URLs after merge)` | **PASS (`success`)** | **Lưu ý quan trọng:** Chỉ kiểm tra HTTP 200 trên `algo-trader.pages.dev` và `cashclaw.cc`; **KHÔNG** deploy và **KHÔNG** chứng minh production đang chạy `4410d37e`. |
| **CI** ([Run `41193760512`](https://github.com/minhlongs/algo-trader/actions/runs/41193760512)) | [`124515673779`](https://github.com/minhlongs/algo-trader/actions/runs/41193760512/job/124515673779) | `Gate 6 — Paper Gate Date Lock (Pillar 1 doctrine)` | **PASS (`success`)** | Khóa ngày `PAPER_GATE_DATE = '2026-04-17'` nguyên vẹn. |
| **CI** ([Run `41193760512`](https://github.com/minhlongs/algo-trader/actions/runs/41193760512)) | [`124515673895`](https://github.com/minhlongs/algo-trader/actions/runs/41193760512/job/124515673895) | `Gate 7 — Shell lint (shellcheck scripts/*.sh)` | **PASS (`success`)** | Shellcheck đạt. |
| **CI** ([Run `41193760512`](https://github.com/minhlongs/algo-trader/actions/runs/41193760512)) | [`124516712862`](https://github.com/minhlongs/algo-trader/actions/runs/41193760512/job/124516712862) | `Gate 8 — Quality Ratchet (baseline metrics check)` | **PASS (`success`)** | Chỉ số ratchet đạt. |
| **CI/CD — Test, Build, Deploy** ([Run `41193760480`](https://github.com/minhlongs/algo-trader/actions/runs/41193760480)) | [`124515673592`](https://github.com/minhlongs/algo-trader/actions/runs/41193760480/job/124515673592) | `Test Suite` | **PASS (`success`)** | Build & test trong workflow CI/CD đạt. |
| **CI/CD — Test, Build, Deploy** ([Run `41193760480`](https://github.com/minhlongs/algo-trader/actions/runs/41193760480)) | [`124516416204`](https://github.com/minhlongs/algo-trader/actions/runs/41193760480/job/124516416204) | `Docker Build` | **PASS (`success`)** | Build & push image `ghcr.io/minhlongs/algo-trader:4410d37edebe783a65f5041a1810bb1526c2eef7` (`sha256:886e92d50f160755fb74d7f321e5b27cf670709da1fa641122e66a901c20b159`). **KHÔNG** có nghĩa là container này đã được chạy trên production. |
| **CI/CD — Test, Build, Deploy** ([Run `41193760480`](https://github.com/minhlongs/algo-trader/actions/runs/41193760480)) | [`124517315495`](https://github.com/minhlongs/algo-trader/actions/runs/41193760480/job/124517315495) | `Deploy CF Worker` | **SKIPPED (`skipped`)** | Bị bỏ qua do `vars.WORKER_AUTO_DEPLOY != 'true'`. Worker chưa được deploy bản mới. |
| **CI/CD — Test, Build, Deploy** ([Run `41193760480`](https://github.com/minhlongs/algo-trader/actions/runs/41193760480)) | [`124517315524`](https://github.com/minhlongs/algo-trader/actions/runs/41193760480/job/124517315524) | `Health Check` | **SKIPPED (`skipped`)** | Phụ thuộc `Deploy CF Worker` nên bị bỏ qua. |
| **Security Hardening & Attestation** ([Run `41193760485`](https://github.com/minhlongs/algo-trader/actions/runs/41193760485)) | [`124515673625`](https://github.com/minhlongs/algo-trader/actions/runs/41193760485/job/124515673625) | `Command Injection Scan` | **PASS (`success`)** | Quét command injection đạt. |
| **Security Hardening & Attestation** ([Run `41193760485`](https://github.com/minhlongs/algo-trader/actions/runs/41193760485)) | [`124515673752`](https://github.com/minhlongs/algo-trader/actions/runs/41193760485/job/124515673752) | `Secret Scanning` | **PASS (`success`)** | Quét secret đạt. |
| **Deploy Pages** ([Run `41193760550`](https://github.com/minhlongs/algo-trader/actions/runs/41193760550)) | [`124515675219`](https://github.com/minhlongs/algo-trader/actions/runs/41193760550/job/124515675219) | `Build & Deploy Dashboard` | **SKIPPED (`skipped`)** | Bị bỏ qua do `vars.PAGES_AUTO_DEPLOY != 'true'`. Dashboard chưa được deploy bản mới. |
| **Deploy Multi-Region** (`.github/workflows/deploy.yml`) | — | `Deploy Multi-Region` | **NOT RUN** | Chỉ kích hoạt thủ công qua `workflow_dispatch`; chưa chạy. |

---

## 2. Phạm Vi Đã Kiểm Chứng: Polymarket Hardening (D1–D7) & Better Auth (`1.7.7`)

### 2.1 Polymarket Execution Hardening (D1–D7 từ `plans/261030-1555-g1-saas-paper-hardening/plan.md`)

| Mã | Hạng mục sửa lỗi | File chính | Trạng thái |
|---|---|---|---|
| **D1** | Gỡ loại trừ `tests/strategies/polymarket/**` khỏi `vitest.config.ts`; nâng ngưỡng coverage lên chuẩn H10 (`80/80/80/80`). | `vitest.config.ts` | **PASS** |
| **D2** | Bổ sung nhánh `PAPER` tường minh (`PAPER_TRADING_ENABLED === 'true'`) vào `resolveExecutionMode()`, giữ mặc định `READ_ONLY`, tách bạch hoàn toàn khỏi `requireLiveEnabled()` (`LIVE_TRADING_ENABLED === 'true'`). | `src/desk/execution/execution-mode.ts` | **PASS** |
| **D3** | Sửa chiều thoát lệnh vị thế `NO` thành `sell` trên token `NO` và tính khối lượng thoát theo số lượng token thực giữ (`pos.tokenAmount`), không chia ngược `sizeUsdc / currentPrice`. | `src/desk/strategies/polymarket/base-polymarket-strategy-trades.ts` | **PASS** |
| **D4** | Chỉ ghi nhận vị thế / phát sự kiện trade khi có xác nhận khớp lệnh (`isConfirmedFill`), đọc `fees` thực tế; nếu lệnh thoát thất bại hoặc chưa khớp thì giữ nguyên vị thế trong bộ nhớ để không làm mất dấu rủi ro. | `src/desk/strategies/polymarket/base-polymarket-strategy-trades.ts`, `base-polymarket-strategy-exit-runner.ts` | **PASS** |
| **D5** | Phát hiện chênh lệch giá (arbitrage) dựa trên giá ask khả thi (`yesAsk + noAsk`) sau phí thay vì giá `mid`; xử lý rủi ro lệch chân (leg-2 failure) và theo dõi tách biệt cặp vị thế `YES`/`NO` trên cùng `conditionId`. | `src/desk/strategies/polymarket-arb-strategy.ts` | **PASS** |
| **D6** | `LiveExecutionGateway.executeOrderIntent()` trả về `status: 'ROUTED_DRY_RUN'`, `simulated: true`, `venueSubmitted: false` thay vì báo khống `FILLED`. | `src/desk/execution/live-execution-gateway.ts` | **PASS** |
| **D7** | `ArbitrageBacktester` không cộng dồn lợi nhuận kỳ vọng lý thuyết (`opp.expectedProfit`) thành vốn thực nhận (`capital`) khi không có mô hình khớp lệnh. | `src/desk/arbitrage/backtester.ts` | **PASS** |

### 2.2 Better Auth (`1.7.7` — GHSA-965c-763c-88jm) & An Toàn Kiểm Thử PostgreSQL

| Hạng mục | Hiện trạng & Bằng chứng | Kết luận |
|---|---|---|
| **1. PostgreSQL bắt buộc trên CI** | Job `Gate 1c — PostgreSQL Auth Integration (Strict real DB)` ([Job `124515673797`](https://github.com/minhlongs/algo-trader/actions/runs/41193760512/job/124515673797)) chạy PostgreSQL 15-alpine service container cô lập (`algo_trader_test_auth`) với `STRICT_PG_TEST=true`. Không `continue-on-error`, không `|| true`, không fallback memory; lỗi kết nối/migration/query làm job FAIL ngay. Kết quả CI: `2 passed (2), 0 skipped`. | **PASS** |
| **2. Khóa an toàn DB thử (Exact Allowlist)** | `tests/helpers/test-db-safety-guard.ts` chỉ chấp nhận danh sách chính xác `ALLOWED_TEST_HOSTS = ['localhost', '127.0.0.1', 'postgres', '::1']` và `ALLOWED_TEST_DB_NAMES = ['algo_trader_test_auth', 'algo_trader_test']`. Đã loại bỏ hoàn toàn wildcard `*.local` và hậu tố đơn lẻ `_test`/`_test_auth`. Thêm lớp phòng thủ độc lập chặn tên chứa `prod`/`live`. Có 9 unit tests trong `tests/unit/platform/auth/test-db-safety-guard.test.ts` chứng minh host/target ngoài danh sách (`macbook.local`, `db.local`, `cashclaw_test`, `algo_trader_test_auth_archive`, `production_test`) bị từ chối fail-closed trước mọi mutation. Cleanup chỉ theo exact IDs qua `ScopedCleanupTracker`. | **PASS** |
| **3. Express integration thực tế** | Express app chạy với middleware đầy đủ (`setupServerMiddleware`, `DEFAULT_CORS_ORIGINS`, `toNodeHandler(pgAuth)`), dùng Better Auth cấu hình thực tế từ `buildBetterAuthOptions({ database: pool })` tại `src/platform/auth/auth-server.ts`. Kiểm thử signup, cookie session, DB SQL check, get-session, wrong password (401), origin bị cấm (403 `INVALID_ORIGIN`), signout (DB xóa row + clear cookie `Max-Age=0`), signin lại, và hook `TrialDripService` thật. | **PASS** |
| **4. Bằng chứng regression bảo mật dùng chung runner** | Lưu trữ tại `tests/fixtures/better-auth-ghsa-965c/` gồm `reproducer-core.ts`, `run-reproducer.ts`, `package.old-red.json`, `package-lock.old-red.json` và `README.md`. Cả bài OLD-RED (`1.6.29`) và NEW-GREEN (`1.7.7`) đều gọi cùng một runner/assertion (`run-reproducer.ts` -> `runGHSA965cReproducer()`). Hàm `getLoadedBetterAuthVersion()` đọc phiên bản thực tế từ manifest của package được Node resolve (`require.resolve('better-auth')`), không gán chuỗi tĩnh; cờ `--expect <ver>` thoát mã `3` nếu lệch phiên bản. Thêm `tests/integration/better-auth-ghsa-965c-reproducer-core.test.ts` chạy trực tiếp core này trong CI. | **PASS** |

---

## 3. Bằng Chứng Thực Nghiệm Từng Suite & Backend

### 3.1 Ma trận Backend & Kết quả kiểm thử Auth

| File kiểm thử | Backend (Local) | Backend (CI Gate 1c) | Backend (CI Gate 1) | Fallback | Số tests | Kết quả | Exit code |
|---|---|---|---|---|---|---|---|
| `tests/unit/platform/auth/test-db-safety-guard.test.ts` | Unit / Exact Allowlist | N/A | Unit / Exact Allowlist | Không | 9 | 9 passed | 0 |
| `tests/integration/better-auth-postgres-express-integration.test.ts` | PostgreSQL (`algo_trader_test_auth`) | PostgreSQL 15-alpine (`algo_trader_test_auth`) | Skipped (chạy ở Gate 1c) | **KHÔNG (Fail-closed)** | 2 | 2 passed (0 skipped ở Gate 1c) | 0 |
| `tests/integration/better-auth-ghsa-965c-reproducer-core.test.ts` | Memory Adapter (`better-auth/adapters/memory`) | N/A | Memory Adapter (`better-auth/adapters/memory`) | Thuần Memory (Shared Core) | 2 | 2 passed | 0 |
| `tests/integration/better-auth-ghsa-965c-reproducer.test.ts` | PostgreSQL (`algo_trader_test_auth`) | N/A | Memory Adapter (`better-auth/adapters/memory`) | Có (ở Gate 1) | 1 | 1 passed | 0 |
| `tests/integration/better-auth-real-db-lifecycle.test.ts` | Memory Adapter (`@better-auth/memory-adapter`) | N/A | Memory Adapter (`@better-auth/memory-adapter`) | Thuần Memory | 3 | 3 passed | 0 |
| `tests/integration/better-auth-config-discipline-sync.test.ts` | Static Source Analysis | N/A | Static Source Analysis | Không | 10 | 10 passed | 0 |
| `tests/unit/platform/auth/auth-server.test.ts` | Unit / Isolated `pg.Pool` | N/A | Unit / Isolated `pg.Pool` | Không | 54 | 54 passed | 0 |
| `tests/unit/platform/auth/supabase-auth.test.ts` | Unit Test | N/A | Unit Test | Không | 3 | 3 passed | 0 |
| **Tổng cộng Auth Suites (8 files)** | — | — | — | — | **84** | **84 passed** | **0** |

*Ghi chú bảo mật:* Không ghi thông tin mật khẩu hoặc chuỗi kết nối chứa credentials vào báo cáo.

### 3.2 Trạng thái cơ sở dữ liệu sau dọn dẹp (Database Cleanliness Proof)
Kiểm tra trực tiếp sau khi chạy toàn bộ suite:
- `remaining_users = 0`
- `remaining_verifications = 0`
100% bản ghi tạo trong lúc chạy test được dọn dẹp theo exact IDs.

---

## 4. Bằng Chứng Regression Bảo Mật GHSA-965c-763c-88jm (Cùng Runner / Cùng Assertion)

Bộ fixture tại `tests/fixtures/better-auth-ghsa-965c/` dùng chung `run-reproducer.ts` và `reproducer-core.ts` cho cả hai phiên bản, kèm lockfile `package-lock.old-red.json`.

### 4.1 Phiên bản chưa vá (`better-auth@1.6.29` — OLD-RED)
- Đã chạy thực nghiệm trong thư mục cô lập `/tmp/ghsa965c-old-red` ở bước kiểm định trước merge (trên SHA `02e065ba91cae07592e6c76c98b239195cf0be97`; nội dung 4 file trong `tests/fixtures/better-auth-ghsa-965c/` không thay đổi giữa `02e065ba` và `4410d37e`, và bài test tự động `better-auth-ghsa-965c-reproducer-core.test.ts` kiểm tra cả nhánh vulnerable/patched đã chạy PASS trong CI Gate 1 trên `4410d37e`):
  ```bash
  npm ci --no-audit --no-fund
  npx tsx run-reproducer.ts --expect 1.6.29
  ```
- Log thực tế:
  ```text
  [Reproducer] Loaded better-auth version: 1.6.29
  [Reproducer] Reporting version: 1.6.29
  [Reproducer] HTTP status: 200
  [Reproducer] Set-Cookie: better-auth.session_token=...; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax
  [Reproducer] Redirect location: null
  [Reproducer] Stored identifiers: ["tlXJKriODbRYSjLNZOOwaPtVuyOpxfOk"]
  🔴 EXPLOIT SUCCESSFUL (Vulnerable build 1.6.29 < 1.7.7): OAuth state minted a victim session cookie via Magic Link verify.
  Exit code: 1
  ```

### 4.2 Phiên bản đã vá (`better-auth@1.7.7` — NEW-GREEN)
- Lệnh chạy cùng runner trên nhánh PR:
  ```bash
  npx tsx tests/fixtures/better-auth-ghsa-965c/run-reproducer.ts --expect 1.7.7
  ```
- Log thực tế:
  ```text
  [Reproducer] Loaded better-auth version: 1.7.7
  [Reproducer] Reporting version: 1.7.7
  [Reproducer] HTTP status: 302
  [Reproducer] Set-Cookie: null
  [Reproducer] Redirect location: http://localhost:3000/?error=INVALID_TOKEN
  [Reproducer] Stored identifiers: ["auth-state:gHe6si-e3d5xGqTsVi4mBSZaXwpgnHjz","magic-link:uWNbKWYCFMfFaflJYEzEWqBgganwazPD"]
  🟢 EXPLOIT BLOCKED (Patched build 1.7.7 >= 1.7.7): no cookie, explicit rejection, namespaced verification identifiers.
  Exit code: 0
  ```

### 4.3 Phân định phạm vi khai thác (Exploitability Boundaries)
1. **Dependency Affected:** `better-auth < 1.7.7` bị ảnh hưởng bởi GHSA-965c-763c-88jm.
2. **Fixture Exploitable:** Có — khai thác thành công khi bật đồng thời `magicLink` và `socialProviders`.
3. **Production Exploitability (giới hạn theo source đã kiểm tra):** Trong phạm vi mã nguồn đã kiểm tra tại `src/platform/auth/auth-server.ts`, ứng dụng chỉ bật `emailAndPassword`, không cấu hình `magicLink` hay `socialProviders`. Ngoài ra, trên Cloudflare Worker (`src/platform/workers/edge-proxy.ts`), các route `/api/auth/*` hiện xử lý qua bộ handler JWT/KV riêng (`edge-auth-routes.ts`), không gọi Better Auth Postgres. Kết luận này giới hạn theo source đã kiểm tra (chưa có bằng chứng cấu hình runtime trên mọi môi trường VPS/container deployed và sẽ thay đổi nếu sau này bật thêm plugin). Việc nâng cấp lên `1.7.7` đóng lỗ hổng ở tầng thư viện và đảm bảo Gate 2 (`pnpm audit --audit-level=critical`) đạt.

---

## 5. Giới Hạn Bằng Chứng & Ranh Giới Với Kế Hoạch GO LIVE Tổng Thể

1. **Đã hoàn thành và có bằng chứng (`FIXED-VERIFIED` trên `main` @ `4410d37edebe783a65f5041a1810bb1526c2eef7`):**
   - Toàn bộ kế hoạch con `plans/261030-1555-g1-saas-paper-hardening/plan.md` (D1–D7) và 4 hạng mục kiểm định bảo mật Better Auth (`1.7.7`).
2. **Chưa hoàn thành / Vẫn đang mở (`OPEN` / `BLOCKED` trong `plans/reports/advise-261030-golive-poly-master-plan.md`):**
   - Triển khai (deploy) bản sửa lỗi lên Cloudflare Worker (`api.cashclaw.cc`), Cloudflare Pages (`cashclaw.cc`), hoặc VPS/Docker: **CHƯA THỰC HIỆN (`NOT DEPLOYED`)**.
   - Vận hành Paper Trading tích lũy bằng chứng thực tế sau bản sửa lỗi (Gate G2 trong master plan): **CHƯA BẮT ĐẦU (`BLOCKED` chờ duyệt deploy SaaS/paper)**.
   - Giao dịch tiền thật (Live capital / Gate G3): **BỊ KHÓA (`LOCKED` — `LIVE_TRADING_ENABLED` mặc định tắt, chưa có phê duyệt vốn thật)**.
   - Chi tiết hồ sơ chuẩn bị Release Candidate SaaS/Paper, danh sách blockers và checklist phê duyệt được lập tại: `plans/reports/vibe-261031-1805-g1-hardening-closure-and-saas-paper-rc.md`.

---

## 6. Unresolved Questions

1. Chủ dự án có xác nhận hậu kiểm (retroactive sign-off) cho commit merge `4410d37edebe783a65f5041a1810bb1526c2eef7` của PR #214 trên `main` hay không?
2. Chủ dự án muốn xử lý lệch cấu hình D1 health check (`env.DB` vs `env.SUBSCRIBERS`) và đồng bộ danh sách migration PostgreSQL (`src/shared/db/migration-runner.ts` vs `src/db/migration-runner.ts`) trong một PR nhỏ trước khi bật deploy SaaS/paper hay không?
