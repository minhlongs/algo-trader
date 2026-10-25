# Phase 2 — Nối `check()` vào đường request, bỏ `InMemoryCounter` khỏi quyết định

## Goal

Cổng hạn mức hiện là **code mồ côi**: middleware chỉ `recordCall` sau khi response xong, còn
`checkUsage` / `getUsageSnapshot` (`subscription-service-d1.ts:117,127`) không có một caller nào.
Phase này nối quyết định "có cho phép" vào **trước** khi trả response, và làm cả `allowed` lẫn
`remaining` đọc từ cùng một hàng durable.

## Files (ownership: phase này)

READ first:
- `src/platform/signals-api/usage-metering-service-core.ts`
- `src/platform/signals-api/usage-metering-counter.ts`
- `src/platform/middleware/usage-tracking-express.ts`
- `src/platform/middleware/usage-tracking-middleware.ts`
- `tests/unit/platform/signals-api/usage-metering-service.test.ts`

MODIFY:
- `src/platform/signals-api/usage-metering-service-core.ts`
- `src/platform/middleware/usage-tracking-middleware.ts`

CREATE:
- `src/platform/signals-api/__tests__/usage-metering-durable-gate.test.ts`

DO NOT TOUCH:
- `usage-tracking-express.ts` (chỉ đọc — quyết định route thuộc phase 8)
- mọi file trong `src/platform/metering/`, `src/platform/billing/`, `src/desk/opencoresaas2026monetization/`

## Steps

1. Trong `check()`: bỏ `this.counter.check(...)` khỏi đường tính `remaining`. Sau khi
   `recordCall` thành công, đọc lại `calls_this_period` từ cùng hàng vừa ghi và dùng nó cho cả
   `allowed` lẫn `remaining`. Một hàng, một số.
2. `InMemoryCounter` vẫn được giữ lại cho mục đích rate-limit nếu có, nhưng **không** cho quyết
   định quota. Nếu không còn ai dùng cho quota, để nguyên file (xử lý ở phase 3).
3. Trong `usage-tracking-middleware.ts`: gọi `check()` trước `next()`. Nếu `allowed === false`,
   trả 429 kèm `overage`, `tier`, `period`, `used`, `limit` — **thêm field, không đổi shape cũ**.
   Nếu đọc durable ném lỗi → 503 + `logger.error` (fail-closed, quyết định founder).
4. Test mới chứng minh: (a) subscriber dưới hạn mức được qua và `remaining` giảm đúng;
   (b) subscriber đạt hạn mức bị 429 với `used === limit`; (c) lỗi đọc durable trả 503, không
   phải 200; (d) `remaining` **không** phụ thuộc số lần khởi động process.
5. Cập nhật (không xoá) `usage-metering-service.test.ts` để bỏ mock trả về `remaining` giả.

## Validation

- `npx tsc --noEmit` → 0 error
- `npx vitest run src/platform/signals-api/__tests__/usage-metering-durable-gate.test.ts` → pass
- `npx vitest run tests/unit/platform/signals-api/usage-metering-service.test.ts` → pass
- `grep -rn "InMemoryCounter" src/platform/signals-api/usage-metering-service-core.ts` → 0 hit
  trong đường quyết định

## Risk

**Đây là phase đụng đường đang sống.** `check()` chưa từng chạy trên traffic thật, và nó giờ sẽ
chặn. Khách đang dùng vượt hạn mức (do lỗi trước đó) sẽ bị chặn ngay khi deploy. Đó là mục tiêu,
nhưng cần thông báo trước.

## Rollback

Revert hai file middleware + service. Không có thay đổi schema trong phase này.
