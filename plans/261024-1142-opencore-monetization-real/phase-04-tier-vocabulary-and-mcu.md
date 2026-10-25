# Phase 4 — Một bộ tier + MCU có định nghĩa

> **Quyết định phạm vi (đã chốt)**: hai bộ tier là **hai contract khác nhau**, không ép
> ánh xạ 1:1. Bộ canonical `FREE|STARTER|PRO|ENTERPRISE|MASTER` tính **API calls** (đọc
> `pricing-tiers.ts`); bộ desk `BASIC|PREMIUM|ENTERPRISE|MASTER` tính **MCU** (đọc
> `billing-meter.ts`). Chúng lệch cả về số lượng tier lẫn về ý nghĩa đơn vị, và BASIC có hai
> số xung đột (1.000 MCU trong `TIER_QUOTAS` so với 10.000 API calls của FREE) — nên không có
> phép map trung thực. Việc đổi `TierLevel` sẽ kéo theo 20 giá trị `minTier`, `TIER_QUOTAS`
> và `z.enum` public của `/verify-license`; **đổi contract public là quyết định của user**, nên
> phase này tách bạch ranh giới chứ không thay thế.

> **Bước 1–2 của kế hoạch gốc đã xong trước phase này**: `MONTHLY_LIMITS`,
> `DAILY_LIMITS`, `OVERAGE_PRICES` giờ phủ đủ 5 tier canonical (`STARTER` 5.000,
> `MASTER` -1), và `check`/`computeOverage` đã xử lý `-1` là "không giới hạn".

## Goal

Repo dùng **ba bộ tên tier** không giao nhau: gate `BASIC|PREMIUM|ENTERPRISE|MASTER`
(`license-gate.ts:29-34`, mà `BASIC`/`PREMIUM` không có trong price book nào), limits
`FREE|PRO|ENTERPRISE` (`usage-metering-types.ts`), và canonical đang chạy `TierLabel =
FREE|STARTER|PRO|ENTERPRISE|MASTER` (`signal-subscription-service.ts:32`, khớp price book
`pricing-tiers.ts`). Chọn bộ canonical, và cho đơn vị MCU một định nghĩa viết.

## Files (ownership: phase này)

READ first:
- `src/platform/signals-api/signal-subscription-service.ts`
- `src/platform/signals-api/usage-metering-types.ts`
- `src/platform/billing/pricing-tiers.ts`
- `src/desk/opencoresaas2026monetization/license-gate.ts`
- `src/desk/opencoresaas2026monetization/step-gate-probes.ts`

MODIFY:
- `src/platform/signals-api/usage-metering-types.ts` — `MONTHLY_LIMITS`, `DAILY_LIMITS`,
  `OVERAGE_PRICES` phủ đủ 5 tier canonical. `MASTER` dùng `-1` cho unlimited (theo
  `TIER_RATE_LIMITS`), và code phải xử lý `-1` là "không giới hạn" chứ không phải "hạn mức âm".
- `src/desk/opencoresaas2026monetization/license-gate.ts` — bỏ `BASIC`/`PREMIUM` khỏi
  `TIER_HIERARCHY`, thay bằng bộ canonical. Giữ nguyên `isKnownTier` và toàn bộ logic fail-closed.
- `src/desk/opencoresaas2026monetization/step-gate-probes.ts` — dùng tier canonical.

CREATE:
- `docs/mcu-definition.md` — định nghĩa chính thức: 1 MCU bằng thao tác nào.

## Steps

1. ~~Thêm `STARTER` và `MASTER` vào `MONTHLY_LIMITS` / `DAILY_LIMITS` / `OVERAGE_PRICES`~~ —
   đã xong trước phase này.
2. ~~Xử lý `MASTER = -1` tường minh ở chỗ đọc hạn mức~~ — đã xong (`isUnlimited` được gọi
   *trước* khi so sánh, và trong `computeOverage`/`computeMcuOverage`).
3. **Thay cho việc đổi `TIER_HIERARCHY`**: tách bạch ranh giới hai contract thay vì ép map 1:1.
   `allowanceFor()` trong `usage-metering-types.ts` từ chối mọi tier price book không khai báo,
   thay vì âm thầm rơi về allowance FREE. Sáu chỗ đọc hạn mức chuyển sang nó
   (`callLimitFor`, `mcuLimitFor`, `recordTrade`, `check`, `computeOverage`, `getQuotaAllocation`,
   `getTierLimits`). Đây là bug thật, không phải dọn sạch: một khách `PREMIUM` (25.000 MCU đã
   mua) đang bị đo bằng allowance FREE 1.000 — vừa under-serve vừa under-bill.
4. Viết `docs/mcu-definition.md`: bảng thao tác → chi phí MCU, phân biệt rõ thứ **đang** được
   thực thi với thứ còn là đề xuất. Tier nào không khai báo thì từ chối, không đo bằng FREE.
5. ~~`TIER_QUOTAS` map sang MCU/tháng~~ — **không làm**, theo quyết định user ở `## Decision`.
   `TIER_QUOTAS` (desk, MCU) và `TIER_ENTITLEMENTS` (`src/billing/tier-activation-types.ts`,
   API calls) là hai bảng cùng một bộ tên desk nhưng **khác số**; gộp chúng là quyết định giá,
   không phải refactor.
6. Test: `usage-metering-tier-boundary.test.ts` pin ranh giới theo cả hai hướng — tier chỉ thuộc
   desk bị từ chối, mọi tier canonical vẫn resolve (6 test).

## Validation

- `npx tsc --noEmit` → exit 0
- `npx vitest run src/platform/signals-api/__tests__ src/platform/billing/__tests__
  src/platform/middleware/__tests__` → 29 file / 210 test pass
- `npx vitest run src/desk/opencoresaas2026monetization/__tests__` → 9 file / 68 test pass
- `docs/mcu-definition.md` tồn tại, có bảng thao tác → chi phí, và nêu rõ phần chưa nối dây
- `grep -c "STARTER\|MASTER" src/platform/signals-api/usage-metering-types.ts` → có (12)
- Gate cũ của phase (`BASIC|PREMIUM` về 0 trong `license-gate.ts`) **không đạt và cố ý không
  đạt**: xem `## Decision`. Gate đó giả định hướng "thay thế toàn bộ" mà user đã không chọn.

## Risk

`licenseCheck` là public behavior của `/verify-license`. Bỏ `BASIC`/`PREMIUM` có nghĩa là một
token cũ đặt hai tier đó sẽ nhận 401 "unknown tier" thay vì được chấp nhận. Vì hai tier đó không
mua được ở bất kỳ price book nào, không có khách thật dùng chúng — nhưng đây là hành vi quan sát
được, cần ghi trong PR.

## Rollback

Revert hai file; `docs/mcu-definition.md` chỉ là tài liệu nên xoá riêng được.

## Status

**Đã kiểm chứng** (tsc exit 0; test chạy lại trong session này):

- `MONTHLY_LIMITS`/`DAILY_LIMITS`/`OVERAGE_PRICES` phủ đủ 5 tier canonical, `MASTER: -1` được
  xử lý là unlimited **trước** khi so sánh.
- `src/platform/signals-api/__tests__/usage-metering-tier-boundary.test.ts` (mới, 6 test): tier chỉ
  thuộc desk (`BASIC`, `PREMIUM`) bị từ chối trên cả hai đường quyết định; mọi tier canonical vẫn
  resolve; `recordMcu` với tier lạ không ghi gì vào row.
- `allowanceFor()` thay bảy chỗ đọc hạn mức (`callLimitFor`, `mcuLimitFor`, `recordTrade`, `check`,
  `computeOverage`, `getQuotaAllocation`, `getTierLimits`) — mỗi chỗ trước đây đều rơi về
  `?? MONTHLY_LIMITS.FREE`.
- `docs/mcu-definition.md` (mới): bảng thao tác → chi phí MCU, phân biệt rõ enforced vs proposed.
- 29 file / 210 test (signals-api + billing + middleware) pass; 9 file / 68 test (monetization)
  pass.

**Phát hiện thêm — chưa xử lý, cần user quyết:**

1. **Hai bảng desk cùng bộ tên nhưng khác số.** `desk/.../billing-meter.ts:18` (`TIER_QUOTAS`,
   đơn vị MCU: BASIC 1.000 / PREMIUM 25.000) và `src/billing/tier-activation-types.ts:40`
   (`TIER_ENTITLEMENTS`, đơn vị API calls: BASIC 10.000 / PREMIUM 50.000). Cả hai đều là
   "entitlements" theo bộ `BASIC|PREMIUM|ENTERPRISE|MASTER`. **Tôi tin** đây là hai contract khác
   nhau chứ không phải một bug lệch số: `apiCallsPerMonth` trong `TIER_ENTITLEMENTS` chỉ được đọc
   bởi một probe, không hành xử trên đường request nào; chỉ `strategyQuota` là bị ép khi kích
   hoạt (`tier-activation-gateway.ts:84,95,108`). Nhưng việc chọn bảng nào thắng là quyết định giá.
2. **`recordMcu` chưa có production caller.** Chỉ test gọi nó. Nghĩa là store bền vững đang bảo vệ
   một quyết định mà chưa có request thật nào tăng số lên. `/verify-license`
   (`open-core-routes.ts:98,107` — route **có** được mount tại `server.ts:93`) vẫn kiểm tra và ghi
   vào counter in-process của `BillingMeter`, tức counter reset mỗi lần restart. Nối `recordMcu`
   vào đường request là thay đổi có hệ quả billing thật, nên tôi ghi lại chứ không tự làm.
3. **Cockpit dùng tier sai contract** nhưng route không được mount. `stitch-cockpit-schemas.ts:11`
   nhận `tier` từ **query param** (`z.enum(['BASIC','PREMIUM',…])`), rồi
   `stitch-ui-cockpit.ts:61` đưa nó vào `checkMcu` — vốn đọc price book canonical. Trước bản sửa
   hôm nay, khách `PREMIUM` sẽ bị đo bằng allowance FREE. Không có `app.use` nào mount
   `stitchCockpitRouter`, nên đây là code chết chứ không phải lỗ hổ live; bản sửa ở meter đã chặn
   tình huống này cho mọi đường đi, kể cả khi cockpit sau này được mount.
