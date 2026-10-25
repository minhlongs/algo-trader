# Phase 8 — Nối cả hai kênh thu tiền vào một meter + một entitlement

## Goal

Cả hai kênh founder đã chọn đều **đã có rail tiền thật**:
- `src/platform/api/routes/webhooks/nowpayments-webhook.ts` (mount `server-routes-core.ts:94`)
  xác minh HMAC-SHA512 và phân luồng theo tiền tố `order_id`: `sig_` → signals, `mp_` →
  marketplace, còn lại → license.
- `subscription-subscribe-handler.ts:50` gọi `createMarketplaceCheckoutUrl`.
- `nowpayments-marketplace.ts` tạo payout thật cho ví người bán.
- `revenue.types.ts:3-4` — nền tảng 20% / người tạo 80%; `revenue-calculator.ts:18` tính.

Nên phase này là **nối dây**, không phải xây billing: cho rail hiện có đọc tier từ price book
và ghi vào cùng một meter.

## Files (ownership: phase này)

READ first:
- `src/platform/api/routes/webhooks/nowpayments-webhook.ts`
- `src/platform/marketplace/services/subscription-subscribe-handler.ts`
- `src/platform/billing/nowpayments-marketplace.ts`
- `src/platform/marketplace/services/revenue.types.ts`
- `src/platform/marketplace/services/revenue-calculator.ts`
- `src/billing/ipn-webhook.ts` (bản song song — chỉ đọc để quyết định xử lý)

MODIFY:
- `src/platform/api/routes/webhooks/nowpayments-webhook.ts`
- `src/platform/marketplace/services/subscription-subscribe-handler.ts`

CREATE:
- `src/platform/billing/__tests__/monetization-e2e.test.ts` (đặt tên không chứa id plan)

DO NOT TOUCH:
- `src/platform/signals-api/**` (phase 1+2)
- `src/platform/metering/**`, `src/platform/billing/usage-metering.ts` (phase 3)

## Steps

1. Xác nhận tier được ghi vào subscription **đọc từ `PRICING_TIERS`**, không phải một tên tier
   do client đặt trong payload thanh toán. Nếu webhook đang tin payload → đây là lỗi thu tiền,
   phải chặn.
2. Idempotency: xác nhận một `payment_id` chỉ kích hoạt một lần. Nếu dùng
   `InMemorySubscriptionStore` (của `ipn-webhook.ts`) thì đó là lỗ hổng — process restart sẽ
   cho phép kích hoạt lại. Điều hướng sang store durable (`usage_metrics`/subscription table).
3. Test end-to-end hosted: checkout → subscription ghi tier → gọi API quá hạn mức → 429 với
   `used === limit`, cả hai đọc cùng một hàng.
4. Test end-to-end marketplace: subscribe marketplace → `mp_` flow kích hoạt → một lần payout tính
   đúng 80/20; giá đọc từ price book, không literal.
5. Không đổi shape response `/api/v1/marketplace/*` — chỉ thêm field nếu cần.

## Validation

- `npx tsc --noEmit` → 0 error
- `npx vitest run src/platform/billing/__tests__/monetization-e2e.test.ts` → pass
- Test chứng minh một `payment_id` trùng không kích hoạt tier hai lần
- Test chứng minh giá/kích hoạt tier đến từ `PRICING_TIERS`, không phải payload client

## Risk

Test đi tiền thật — đừng trỏ vào NOWPayments production. Dùng secret test và endpoint sandbox,
hoặc mock ở tầng HTTP (`fetch`) chứ không mock meter (vì meter chính là thứ đang kiểm chứng).
Kênh marketplace hiện chưa có production caller nối tới đường thu — đó là phát hiện của advice,
phase này xác nhận hoặc đảo ngược nó.

## Rollback

Revert hai file routed. Test lặp lại được.
