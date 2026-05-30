# Rollback Plan
**Dự án:** Algo-Trader (Backend & Dashboard)
**Thời gian:** 2026-05-30

Tài liệu này định nghĩa quy trình khôi phục nhanh (Rollback) trong trường hợp xảy ra lỗi nghiêm trọng sau khi triển khai phiên bản mới lên môi trường Production.

## 1. Phương án Rollback khẩn cấp mức Code (Git Revert)
Nếu mã nguồn trên nhánh `main` bị lỗi, tuyệt đối không được dùng `git push --force`. 
1. Tạo một nhánh sửa lỗi khẩn cấp: `git checkout -b revert-b30a9f63`.
2. Tạo commit revert: `git revert b30a9f63` (hoặc commit SHA tương ứng).
3. Đẩy code lên và tạo Pull Request merge nhanh vào `main` để kích hoạt CI/CD của Cloudflare xây dựng và triển khai lại phiên bản trước đó.

## 2. Phương án Rollback Frontend (Cloudflare Pages)
Cloudflare Pages hỗ trợ tính năng Rollback tức thì qua Dashboard hoặc API:
1. Truy cập Cloudflare Dashboard -> **Workers & Pages** -> Chọn dự án `algo-trader-dashboard`.
2. Tìm đến mục **Deployments**, chọn phiên bản hoạt động ổn định trước đó (ví dụ phiên bản được tạo trước hash `082bdf5b`).
3. Click chọn **Rollback to this deployment** để kích hoạt rollback tĩnh ngay lập tức (dưới 10 giây).

## 3. Khôi phục Backend (Cloudflare Workers)
Cloudflare Workers hỗ trợ roll back các phiên bản phiên bản (Version) trước đó:
1. Xem danh sách các phiên bản cũ: `wrangler deployments list`.
2. Hoặc roll back về phiên bản trước bằng cách chạy lệnh deploy thủ công từ phiên bản commit trước:
   ```bash
   git checkout <stable-commit-sha>
   pnpm wrangler deploy
   git checkout fix/golive-blockers
   ```

## 4. Cơ chế ngắt khẩn cấp (Circuit Breakers & Kill Switches)
Nếu bot giao dịch tự động hoạt động bất thường (runaway signals) hoặc gặp drawdown quá lớn:
- **L1 Kill Switch API:** Gửi yêu cầu `POST /api/v1/admin/qwen/kill` kèm theo mã `X-Admin-Key` để tạm dừng bot.
- **Biến môi trường:** Chuyển `QWEN_SIGNAL_KILL=1` trong cấu hình Worker để vô hiệu hóa toàn bộ luồng tạo tín hiệu giao dịch.
