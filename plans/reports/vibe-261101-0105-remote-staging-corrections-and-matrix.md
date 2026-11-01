# Hồ Sơ Đính Chính: Remote Staging Topology, Recovery Matrix & Candidate Order

**Thời điểm:** 2026-11-01 01:05 (Asia/Saigon)  
**Nhánh làm việc:** `fix/saas-paper-staging-hardening`  
**Worktree:** `/Users/macbook/algo-trader/.claude/worktrees/g1-saas-paper-hardening`  
**Commit cơ sở (HEAD):** `4410d37edebe783a65f5041a1810bb1526c2eef7`  
**Trạng thái môi trường:** **REMOTE STAGING BLOCKED** (Chờ chủ dự án cung cấp host staging và kênh truy cập bảo mật).  
**Cam kết an toàn tuyệt đối:** DỪNG TẠI WORKTREE; không commit/push/merge, không tự ý cài đặt phần mềm/Docker, không tạo tài nguyên cloud, không sửa cấu hình cloud, không deploy, không migration remote, không bật live trading/signing/allowance/transfer ví, không đăng comment ra ngoài hệ thống.

---

## 1. Đính Chính Topology Dashboard: React / Vite SPA (Static Web Server)

- **Thực tế mã nguồn (`dashboard/package.json`):** Dashboard là ứng dụng client-side SPA xây dựng bằng **React 19 + Vite 6**, không phải Next.js server runtime (`vite build` sinh thư mục `dist`).
- **Phương án phục vụ staging:**
  - Build static artifact (`pnpm run build` tạo `dashboard/dist`).
  - Phục vụ bằng web server tĩnh trên staging host (Nginx / Caddy container) hoặc Cloudflare Pages staging (`wrangler pages deploy dist --project-name=algo-trader-dashboard --branch=staging`).
  - **Tuyệt đối không dùng `vite` dev server làm deployment staging** vì thiếu production optimization, không có bộ đệm bảo mật và không kiểm soát được connection leak.
  - **CORS & Auth Origin:** Giao diện dashboard gọi API qua Cloudflare Worker Staging (`https://algo-trader-staging.<subdomain>.workers.dev`) hoặc API Backend Staging với header `Access-Control-Allow-Origin: https://dashboard-staging.<subdomain>.pages.dev` (hoặc hostname staging cụ thể).

---

## 2. Đính Chính Cô Lập Mạng PostgreSQL & Hostname Nội Bộ

- **Nguyên tắc bảo vệ cổng:** Loại bỏ hoàn toàn mapping mở `5433:5432` không giới hạn địa chỉ.
- **Ranh giới mạng Staging:**
  - PostgreSQL staging chỉ được truy cập trong **Docker bridge network nội bộ staging** (ví dụ: `algo-staging-net`).
  - Trường hợp cần mở ra host máy chủ: **chỉ bind loopback `127.0.0.1:5433:5432`**, tuyệt đối không bind `0.0.0.0`.
- **Hostname kết nối nội bộ:**
  - Node backend staging kết nối vào PostgreSQL qua URL mạng nội bộ Docker:
    `postgres://algo_staging:<password>@staging-postgres:5432/algo_trader_staging` (với service name `staging-postgres` trong compose).
  - Không công khai cổng database ra Internet dưới bất kỳ hình thức nào.

---

## 3. Đính Chính Recovery Matrix (Quy Trình Khôi Phục Thực Tế)

| Thành phần | Cơ chế khôi phục chuẩn xác (Đính chính) | Điều cấm / Chống chỉ định |
| :--- | :--- | :--- |
| **Cloudflare D1** | Snapshot backup D1 trước khi chạy migration (`npx wrangler d1 export`) và xác minh khả năng restore vào DB phụ thử nghiệm trước khi áp dụng schema lên D1 staging. | **CẤM mặc định rollback bằng `DROP TABLE`** vì sẽ phá hủy toàn bộ dữ liệu hiện hữu. |
| **Secrets Staging** | Lưu lại snapshot version/giá trị test secrets trước đó trong vault bảo mật cục bộ. Khi cần rollback, nạp lại đúng giá trị của phiên bản trước hoặc kích hoạt quy trình xoay key (key rotation) có kiểm soát. | **CẤM ghi chuỗi rỗng (`""`)** để rollback vì gây crash runtime không kiểm soát và sai lệch contract. |
| **PostgreSQL & Docker** | Rollback bằng cách khôi phục snapshot database (`pg_restore` từ bản dump trước migration). Giữ nguyên Docker container và persistent volume `staging_pg_data`. | **Dừng container KHÔNG đồng nghĩa phục hồi dữ liệu.** **CẤM chạy `docker compose down -v`** trong quy trình cleanup/rollback mặc định vì sẽ xóa sạch volume. |
| **Git & Worktree** | Rollback nhánh tính năng bằng commit hoàn tác cục bộ (`git revert <commit-sha>`) hoặc branch pointer riêng của feature branch. | **CẤM dùng `git reset --hard` hay `git checkout -- .` trên toàn worktree** vì sẽ clobber/xóa mất các thay đổi chưa commit của người khác trong môi trường chia sẻ. |

---

## 4. Rà Soát Thứ Tự Chốt Candidate & Tránh Làm Bẩn Artifact (Dirty State)

- **Nguyên nhân rủi ro:** Nếu commit candidate trước rồi mới cập nhật `staging-manifest.json` và `wrangler.toml` (để điền Account ID hoặc KV ID được duyệt), commit SHA ban đầu sẽ bị lệch so với mã nguồn thực tế deploy (tạo ra dirty candidate).
- **Trình tự chốt revision/artifact chuẩn xác:**
  1. **Bước 1 (Hiện tại):** Dừng tại worktree, giữ dirty state để chủ dự án duyệt danh mục. **Chưa commit.**
  2. **Bước 2 (Sau khi duyệt):** Điền các tham số cấu hình chính thức (Account ID, KV ID, hostname staging) vào `staging-manifest.json` và `wrangler.toml`.
  3. **Bước 3 (Khóa Candidate duy nhất):** Chạy toàn bộ 47/47 tests và preflight check. Khi đạt 100% green, mới thực hiện **1 single git commit** đóng gói toàn bộ thay đổi cấu hình + mã nguồn.
  4. **Bước 4 (Deploy theo đúng SHA):** Dùng Commit SHA của commit vừa tạo làm định danh bất biến (immutable candidate SHA) truyền vào script deploy. `/api/version` remote bắt buộc phải khớp 100% SHA này.

---

## 5. Đính Chính Dự Toán Chi Phí & Ma Trận Phê Duyệt Tách Biệt

- **Nguyên tắc chi phí:** Không cam kết `$0.00` khi chưa có dữ liệu đo đạc thực tế của tenant và hạn mức gói. Mọi chi phí được ghi nhận là Ước tính (Estimate) hoặc **UNKNOWN**.

### Bảng Phê Duyệt Từng Side-Effect Cụ Thể (Itemized Matrix)

| Mục | Thao tác kỹ thuật | Target cụ thể | Prerequisites | Dữ liệu & Hệ thống bị tác động | Cơ chế Rollback chuẩn xác | Chi phí dự kiến | Trạng thái quyền |
| :---: | :--- | :--- | :--- | :--- | :--- | :--- | :---: |
| **#1** | **Cập nhật Manifest & Cấu hình Staging** | `staging-manifest.json`, `wrangler.toml` | Chủ dự án phê duyệt dùng Account ID & cấp host | Ghi Account ID và tên KV staging vào cấu hình | Hoàn tác thay đổi trên file cấu hình | **$0.00** | **Chờ duyệt** |
| **#2** | **Tạo Local Candidate Commit** | Git branch `fix/saas-paper-staging-hardening` | Mục #1 hoàn tất, 47/47 tests PASS, 0 tsc error | Đóng gói sạch sẽ thành 1 commit duy nhất mang SHA cố định | `git revert <SHA>` (bảo toàn tree) | **$0.00** | **Chờ duyệt** |
| **#3** | **Cấp phát KV Namespace mới** | Cloudflare API (Account `f691e83094f776311a1bfe3f8b126f1c`) | Mục #1 đã được duyệt | Tạo mới namespace `algo-trader-staging-CACHE` | Xóa namespace bằng Wrangler CLI qua ID vừa tạo | **Estimate: $0** (nằm trong hạn mức gói Workers hiện có) | **Chờ duyệt** |
| **#4** | **Cấp quyền D1 Staging Schema** | D1 UUID `943fd11e-c81a-4342-afa6-7e80aa7a18df` | Snapshot backup D1 thành công | Tạo 3 bảng `subscriptions`, `coupons`, `paper_trades_v3` trên D1 staging | Restore lại bản snapshot backup D1 đã lưu | **Estimate: $0** (nằm trong hạn mức gói D1 hiện có) | **Chờ duyệt** |
| **#5** | **Khởi tạo PostgreSQL & Node Backend Staging** | Máy chủ staging riêng biệt | Host staging được định danh và xác nhận kênh SSH an toàn | Tạo container `staging-postgres`, `staging-node` trên bridge network nội bộ; bind tối đa `127.0.0.1:5433` | Dừng container; restore database từ bản dump ban đầu (giữ volume) | **UNKNOWN** (Phụ thuộc cấu hình VPS/server do chủ dự án chọn) | **BLOCKED (Chưa có host)** |
| **#6** | **Nạp Test Secrets cho Staging Worker** | Worker `algo-trader-staging` | Mục #3 & #5 hoàn tất | Nạp các sandbox secrets (Mock JWT, NOWPayments Sandbox) | Xoay lại secret (key rotation) về giá trị lưu trữ an toàn trước đó | **Estimate: $0** | **Chờ duyệt** |
| **#7** | **Deploy Worker Staging & Xác Minh SHA** | Cloudflare Edge Worker `algo-trader-staging` | Mục #2-#6 hoàn tất | Triển khai mã nguồn Worker lên `algo-trader-staging.workers.dev`, xác minh SHA qua `/api/version` | `npx wrangler rollback --env staging` | **Estimate: $0** | **Chờ duyệt** |
| **#8** | **Deploy Dashboard Staging (Static Build)** | Host staging hoặc Cloudflare Pages staging | Mục #5 & #7 hoàn tất | Phục vụ static build từ `dashboard/dist` qua web server riêng | Dừng web server staging hoặc rollback Pages deployment | **UNKNOWN** (Tùy host staging hoặc Cloudflare Pages) | **BLOCKED (Chưa có host)** |
| **#9** | **Diễn Tập Remote (E2E, Kill, Recovery)** | Toàn bộ môi trường staging remote | Mục #7 & #8 triển khai thành công | Sinh bản ghi thử nghiệm trên D1 & PG staging; kích hoạt L1 kill switch | Chạy script cleanup dữ liệu test; khôi phục state từ snapshot backup | **Estimate: $0** (chỉ tốn requests thử nghiệm) | **Chờ duyệt** |

---

## 6. Yếu Tố Chặn Cốt Lõi Cần Người Dùng Cung Cấp (Primary Blocker)

Để có thể kích hoạt các bước trên sau khi phê duyệt, yếu tố kỹ thuật duy nhất đang chặn hệ thống là:
> **Định danh Host Staging cụ thể (Địa chỉ IP / Domain máy chủ staging nội bộ hoặc VPS độc lập) cùng Kênh truy cập bảo mật đã cấu hình (ví dụ: SSH Key Pair / Bastion Host).**  
> *(Lưu ý bảo mật tuyệt đối: Không dán private key hoặc mật khẩu vào cửa sổ chat).*

---

## 7. Kết Luận Bàn Giao
- Toàn bộ bằng chứng kiểm nghiệm local (47/47 tests PASS, monotonic drills, fail-closed preflight) tiếp tục được bảo toàn nguyên vẹn.
- Mọi điều chỉnh về kiến trúc (React/Vite static build, loopback/bridge PG, backup/restore recovery matrix, thứ tự chốt candidate) đã được cập nhật chính xác vào hồ sơ.
- **DỪNG TẠI WORKTREE:** Không thực hiện bất kỳ lệnh thay đổi trạng thái nào cho đến khi nhận được chỉ thị và thông tin host từ chủ dự án.
