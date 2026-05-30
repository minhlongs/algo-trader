# Rollback Plan

Dự án: **Algo-Trader RaaS Platform**  

---

## 1. Kịch bản Rollback khẩn cấp (Emergency Rollback)
Nếu hệ thống gặp lỗi nghiêm trọng (như crash, rò rỉ bộ nhớ, hoặc sai lệch giao dịch), hãy thực hiện quy trình rollback theo các bước dưới đây:

### Bước 1: Hạ toàn bộ Stack Docker
Dừng các service đang chạy để bảo toàn trạng thái dữ liệu:
```bash
docker compose -f docker-compose.yml -f docker/monitoring/docker-compose.monitoring.yml down
```
*Lưu ý:* Việc này sẽ dừng giao dịch và thu hồi toàn bộ tài nguyên cổng.

### Bước 2: Khôi phục phiên bản Git cũ (nếu cần)
Nếu lỗi do phiên bản code mới, quay trở lại commit trước đó (ví dụ commit an toàn gần nhất):
```bash
git reset --hard HEAD~1
```
Hoặc checkout về nhánh stable khác:
```bash
git checkout stable
```

### Bước 3: Rebuild và khởi động lại phiên bản cũ
Xây dựng lại image ứng dụng dựa trên mã nguồn phiên bản cũ và khởi chạy lại stack:
```bash
bash scripts/start-production.sh -d
```

## 2. Rollback Cơ sở dữ liệu (Database Rollback)
Nếu lỗi liên quan đến migrations mới (ví dụ file `019_add_trades_composite_index.ts` gây lỗi khóa hoặc làm giảm hiệu năng):
1.  Truy cập vào container DB hoặc chạy script rollback migration cục bộ (nếu có hỗ trợ).
2.  Chạy lệnh hạ migration:
    ```bash
    pnpm exec ts-node src/db/migration-runner.ts down
    ```
    *(Hoặc xóa chỉ mục composite index trực tiếp trong Postgres/SQLite).*

## 3. Khôi phục Redis & Cache
Trong trường hợp Redis Cluster bị lỗi phân mảnh slot hoặc dữ liệu cache bị lỗi:
1.  Xóa sạch volume dữ liệu Redis:
    ```bash
    docker volume rm algo-trader_redis_data
    ```
2.  Khởi động lại Redis để tự động tái tạo bộ nhớ đệm sạch.
