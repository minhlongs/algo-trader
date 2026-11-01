# Kế Hoạch Triển Khai Remote Staging & Danh Sách Quyết Định Cần Duyệt

**Thời điểm:** 2026-11-01 00:25 (Asia/Saigon)  
**Nhánh làm việc:** `fix/saas-paper-staging-hardening`  
**Worktree:** `/Users/macbook/algo-trader/.claude/worktrees/g1-saas-paper-hardening`  
**Commit cơ sở (HEAD):** `4410d37edebe783a65f5041a1810bb1526c2eef7`  
**Trạng thái môi trường:** **REMOTE STAGING BLOCKED** (Chờ chủ dự án phê duyệt từng side-effect cụ thể).  
**Cam kết an toàn tuyệt đối:** DỪNG SAU BÀN GIAO; không commit/push/merge, không tự ý cấp phát tài nguyên cloud, không sửa cấu hình cloud, không deploy, không chạy migration remote, không bật live trading/signing/allowance/transfer ví, không đăng comment ra ngoài hệ thống.

---

## 1. Khảo Sát Thực Tế Tài Nguyên (Read-Only Inventory với Định Danh Đầy Đủ)

Đã khảo sát chính xác 100% định danh bằng các lệnh chỉ đọc qua Wrangler CLI và truy vấn SQLite Master D1 (không cắt ngắn, không phỏng đoán):

1. **Cloudflare Account:**
   - Account ID đầy đủ: `f691e83094f776311a1bfe3f8b126f1c`
   - Tên Account: `Billwill.mentor@gmail.com's Account`
   - Xác nhận quyền: Đã có OAuth token với quyền Worker, KV, D1.

2. **Cloudflare Workers:**
   - Production Worker: `algo-trader` (Route: `api.cashclaw.cc/*`, Zone: `cashclaw.cc`).
   - Staging Worker: `algo-trader-staging` (Chưa gán route nào, URL dự kiến: `algo-trader-staging.<subdomain>.workers.dev`).

3. **Cloudflare D1 Databases (Định danh đầy đủ):**
   - **Production D1 (CẤM ĐỤNG):**
     - Tên: `algo-trader-db` | UUID: `f29559f2-8e0b-461a-bd01-5665581beeee` | Size: 1,921,024 bytes.
     - Tên: `algo-trader-prod` | UUID: `472e48f7-2196-4fb5-9a26-180ad134e15b` | Size: 327,680 bytes.
   - **Staging D1 (Sẵn sàng tái sử dụng):**
     - Tên: `algo-trader-staging` | UUID: `943fd11e-c81a-4342-afa6-7e80aa7a18df` | Size: 12,288 bytes (chỉ có bảng hệ thống `_cf_KV`, 0 bảng ứng dụng).

4. **Cloudflare KV Namespaces (Định danh đầy đủ):**
   - **Production KV (CẤM ĐỤNG):**
     - Tên: `algo-trader-CACHE` | ID: `6c7199c0259b42db943aa13b200d8ea1`
     - Tên: `algo-trader-CACHE_preview` | ID: `ca8f3f11882e426e952e322963077f73`
   - **Staging KV:**
     - **CHƯA TỒN TẠI** namespace `algo-trader-staging-CACHE`. Cần tạo mới khi được duyệt.

5. **PostgreSQL Container & Máy Chủ Staging:**
   - Máy trạm local hiện tại không chạy Docker daemon (`docker not found` trong PATH).
   - Kiến trúc production hiện tại sử dụng VPS Docker Stack (`scripts/start-production.sh` / `docker-compose.yml`).
   - Yêu cầu staging: Tạo container PostgreSQL và volume riêng biệt trên host staging, port không công khai ra ngoài internet, cấp role độc quyền cho DB `algo_trader_staging`. Tuyệt đối không dùng chung socket, volume hay mật khẩu của production.

---

## 2. Bảng Ma Trận Ánh Xạ Tài Nguyên & Chứng Minh Cô Lập (Isolation Proof)

Để sử dụng an toàn Cloudflare Account `f691e83094f776311a1bfe3f8b126f1c` mà không cần mở account mới:

| Chiều cô lập | Production | Staging Đề Xuất | Cơ chế bảo vệ & Chứng minh cô lập |
| :--- | :--- | :--- | :--- |
| **Worker Boundary** | `algo-trader` | `algo-trader-staging` | Tách biệt hoàn toàn V8 isolates và mã nguồn deploy. |
| **Route / Domain** | `api.cashclaw.cc/*` | `routes = []` (chỉ dùng `*.workers.dev`) | `wrangler.toml` block `[env.staging]` khóa `routes = []`, ngăn chặn route takeover. Preflight kiểm tra regex/hostnames. |
| **D1 Database** | `f29559f2-8e0b-461a-bd01-5665581beeee` | `943fd11e-c81a-4342-afa6-7e80aa7a18df` | 2 UUID vật lý tách rời trên Cloudflare Edge; preflight chặn đứng nếu staging binding trỏ vào UUID prod. |
| **KV Namespace** | `6c7199c0259b42db943aa13b200d8ea1` | `algo-trader-staging-CACHE` (mới) | ID tách biệt; cấm namespace ID prod trong manifest. |
| **PostgreSQL DB** | `algo_trader` (volume prod) | `algo_trader_staging` (volume staging) | Container riêng, volume riêng, credentials riêng. Role staging không có quyền trên database production. Cổng DB đóng kín, chỉ kết nối nội bộ qua mạng an toàn. |
| **Secrets & Keys** | Live API Keys & Production Secrets | Bộ test secrets ngẫu nhiên (Sandbox) | Nạp qua `wrangler secret put --env staging` mà không in ra console/chat; Telegram/Payments mock hoàn toàn. |

---

## 3. Dự Toán Chi Phí Chi Tiết (Cost Assessment)

- **Cloudflare (Account `f691e83094f776311a1bfe3f8b126f1c`):**
  - Worker `algo-trader-staging`: Nằm trong gói Workers Paid hiện có ($5/tháng, bao gồm 10M requests). Staging nội bộ dự kiến < 50k req/tháng → Chi phí tăng thêm: **$0.00**.
  - D1 Database `algo-trader-staging`: Bao gồm 25GB lưu trữ, 50M rows read/ngày → Chi phí tăng thêm: **$0.00**.
  - KV Namespace `algo-trader-staging-CACHE`: Bao gồm 1GB lưu trữ, 10M reads/tháng → Chi phí tăng thêm: **$0.00**.
- **PostgreSQL Staging Container:**
  - Nếu chạy container phụ trên cùng VPS/máy chủ hiện có: **$0.00** chi phí thuê ngoài (tiêu thụ thêm ~512MB RAM).
  - Nếu thuê riêng 1 VPS staging độc lập (ví dụ Hetzner / DigitalOcean): **$4.00 - $12.00 / tháng** (Giả định: 2 vCPU, 4GB RAM).
  - Trạng thái số liệu hạ tầng VPS cụ thể: **UNKNOWN** (do chưa nhận thông tin server staging chính thức từ chủ dự án).

---

## 4. Trình Tự Triển Khai Sau Phê Duyệt (SOP 6 Bước)

1. **Bước 1: Khóa Artifact Candidate & Local Commit**
   - Rà soát toàn bộ diff của worktree `g1-saas-paper-hardening`, chạy kiểm thử 47/47 tests.
   - Tạo commit candidate trên branch `fix/saas-paper-staging-hardening` để lấy Commit SHA cố định (không deploy từ dirty state).
2. **Bước 2: Cấp Phát Hạ Tầng Staging**
   - Khởi tạo container PostgreSQL riêng: `docker run -d --name algo-postgres-staging -v pg_staging_data:/var/lib/postgresql/data ...`
   - Tạo KV namespace: `npx wrangler kv namespace create algo-trader-staging-CACHE` và ghi nhận ID mới.
   - Xác nhận quyền sở hữu D1 `algo-trader-staging` (`943fd11e-c81a-4342-afa6-7e80aa7a18df`).
3. **Bước 3: Cấu Hình & Preflight Gate**
   - Cập nhật `requiredAccountId: "f691e83094f776311a1bfe3f8b126f1c"` và ID KV mới vào `staging-manifest.json` và `wrangler.toml`.
   - Sinh bộ secrets ngẫu nhiên (HMAC, JWT, Mock keys) và nạp an toàn bằng CLI:
     `cat <<EOF | npx wrangler secret put <NAME> --env staging`
   - Chạy `scripts/staging-preflight-check.ts` đảm bảo 100% fail-closed gates pass.
4. **Bước 4: Chạy Staging Migrations**
   - D1: `npx wrangler d1 migrations apply algo-trader-staging --remote --env staging`
   - PostgreSQL: Chạy migration runner trỏ vào `DATABASE_URL` staging (`algo_trader_staging`).
5. **Bước 5: Deploy Worker Staging & Xác Minh SHA**
   - Chạy `scripts/deploy-cf-worker-with-sha-verification.sh staging`.
   - Lệnh tự động đối soát SHA từ `GET https://algo-trader-staging.../api/version`. Fail ngay lập tức nếu SHA không khớp candidate.
6. **Bước 6: Diễn Tập End-to-End & Recovery Trên Remote Thật**
   - E2E Test: Gọi webhook thanh toán giả lập, xác nhận bản ghi ghi vào D1 & PG staging mà không ảnh hưởng production.
   - Remote Kill Switch Drill: Bật `QWEN_KILL=1` trên staging KV/secret, gọi candidate, chứng minh Worker từ chối lệnh và hoàn trả reservation.
   - Rollback Drill: Thực hiện `npx wrangler rollback --env staging`, kiểm tra health endpoint khôi phục version trước.

---

## 5. Danh Sách Hành Động Cụ Thể Cần Chủ Dự Án Phê Duyệt

| STT | Thao tác đề xuất | Side Effect / Tác động kỹ thuật | Trạng thái quyền |
| :---: | :--- | :--- | :---: |
| **1** | **Commit mã nguồn candidate trên worktree** | Đóng gói dirty diff thành 1 commit có SHA cố định để làm căn cứ deploy | **Chờ duyệt** |
| **2** | **Xác nhận sử dụng Cloudflare Account `f691e83094f776311a1bfe3f8b126f1c`** | Cho phép chuyển trạng thái manifest sang `PROVISIONED` với ID này | **Chờ duyệt** |
| **3** | **Tạo mới Cloudflare KV `algo-trader-staging-CACHE`** | Tạo thêm 1 namespace trên tài khoản Cloudflare | **Chờ duyệt** |
| **4** | **Cấp quyền áp dụng schema D1 lên `algo-trader-staging` (`943fd11e-...`)** | Tạo các bảng `subscriptions`, `coupons`, `paper_trades_v3` trên D1 staging | **Chờ duyệt** |
| **5** | **Khởi tạo PostgreSQL container/database `algo_trader_staging`** | Tạo volume, database và user PostgreSQL độc lập trên máy chủ staging | **Chờ duyệt** |
| **6** | **Nạp secrets kiểm thử cho Worker `algo-trader-staging`** | Cập nhật secrets qua Wrangler CLI | **Chờ duyệt** |
| **7** | **Deploy Worker lên môi trường staging & chạy remote drills** | Triển khai code lên Cloudflare Worker staging và chạy bài test E2E | **Chờ duyệt** |

---

## 6. Kết Luận & Bàn Giao

Toàn bộ thông tin khảo sát, ma trận cô lập, định danh tài nguyên và quy trình 6 bước đã được chuẩn bị đầy đủ và chặt chẽ.  
**Môi trường tiếp tục được khóa: REMOTE STAGING BLOCKED.**  
**DỪNG SAU BÀN GIAO TẠI WORKTREE:** Không thực hiện bất kỳ lệnh thay đổi trạng thái nào cho đến khi nhận được phê duyệt của chủ dự án đối với danh sách hành động nêu trên.
