# Hồ Sơ Bổ Sung: Định Danh Host Staging, Luồng Kiến Trúc SaaS Đầy Đủ & Danh Sách Duyệt Tách Biệt

**Thời điểm:** 2026-11-01 00:40 (Asia/Saigon)  
**Nhánh làm việc:** `fix/saas-paper-staging-hardening`  
**Worktree:** `/Users/macbook/algo-trader/.claude/worktrees/g1-saas-paper-hardening`  
**Commit cơ sở (HEAD):** `4410d37edebe783a65f5041a1810bb1526c2eef7`  
**Trạng thái môi trường:** **REMOTE STAGING BLOCKED** (Chờ chủ dự án cung cấp host và duyệt từng side effect).  
**Cam kết an toàn tuyệt đối:** DỪNG SAU BÀN GIAO; không commit/push/merge, không tự ý cài đặt phần mềm/Docker, không cấp phát cloud, không sửa cấu hình cloud, không deploy, không chạy migration remote, không bật live trading/signing/allowance/transfer ví, không đăng comment ra ngoài hệ thống.

---

## 1. Định Danh & Tình Trạng Host Staging Cho PostgreSQL & Node Backend

### 1.1. Hiện Trạng Khảo Sát Hệ Thống Cục Bộ
- Máy trạm macOS phát triển cục bộ hiện **không có Docker daemon** (`docker not found` trong PATH).
- Máy chủ Production VPS (`scripts/start-production.sh` / `docker-compose.yml`) là môi trường vận hành trực tiếp, **tuyệt đối không được sử dụng để chạy thử staging**.

### 1.2. Trạng Thái Quyền & Định Danh Host
- **Trạng thái:** **BLOCKED** — Chưa có máy chủ / host độc lập được chỉ định chính thức cho staging.
- **Yêu cầu đối với Chủ Dự Án:**
  - Cung cấp định danh host cụ thể (ví dụ: máy chủ staging nội bộ riêng hoặc VPS staging tách biệt).
  - Cung cấp kênh truy cập bảo mật qua SSH (SSH Key / Bastion Host); **tuyệt đối không dán mật khẩu hoặc private key vào chat/transcript**.
  - **Nguyên tắc bảo vệ nghiêm ngặt:**
    - Không công khai cổng PostgreSQL ra ngoài Internet (chỉ bind localhost `127.0.0.1` hoặc mạng nội bộ Docker bridge).
    - Không sử dụng socket, volume, database hay credentials của production để bù vào phần staging còn thiếu.

---

## 2. Kiến Trúc Luồng SaaS Đầy Đủ (Full SaaS/Paper Staging Topology)

### 2.1. Sơ Đồ Luồng Kết Nối & Điểm Bảo Vệ
```text
┌─────────────────────────────────────────────────────────────┐
│                    NGƯỜI DÙNG / CLIENT                      │
└──────────────┬──────────────────────────────┬───────────────┘
               │ (1) Browser UI               │ (2) API / Webhooks
               ▼                              ▼
┌──────────────────────────────┐ ┌──────────────────────────────────────┐
│  Next.js Dashboard Staging   │ │  Cloudflare Worker Staging           │
│  (Port 3001 / Staging Host)  │ │  (algo-trader-staging.workers.dev)   │
└──────────────┬───────────────┘ └──────┬──────────────┬────────────────┘
               │                        │              │
               │ (Proxy API)            │              │
               ▼                        │              │
┌──────────────────────────────────────┐│              │
│  Node Backend API Staging            ││              │
│  (Port 3000 / Staging Host)          ││              │
└──────────────┬───────────────────────┘│              │
               │                        │              │
       ┌───────┴───────┐        ┌───────┴──────┐ ┌─────┴──────┐
       ▼               ▼        ▼              ▼ ▼            ▼
┌──────────────┐┌──────────────┐┌──────────────┐ ┌────────────┐
│  PostgreSQL  ││ Redis / NATS ││  D1 Database │ │     KV     │
│   Staging    ││   Staging    ││   Staging    │ │  Staging   │
│ (Port 5433)  ││ (Queue/Pub)  ││ (Subscribers)│ │  (Config)  │
└──────────────┘└──────────────┘└──────────────┘ └────────────┘
```

### 2.2. Ma Trận Dịch Vụ SaaS/Paper Runtime & Phân Định Biên Giới
| Thành phần | Vai trò trong luồng SaaS/Paper | Hostname / Port Staging | Giao thức & Bảo vệ | Tài nguyên lưu trữ tương ứng |
| :--- | :--- | :--- | :--- | :--- |
| **Dashboard UI** | Giao diện SaaS: Quản lý thuê bao, cấu hình BYOK, xem danh mục & Paper Trades | Host staging (Port `4001:3001`) | HTTPS, CORS trỏ về Worker/API staging | Local storage / Session cookies |
| **Cloudflare Worker** | Edge Proxy, xác thực JWT, định tuyến SaaS tiers, Webhook receiver, Paper Ledger read | `https://algo-trader-staging.<subdomain>.workers.dev` (Routes: `[]`) | TLS 1.3, Auth Header `Bearer <JWT>`, CORS allowlist dashboard | D1 `algo-trader-staging` (`943fd11e-...`), KV `algo-trader-staging-CACHE` |
| **Node Backend** | Execution engine, Signal validator, Swarm consensus, tính toán PnL, Paper Trading Loop | Host staging (Port `4000:3000`) | Mạng nội bộ bảo vệ, Worker proxy qua `VPS_ORIGIN` an toàn | PostgreSQL staging (`algo_trader_staging`), Redis `6379`, NATS `4222` |
| **PostgreSQL Staging** | Lưu trữ dài hạn vị thế Paper Trading v3, lịch sử nến, logs kiểm toán | Host staging (Port nội bộ `5433:5432`) | Chỉ kết nối từ Node backend container; cấm public port | Volume riêng `pg_staging_data` (Role riêng: `algo_staging`) |
| **D1 Staging** | Cơ sở dữ liệu Edge: bảng `subscriptions`, `coupons`, `paper_trades_v3` (read-cache) | Cloudflare Edge D1 | Cloudflare Worker D1 API | Database UUID: `943fd11e-c81a-4342-afa6-7e80aa7a18df` |
| **KV Staging** | Lưu cấu hình từng tenant (`config:<tenantId>`), rate limits, L1 kill switch (`QWEN_KILL`) | Cloudflare Edge KV | Cloudflare Worker KV API | Namespace ID mới: `algo-trader-staging-CACHE` |
| **Redis & NATS** | Pub/Sub báo giá thời gian thực & event streaming nội bộ cho Paper engine | Host staging (Port nội bộ `6379`, `4222`) | Chỉ kết nối trong bridge network `algo-net-staging` | Volumes riêng `redis_staging_data`, `nats_staging_data` |

---

## 3. Bảng Phê Duyệt Từng Side-Effect Cụ Thể (Granular Approval Matrix)

Chủ dự án có thể phê duyệt hoặc từ chối độc lập từng mục dưới đây mà không cần người thực thi tự ý suy diễn quyền hạn:

| Mục | Thao tác kỹ thuật | Target cụ thể | Điều kiện tiên quyết (Prerequisites) | Dữ liệu & Hệ thống bị tác động | Cơ chế Rollback an toàn | Chi phí dự kiến | Trạng thái quyền |
| :---: | :--- | :--- | :--- | :--- | :--- | :--- | :---: |
| **#1** | **Tạo Local Candidate Commit** | Git worktree local (`g1-saas-paper-hardening`) | 47/47 targeted tests PASS, 0 tsc errors | Đóng gói dirty diff thành 1 commit git trên branch `fix/saas-paper-staging-hardening` | `git reset --soft HEAD~1` | **$0.00** | **Chờ duyệt** |
| **#2** | **Cập nhật Manifest Staging** | `staging-manifest.json` | Mục #1 đã được tạo commit candidate | Chuyển `accountStatus` từ `BLOCKED...` sang `PROVISIONED`, điền Account ID `f691e83094f776311a1bfe3f8b126f1c` | `git checkout -- staging-manifest.json` | **$0.00** | **Chờ duyệt** |
| **#3** | **Cấp phát KV Namespace mới** | Cloudflare API / Account `f691e83094f776311a1bfe3f8b126f1c` | Mục #2 đã hoàn tất | Tạo mới 1 KV namespace đặt tên `algo-trader-staging-CACHE` | `npx wrangler kv namespace delete --namespace-id <ID>` | **$0.00** (nằm trong gói Paid hiện có) | **Chờ duyệt** |
| **#4** | **Cấp quyền D1 Staging Schema** | D1 UUID `943fd11e-c81a-4342-afa6-7e80aa7a18df` | Mục #2 & #3 hoàn tất | Tạo 3 bảng `subscriptions`, `coupons`, `paper_trades_v3` trên D1 staging (hiện 0 bảng) | Chạy SQL DROP TABLE trên D1 staging (không chạm D1 prod) | **$0.00** (nằm trong hạn mức D1) | **Chờ duyệt** |
| **#5** | **Khởi tạo PostgreSQL & Node Backend Staging** | Máy chủ staging (do chủ dự án cung cấp) | Host staging được định danh và xác nhận quyền truy cập | Tạo Docker containers, volumes riêng biệt; role riêng `algo_staging`; port không công khai | `docker compose -p algo-staging down -v` | **UNKNOWN** (Tùy thuộc máy chủ do chủ dự án chọn) | **BLOCKED (Chưa có host)** |
| **#6** | **Nạp Test Secrets cho Staging Worker** | Worker `algo-trader-staging` | Mục #3 & #5 hoàn tất | Nạp các keys ngẫu nhiên (Mock JWT, NOWPayments Sandbox, Bot Token giả lập) qua `wrangler secret put --env staging` | Xóa/ghi đè secrets bằng giá trị rỗng | **$0.00** | **Chờ duyệt** |
| **#7** | **Deploy Worker Staging & Xác Minh SHA** | Cloudflare Edge Worker `algo-trader-staging` | Mục #1-#6 hoàn tất | Triển khai mã nguồn Worker lên domain staging `algo-trader-staging.workers.dev`, xác minh SHA qua `/api/version` | `npx wrangler rollback --env staging` | **$0.00** | **Chờ duyệt** |
| **#8** | **Deploy Dashboard Staging** | Host staging (Port `4001:3001`) | Mục #5 & #7 hoàn tất | Triển khai giao diện Next.js kết nối vào API staging | Dừng container dashboard staging | **$0.00** (trên host staging) | **BLOCKED (Chưa có host)** |
| **#9** | **Thực hiện Diễn Tập Remote (E2E, Kill, Recovery)** | Toàn bộ môi trường staging remote | Mục #7 & #8 triển khai thành công | Sinh các bản ghi giao dịch paper test trên staging, kích hoạt thử kill switch L1 trên remote | Dọn dẹp dữ liệu test bằng script cleanup staging | **$0.00** | **Chờ duyệt** |

---

## 4. Kết Luận & Bàn Giao

1. **Khóa Bằng Chứng Local:** Bảo toàn nguyên vẹn 100% kết quả kiểm nghiệm (47/47 tests green, monotonic benchmarks, fail-closed preflight).
2. **Trạng Thái Remote:** Tiếp tục giữ trạng thái **REMOTE STAGING BLOCKED**.
3. **Trình Duyệt:** Bảng 9 mục phía trên đã phân tách chi tiết từng side effect kỹ thuật, prerequisite, phạm vi tác động, cơ chế rollback và dự toán chi phí để chủ dự án dễ dàng ra quyết định.
4. **Cam Kết Dừng:** **DỪNG TẠI WORKTREE.** Không thực hiện bất kỳ lệnh thay đổi trạng thái nào cho đến khi nhận được phê duyệt chính thức từ chủ dự án.
