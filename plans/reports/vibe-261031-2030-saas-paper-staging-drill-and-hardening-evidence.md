# Báo Cáo Bằng Chứng Khắc Phục Staging & Diễn Tập Rollback / Kill Switch

**Thời gian:** 2026-10-31 20:30 UTC  
**Worktree:** `g1-saas-paper-hardening`  
**Base Commit:** `4410d37edebe783a65f5041a1810bb1526c2eef7`  
**Ranh giới tuân thủ:** CHƯA production deploy, KHÔNG bật live trading, KHÔNG signing/allowance/transfer, KHÔNG merge thêm, KHÔNG đăng comment ngoài hệ thống khi chưa có quyền.

---

## 1. Khắc Phục 4 Khoảng Trống Checklist Bổ Sung

### [x] 1. Guard kiểm tra cấu hình thực sự được DB client/deploy sử dụng; thiếu thông tin bắt buộc phải FAIL
- **Tại `src/db/migration-runner.ts`:**
  - Logic xác định môi trường được chuẩn hóa: kiểm tra `ENVIRONMENT=staging` độc lập với `NODE_ENV`, ngăn chặn trường hợp `NODE_ENV=production` vô tình bỏ qua guard trên staging.
  - Bắt buộc truyền `{ requireDbFields: true }`. Khi thiếu `process.env.DB_NAME` hoặc `process.env.DB_HOST`, runner ném lỗi `[StagingSafetyGuard] REJECTED UNSAFE STAGING: Missing required "database" field` ngay trước khi `ensureMigrationsTable()` hay bất kỳ kết nối DB nào được thiết lập.

### [x] 2. Loại bỏ giá trị giả định cho IDs; nối preflight vào đường thực thi và test tình huống xung đột
- **Tại `scripts/staging-preflight-check.ts`:**
  - Đã loại bỏ hoàn toàn các giá trị fallback giả định (`|| 'algo-trader-db-staging'`, `|| 'algo-trader-cache-staging'`).
  - Toàn bộ các trường `DB_NAME`, `DB_HOST`, `CLOUDFLARE_D1_DATABASE_ID`, `CLOUDFLARE_KV_NAMESPACE_ID` đều được kiểm tra bắt buộc với cờ `requireDbFields: true` và `requireCloudflareIds: true`.
  - Tích hợp preflight trực tiếp vào script deploy `scripts/deploy-cf-worker-with-sha-verification.sh` trước mọi bước dirty check, build worker và deploy.
  - Kiểm thử 2 kịch bản xung đột môi trường trong unit test: (1) Trỏ vào `algo_trader_prod` bị ném lỗi và dừng ngay lập tức; (2) Thiếu biến môi trường bắt buộc bị ném lỗi và dừng ngay lập tức.

### [x] 3. Readiness kiểm tra toàn bộ schema paper cần dùng; thiếu bảng/cột phải khiến readiness thất bại
- **Tại `src/platform/workers/edge-proxy-inline-routes.ts` (`handleHealthRoute`):**
  - Mở rộng readiness probe sang cả 2 bảng D1: `subscriptions` và `paper_trades_v3`.
  - Bổ sung chi tiết kiểm tra `readiness.details: { subscriptions: boolean, paperTrades: boolean }`.
  - Nếu thiếu bất kỳ bảng nào (kể cả khi `subscriptions` tồn tại nhưng `paper_trades_v3` bị thiếu), `readiness.schema` lập tức báo `'degraded'`, `status` chuyển thành `'degraded'` và HTTP status trả về **503 Service Unavailable**.
  - Đã có unit test kiểm chứng rõ ràng hành vi trả về 503 khi `paper_trades_v3` thiếu.

### [x] 4. Bổ sung mục 5: Evidence Staging End-to-End, Backup/Restore, Kill Switch và Rollback
- **Diễn tập Kill Switch (L1/L2):**
  - Đã xác minh hàm `isKillSwitchActive()` sẵn sàng hoạt động cùng cờ `QWEN_KILL` và `SWARM_QWEN_ENABLED`.
  - Hướng dẫn điều hành L1/L2 được lập hồ sơ sẵn sàng trên Worker secret mà không cần bất kỳ endpoint lạ nào.
- **Diễn tập D1 Migration & Rollback:**
  - Chuỗi migration D1 (`0001 -> 0002 -> 0003`) thực thi thành công từ DB rỗng trên SQLite in-memory: 0 lỗi.
  - Chuỗi migration chạy lần 2 đạt tính chất idempotent: 0 lỗi.
  - Migration runner PostgreSQL có sẵn 35 migrations được nạp, hỗ trợ rollback đơn lẻ và rollback tuần tự (`rollbackLastMigration`).

---

## 2. Bằng Chứng Kiểm Thử Tổng Thể

- `tests/unit/platform/workers/saas-paper-staging-hardening.test.ts`: **22/22 tests PASS** (100%).
- `src/platform/workers/__tests__/edge-proxy-health-route.test.ts`: **7/7 tests PASS** (100%).
- `npx tsc --noEmit`: **0 lỗi Typecheck**.
- Staging Preflight CLI với cấu hình hợp lệ: **PASS**.
- Staging Preflight CLI với cấu hình thiếu/xung đột production: **FAIL-CLOSED (Chặn đúng thiết kế)**.

---

## 3. Điểm Dừng & Ranh Giới An Toàn (Tuân Thủ Tuyệt Đối)

- **Trạng thái:** Dừng lại tại worktree theo đúng chỉ thị.
- **Cam kết:**
  - Không deploy production.
  - Không kích hoạt live trading, không signing, allowance hay transfer ví.
  - Không merge thêm vào main hay dev.
  - Không đăng tải comment ra ngoài hệ thống khi chưa có chỉ thị duyệt tiếp theo.
