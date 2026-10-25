# Phase 1 — Migration `usage_metrics` + đường metering bền vững

## Goal

Bảng `usage_metrics` mà `usage-metering-service-core.ts` đọc và ghi hiện **không được migration
nào tạo** (đã tra 106 file migration ở cả hai gốc). Viết migration tạo đúng bộ cột code đang dùng,
để cổng hạn mức có dữ liệu để đọc. Đây là điều kiện tiên quyết của mọi phase sau.

## Files (ownership: phase này)

READ first:
- `src/platform/signals-api/usage-metering-service-core.ts`
- `src/platform/signals-api/usage-metering-types.ts`
- `src/shared/db/migrations/051-add-usage-metering.ts` (mẫu style)
- `src/shared/db/migrations/027-usage-metering-schema.sql`

CREATE:
- `src/shared/db/migrations/052-add-usage-metrics-table.ts`

MODIFY:
- `src/platform/signals-api/usage-metering-service-core.ts` (chỉ phần xử lý lỗi ở phase này;
  phần `check()` thuộc phase 2)

## Steps

1. Rút chính xác bộ cột từ code (không tự phát minh cột):
   - `recordCall` INSERT: `id, subscriber_id, period, calls_today, calls_this_period,
     period_limit, updated_at`
   - `getPeriodUsage` SELECT: `calls_this_period`
   - `getSnapshot` SELECT: `id, subscriber_id, period, calls_today, calls_this_period,
     period_limit, overage_calls, last_reset_at, updated_at`
   - UNIQUE constraint: `(subscriber_id, period)` (theo `ON CONFLICT (subscriber_id, period)`)
2. Viết `052-add-usage-metrics-table.ts` theo đúng style của `051`: `export const id`,
   `export const description`, `export async function up(client: PoolClient)`,
   `CREATE TABLE IF NOT EXISTS`, index cho các cột tra cứu.
3. Đăng ký migration vào registry nếu repo có một danh sách tường minh (kiểm tra trước khi thêm —
   nếu migrations được quét theo thư mục thì không cần đăng ký tay).
4. Sửa xử lý lỗi theo quyết định founder (fail-closed): `getPeriodUsage` bỏ
   `catch { return 0 }`, để lỗi nổi lên để caller quyết định 503 + cảnh báo.
5. Viết test mới `src/shared/db/__tests__/052-add-usage-metrics-table.test.ts` chứng minh
   **migration tạo được bảng với đúng bộ cột**. Test phải chạy SQL thật (hoặc parser SQL kiểm
   cột), không được chỉ `expect(up).toBeDefined()` — cảnh báo `usage-metering-service.test.ts`
   hiện mock `query` nên không phát hiện được bảng thiếu, đó chính là lỗ hổng cần đóng.

## Validation

- `npx tsc --noEmit` → 0 error
- `npx vitest run src/shared/db/__tests__/052-add-usage-metrics-table.test.ts` → pass
- `grep -rn "usage_metrics" src/shared/db/migrations/` → có hit trong `052-*`

## Risk

Migration chạy trên database đang có dữ liệu. `CREATE TABLE IF NOT EXISTS` là an toàn; **không**
thao tác dữ liệu cũ trong phase này. Nếu bảng đã được tạo tay ở production (có thể — phase này
không loại trừ), `IF NOT EXISTS` khiến migration idempotent.

## Rollback

Xoá file migration `052` và revert `usage-metering-service-core.ts`. Không có thay đổi dữ liệu.
