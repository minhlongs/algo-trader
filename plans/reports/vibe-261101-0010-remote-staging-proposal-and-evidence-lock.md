# Hồ Sơ Khóa Bằng Chứng Local & Đề Xuất Kế Hoạch Remote Staging (Trình Duyệt)

**Thời điểm:** 2026-11-01 00:10 (Asia/Saigon)  
**Nhánh làm việc:** `fix/saas-paper-staging-hardening`  
**Worktree:** `/Users/macbook/algo-trader/.claude/worktrees/g1-saas-paper-hardening`  
**Commit cơ sở (HEAD):** `4410d37edebe783a65f5041a1810bb1526c2eef7`  
**Trạng thái hệ thống:** **REMOTE STAGING BLOCKED** (Chờ chủ dự án duyệt phương án tài nguyên).  
**Cam kết an toàn tuyệt đối:** DỪNG TẠI WORKTREE sau bàn giao; không commit/push/merge, không tự ý cấp phát tài nguyên cloud, không deploy, không migration production, không bật live trading/signing/allowance/transfer ví, không đăng comment ra ngoài.

---

## 1. Khóa Bằng Chứng Thực Nghiệm Local (Local Evidence Lock)

### 1.1. Snapshot Trạng Thái Mã Nguồn
- **HEAD Commit SHA:** `4410d37edebe783a65f5041a1810bb1526c2eef7`
- **Danh sách file thay đổi (Dirty Snapshot):**
  - Đã chỉnh sửa (`M`):
    - `scripts/deploy-cf-worker-with-sha-verification.sh`: Fail-closed khi xác minh version SHA (cả staging & production).
    - `src/desk/wiring/paper-trading-orchestrator.ts`: Bổ sung barrier in-flight đồng bộ và kiểm tra `isQwenEnabled()` trước mutation, hoàn trả `reservation.release()`.
    - `src/desk/wiring/paper-trading-persistence.ts`: Bổ sung boundary persister `setCustomDbPersister` phục vụ test/drill độc lập.
    - `wrangler.toml`: Cấu hình `[env.staging]` an toàn với `routes = []`.
  - File mới tạo (`??`):
    - `scripts/lib/parse-wrangler-target.py`: Phân tích TOML bằng chuẩn Python `tomllib`/`tomli` trích xuất `workerName`, `accountId`, `routes`, `d1Databases`, `kvNamespaces`.
    - `scripts/staging-preflight-check.ts`: CLI kiểm tra preflight fail-closed, bật `requireAccountId: true`.
    - `staging-manifest.json`: Manifest kiểm soát tài nguyên được phép và cấm tuyệt đối tài nguyên production.
    - `scripts/drills/local-staging-drill.ts`: Bộ diễn tập 7 bước cô lập đo thời gian thực bằng `process.hrtime.bigint()`.
    - Test suites:
      - `tests/unit/platform/workers/staging-verification-and-mismatch.test.ts` (12 tests)
      - `tests/unit/platform/workers/staging-drill-and-reconciliation.test.ts` (4 tests)
      - `tests/unit/desk/wiring/paper-trading-orchestrator-kill.test.ts` (2 tests)
      - `tests/unit/platform/workers/deploy-verification-script.test.ts` (5 tests)
      - `tests/unit/platform/workers/saas-paper-staging-hardening.test.ts` (24 tests)

### 1.2. Kết Quả Kiểm Thử Targeted Suites
Lệnh thực thi:
```bash
npx vitest run tests/unit/platform/workers/staging-verification-and-mismatch.test.ts \
  tests/unit/platform/workers/staging-drill-and-reconciliation.test.ts \
  tests/unit/platform/workers/deploy-verification-script.test.ts \
  tests/unit/desk/wiring/paper-trading-orchestrator-kill.test.ts \
  tests/unit/platform/workers/saas-paper-staging-hardening.test.ts
```
- **Tổng số test files:** 5 files
- **Tổng số tests:** **47 tests**
- **Trạng thái:** **47 PASS, 0 SKIP, 0 FAIL** (Exit Code: 0)

### 1.3. Xác Nhận Preflight CLI Chặn Đứng Vi Phạm Account Trước Mutation
Được kiểm chứng qua subprocess thực tế `npx tsx scripts/staging-preflight-check.ts`:
1. **Manifest account null (`BLOCKED_PENDING_OWNER_PROVISIONING`)**: Exit Code = 1, Báo lỗi: `BLOCKED: No staging Cloudflare account_id has been formally provisioned`, **0 mutation calls**.
2. **Resolved account missing**: Exit Code = 1, Báo lỗi: `RESOLVED WRANGLER VIOLATION: missing accountId for deploy target`, **0 mutation calls**.
3. **Account mismatch**: Exit Code = 1, Báo lỗi: `RESOLVED WRANGLER MISMATCH: accountId does not match manifest requiredAccountId`, **0 mutation calls**.
4. **Account khớp chính xác**: Exit Code = 0, Vượt qua toàn bộ preflight gates an toàn.

### 1.4. Bằng Chứng Diễn Tập Local Drill & Giới Hạn Kiểm Chứng
Lệnh thực thi:
```bash
npx tsx scripts/drills/local-staging-drill.ts
```
- **Exit Code:** 0
- **Số đo thực tế (Monotonic Timer):**
  - DB Backup Execution: Target 500ms | **Thực tế: 11.75ms** (PASS)
  - DB Restore Execution: Target 500ms | **Thực tế: 12.67ms** (PASS)
  - Backup/Restore Reconciliation Invariant: Target 100ms | **Thực tế: 12.26ms** (PASS)
  - Migration Candidate Apply: Target 300ms | **Thực tế: 24.63ms** (PASS)
  - Migration Rollback Recovery: Target 500ms | **Thực tế: 13.21ms** (PASS)
  - Kill Switch Trip & Enforcement: Target 100ms | **Thực tế: 23.31ms** (PASS)
  - Controlled Kill-Switch Recovery: Target 100ms | **Thực tế: 38.13ms** (PASS)
- **Giới hạn kiểm chứng khoa học:**
  - Drill kiểm chứng chính xác đường dẫn candidate của chiến lược Qwen (`qwen_momentum_alpha` / `source: 'qwen'`) qua cơ chế L1 Kill Switch (`QWEN_KILL=1`) và hoàn trả capital reservation trên tiến trình Node/SQLite cục bộ.
  - **KHÔNG suy rộng** kết quả này thành tất cả các chiến lược AI/mathematical khác, và **KHÔNG suy rộng** thành hành vi của Cloudflare Worker remote chạy trên kiến trúc V8 isolates.

---

## 2. Kết Quả Khảo Sát Tài Nguyên Cloudflare Hiện Có (Read-Only Inventory)

Thực hiện khảo sát hoàn toàn chỉ đọc qua Wrangler CLI và cấu hình dự án (không ghi, không sửa, không đọc secrets):

1. **Cloudflare Account:**
   - Account ID hiện có trên máy: `f691e83094f776311a1bfe3f8b126f1c` (Tên: `Billwill.mentor@gmail.com's Account`).
   - Token Permissions: Đầy đủ quyền Workers, KV, D1.
2. **Cloudflare Worker:**
   - Đã tồn tại Worker tên `algo-trader` (Production).
   - Đã tồn tại Worker tên `algo-trader-staging` (Staging cũ).
3. **Cloudflare D1 Databases:**
   - Production D1 (đang dùng): `algo-trader-db` (`f29559f2-8e0b-461a-bd01-5665581beeee` hoặc `472e48f7-2196-4fb5-9a26-180ad134e15b`).
   - Đã tồn tại D1 database tên `algo-trader-staging` (UUID: `943fd11e-c81a-4342-afa6-7e80aa7a18df`, kích thước 12 KB, 0 tables).
4. **Cloudflare KV Namespaces:**
   - Production KV: `algo-trader-CACHE` (`6c7199c0259b42db943aa13b200d8ea1`).
   - Preview KV: `algo-trader-CACHE_preview` (`ca8f3f11882e426e952e322963077f73`).
   - Hiện **CHƯA CÓ** KV namespace độc lập đặt tên `algo-trader-staging-CACHE`.
5. **Worker Secrets (Chỉ kiểm tra tên tồn tại, không đọc nội dung):**
   - Trên `algo-trader-staging` hiện chỉ có: `DATABASE_URL`, `POLAR_*`, `STRIPE_*`, `RAAS_LICENSE_SECRET`.
   - **THIẾU** các secrets quan trọng của SaaS/Paper runtime: `QWEN_INGEST_HMAC_SECRET`, `NOWPAYMENTS_API_KEY`, `NOWPAYMENTS_IPN_SECRET`, `BETTER_AUTH_SECRET`, `ADMIN_API_KEY`.
6. **Dịch Vụ Phụ Trợ (Backend VPS / Database):**
   - Main app chạy kiến trúc hybrid: Edge Worker + PostgreSQL VPS/Docker.
   - Staging hiện thiếu cấu hình PostgreSQL staging database độc lập (cần cô lập hoàn toàn với `algo_trader_production`).

---

## 3. Bộ Đề Xuất Kế Hoạch Triển Khai Remote Staging Để Chủ Dự Án Duyệt

### 3.1. Phương Án Cô Lập Tài Nguyên (Resource Mapping)
Chủ dự án có 2 lựa chọn kiến trúc:
- **Phương án A (Khuyến nghị - Tận dụng Account Hiện Có với Cô Lập Tuyệt Đối):**
  Sử dụng chung Cloudflare Account `f691e83094f776311a1bfe3f8b126f1c` nhưng cô lập 100% tài nguyên theo bảng bên dưới.
- **Phương án B (Tách Biệt Account Cloudflare Riêng Biệt):**
  Cung cấp một Account ID Cloudflare mới hoàn toàn cho Staging.

**Bảng Ma Trận Ánh Xạ Tài Nguyên Dự Kiến:**
| Tài nguyên | Production | Staging Đề Xuất | Trạng thái hiện tại |
| :--- | :--- | :--- | :--- |
| **Cloudflare Account** | `f691e83094f776311a1bfe3f8b126f1c` | `f691e83094f776311a1bfe3f8b126f1c` (hoặc mới) | Đã có |
| **Worker Name** | `algo-trader` | `algo-trader-staging` | Đã có |
| **Domain / Route** | `api.cashclaw.cc/*` (Zone: `cashclaw.cc`) | `routes = []` (chỉ dùng `algo-trader-staging.<subdomain>.workers.dev`) | Đã cấu hình chặn takeover trong `wrangler.toml` |
| **D1 Database** | `algo-trader-db` (`f29559f2-...`) | `algo-trader-staging` (`943fd11e-c81a-4342-afa6-7e80aa7a18df`) | Đã có database trống (12KB) |
| **KV Namespace** | `algo-trader-CACHE` (`6c7199c0-...`) | `algo-trader-staging-CACHE` | **CẦN TẠO MỚI** |
| **PostgreSQL DB** | VPS `algo_trader` | VPS/Docker `algo_trader_staging` | **CẦN XÁC NHẬN CẤP PHÁT** |
| **Secrets Staging** | Đầy đủ live secrets | Cần nạp bộ test keys riêng cho staging | **CẦN CHỦ DỰ ÁN CẤP** |

### 3.2. Ước Tính Chi Phí Dự Kiến
- **Cloudflare Workers / D1 / KV:** $0 phát sinh thêm nếu nằm trong gói Cloudflare Workers Paid hiện tại ($5/tháng, bao gồm 10M requests, 25GB D1, 1GB KV storage).
- **PostgreSQL / VPS Staging:** Nếu host chung trên VPS nội bộ hiện tại: $0; nếu tách instance độc lập: ~10 - 20 USD/tháng.
- *(Ghi chú: Giả định lưu lượng staging ở mức test nội bộ dưới 50.000 requests/ngày).*

### 3.3. Quy Trình 5 Bước Triển Khai Staging Khi Được Duyệt
1. **Bước 1: Cập nhật Manifest & Cấu Hình**
   - Cập nhật `requiredAccountId: "f691e83094f776311a1bfe3f8b126f1c"` vào `staging-manifest.json`.
   - Khai báo D1 binding và KV namespace binding cho `[env.staging]` trong `wrangler.toml`.
2. **Bước 2: Cấp Phát KV & Bí Mật Thử Nghiệm**
   - Tạo KV namespace staging: `npx wrangler kv namespace create algo-trader-staging-CACHE`.
   - Nạp các secrets staging (NOWPayments Sandbox, Test Bot Token, mock JWT secret).
3. **Bước 3: Chạy D1 Migrations Staging**
   - Chạy migration các bảng `subscriptions`, `coupons`, `paper_trades_v3` lên D1 staging:
     `npx wrangler d1 migrations apply algo-trader-staging --remote --env staging`
4. **Bước 4: Deploy & Xác Minh Revision Fail-Closed**
   - Chạy script: `scripts/deploy-cf-worker-with-sha-verification.sh staging`.
   - Script gọi preflight guard; nếu đạt sẽ deploy và tự động kiểm tra `GET https://algo-trader-staging.../api/version`. Fail ngay nếu SHA sai khác.
5. **Bước 5: Diễn Tập End-to-End & Rollback Trên Remote Staging**
   - Test E2E luồng đăng ký SaaS giả lập (IPN test webhook) và kiểm tra bản ghi D1.
   - Diễn tập bật `QWEN_KILL=1` trên staging KV/secret để xác minh kill switch remote.
   - Diễn tập rollback: `npx wrangler rollback --config wrangler.toml --env staging`.

---

## 4. Danh Sách Hành Động Cần Chủ Dự Án Phê Duyệt

| STT | Hành động yêu cầu duyệt | Side Effect / Tác động kỹ thuật |
| :---: | :--- | :--- |
| **1** | **Xác nhận sử dụng Account ID `f691e83094f776311a1bfe3f8b126f1c` cho Staging** | Cho phép ghi Account ID này vào `staging-manifest.json` để mở khóa safety gate. |
| **2** | **Phê duyệt tái sử dụng D1 Database `algo-trader-staging` (`943fd11e-...`)** | Chạy schema D1 staging vào database này (không ảnh hưởng dữ liệu production). |
| **3** | **Phê duyệt tạo 1 KV Namespace mới `algo-trader-staging-CACHE`** | Tạo thêm 1 KV namespace trên tài khoản Cloudflare. |
| **4** | **Cung cấp giá trị các bí mật kiểm thử (Test Secrets)** | Cấu hình NOWPayments Sandbox Key, Test Bot Token cho Worker staging. |

---

## 5. Kết Luận & Bàn Giao

- **Local Hardening:** Đã hoàn tất 100%, có đầy đủ bằng chứng kiểm thử 47/47 tests green và số đo thời gian thực tế.
- **Remote Staging:** Tiếp tục giữ trạng thái **BLOCKED** cho đến khi chủ dự án phản hồi phê duyệt 4 nội dung trên.
- **DỪNG TẠI WORKTREE:** Không thực hiện bất kỳ lệnh tạo mới, deploy, commit hay thay đổi cấu hình remote nào ngoài kế hoạch đã báo cáo.
