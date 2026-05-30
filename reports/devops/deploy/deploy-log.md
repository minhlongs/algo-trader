# Deployment Execution Log

Dự án: **Algo-Trader RaaS Platform**  
Thời gian thực thi: **2026-05-30T02:49:00Z**  
Mã commit: `fbdaf3c5`  

---

## 1. Dọn dẹp Container cũ
Thực hiện dọn dẹp các container bị lỗi cấu hình hoặc bị kẹt từ các lần chạy trước để tránh xung đột tên:
```bash
docker compose -f docker-compose.yml -f docker/monitoring/docker-compose.monitoring.yml down
```
*Kết quả:* Tất cả các container cũ (`algo-trade`, `algo-grafana`, `algo-prometheus`, `algo-trade-redis`, `algo-trade-nats`) đã được dừng và gỡ bỏ hoàn toàn.

## 2. Biên dịch ứng dụng & Build Image
Chạy script triển khai sản xuất:
```bash
bash scripts/start-production.sh -d
```
*   **Bước 1**: Khởi tạo mạng ảo `algo-trader_algo-net`.
*   **Bước 2**: Pull các image gốc (`redis:7-alpine`, `nats:2.10-alpine`, `prom/prometheus:v2.51.0`, `grafana/grafana:10.4.0`).
*   **Bước 3**: Biên dịch TypeScript sang JS (`pnpm run build` ➔ `dist/`).
*   **Bước 4**: Xây dựng image ứng dụng `algo-trader-algo-trade` dựa trên [Dockerfile](file:///Users/macbook/algo-trader/Dockerfile).
    *   *Sửa đổi quan trọng:* Cập nhật default CMD sang `dist/app.js` và cập nhật đường dẫn `HEALTHCHECK` sang `/health`.

## 3. Khởi chạy Services
Docker Compose khởi chạy toàn bộ 5 services thành công:
1.  **`algo-trade-nats`**: Hoạt động bình thường.
2.  **`algo-trade-redis`**: Hoạt động bình thường.
3.  **`algo-prometheus`**: Hoạt động bình thường, map cổng host `9095`.
4.  **`algo-grafana`**: Hoạt động bình thường, map cổng host `3035`.
5.  **`algo-trade`**: Hoạt động bình thường, map các cổng host `4000`, `4001`, `4002`.
