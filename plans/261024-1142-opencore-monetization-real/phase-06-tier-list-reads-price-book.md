# Phase 6 — `handleGetTiers` đọc từ price book

## Goal

`handleGetTiers` (`subscriptions-handlers.ts:137`) dựng cả bảng giá năm tier bằng literal
(0 / 4900 / 9900 / 29900 / 99900) trong khi cùng file **import `getTierPrice` ở dòng 8 và không
bao giờ gọi**. Đường checkout thì đã derive từ `PRICING_TIERS`. Hai nguồn chỉ khớp nhau vì ai đó
đánh máy cùng một con số hai lần. Chuyển handler sang đọc nguồn canonical.

## Files (ownership: phase này)

READ first:
- `src/platform/subscriptions*/**/subscriptions-handlers.ts` (tìm đường dẫn chính xác)
- `src/platform/billing/pricing-tiers.ts`
- `src/platform/subscriptions*/**/subscriptions-checkout.ts` (mẫu cách `getTierPrice` được dùng đúng)

MODIFY:
- `src/platform/api/routes/subscriptions-handlers.ts` (đường dẫn để xác nhận khi thi hành)

## Steps

1. Xác nhận đường dẫn file thật (repo có thể có bản sao `src/platform/…` và `src/…`).
2. Cho handler lấy mọi `amount_cents` qua `getTierPrice(tier)`.
3. Derive `label` từ tên và giá trong `PRICING_TIERS` thay vì chuỗi đánh máy, để một lần sửa giá
   không để lại nhãn "Pro — $99/mo" trên bản ghi `price: 149`.
4. `features` là copy trình bày, được giữ — nhưng phải đến từ `PRICING_TIERS[tier].features`
   nếu nguồn đó đã có, chứ không nên là literal thứ hai.
5. **Giữ nguyên shape JSON trả về** (`{ tiers: [...] }`, cùng tên field) — chỉ nguồn dữ liệu đổi.
6. Test: cho mỗi tier, giá hiển thị === `PRICING_TIERS[tier].price`. Năm tier.

## Validation

- `grep -rn "getTierPrice" src` → có ≥1 call site trong handler
- `npx eslint src/platform/api/routes/subscriptions-handlers.ts` → 0 warning
- `grep -n "9900\|29900\|99900" src/platform/api/routes/subscriptions-handlers.ts` → 0 hit
- `npx vitest run` cho suite tiền/thuê bao → pass
- Test giá-hiển-thị === price-book cho cả 5 tier → pass

## Risk

Thấp. Giá hiện đã khớp (`PRICING` 0/4900/9900/29900/99900 vs price book), nên đây là đồng bộ cơ
học. Rủi ro duy nhất là lộn `STARTER`/`PRO` khi map — test sẽ bắt.

## Rollback

Revert một file.
