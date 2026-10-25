# Phase 3 — Hợp nhất 5 meter về 1, rewire consumer

## Goal

Repo có **năm** meter và hai trong số đó có consumer đang sống. Phase này giữ đúng một
(`signals-api/usage-metering-service-core.ts`), rewire các consumer đang sống sang nó, rồi xoá
bốn cái còn lại. Thứ tự là **rewire trước, xoá sau**.

## Files (ownership: phase này)

READ first:
- `src/platform/signals-api/usage-metering-service-core.ts` (canonical sau phase 1+2)
- `src/platform/metering/usage-metering-service.ts` (EventEmitter)
- `src/platform/billing/usage-metering.ts` (EventEmitter)
- `src/platform/metering/usage-metering-persistence.ts`
- `src/platform/metering/usage-metering-types.ts`
- `src/desk/opencoresaas2026monetization/billing-meter.ts`
- `src/billing/billing-meter.ts` (facade re-export)
- tất cả consumer đang sống: `threshold-alerts.ts`, `revenue-handlers.ts`,
  `usage-tracking-*.ts`, `subscription-service-d1.ts`, `internal-billing-routes.ts`,
  `signal-subscription-self-service-handlers.ts`
- test đang ghim hành vi: `platform/metering/usage-metering-core.test.ts` (14),
  `usage-metering-limits.test.ts` (7), `billing/__tests__/usage-metering-analytics.test.ts` (9),
  `usage-metering-sync.test.ts` (4), `usage-metering-tracking.test.ts` (8)

MODIFY:
- `src/platform/middleware/threshold-alerts.ts`
- `src/platform/api/routes/revenue-handlers.ts`
- `src/billing/billing-meter.ts`

DELETE (chỉ sau khi grep không còn importer):
- `src/platform/metering/usage-metering-service.ts`
- `src/platform/billing/usage-metering.ts`
- `src/platform/metering/usage-metering-persistence.ts`
- `src/desk/opencoresaas2026monetization/billing-meter.ts`

DO NOT TOUCH:
- `src/platform/signals-api/**` (đã xong ở phase 1+2)
- `src/platform/api/routes/open-core-routes.ts` (phase 5)

## Steps

1. Đếm và ghi lại mọi importer của năm class, bằng grep, trước khi xoá bất cứ thứ gì.
2. **Xây seam ở canonical trước** (red-team đã kiểm chứng thiếu cả hai):
   - canonical dùng `export const usageMetering = new UsageMeteringService()` và **không có**
     `getInstance()`; cả hai consumer live gọi `UsageMeteringService.getInstance()`. Thêm
     `static getInstance()` ở canonical (trả singleton đã có) — đây là seam tối thiểu, không phải
     abstraction mới.
   - canonical **không có** `getRevenueSummary(period)` (`revenue-handlers.ts:13,79` gọi ở hai
     chỗ). Thêm phương thức đó, đọc từ cùng bảng durable, để một store phục vụ cả quota lẫn MRR.
   - canonical **không phải EventEmitter**, nên `threshold-alerts.ts` sẽ mất luồng sự kiện.
     Nếu cảnh báo ngưỡng chỉ đọc snapshot thì rewire sang `getSnapshot`; nếu nó cần sự kiện,
     thêm một emit tối thiểu ở chỗ `recordCall` thay vì để nó giữ class riêng.
3. Rewire `threshold-alerts.ts:8` và `revenue-handlers.ts:2` sang service canonical.
4. **`usage-metering-persistence.ts` KHÔNG xoá được trước lúc rewire xong**: nó có consumer sống
   (`platform/metering/usage-metering-service.ts:15` import, `:18` re-export, `:57` gọi), và một
   test đang ghim hành vi đó (`platform/metering/usage-metering-core.test.ts:130`). Trình tự đúng
   là rewire `usage-metering-service.ts` trước, rồi mới chạm tới file persistence.
5. `billing/billing-meter.ts` là facade 15 LOC re-export `BillingMeter` + `TIER_QUOTAS`.
   Chuyển nó re-export từ service canonical để không phá import hiện có.
6. `step-gate-probes.ts` dùng `checkQuota(tenant, 'BASIC', 1)` — cập nhật sang tier canonical và
   API mới (không xoá probe; đó là bằng chứng behavior của step 12/13).
7. `stitch-ui-cockpit.ts:49` cũng gọi `checkQuota` — rewire theo.
8. Xoá bốn class/phần còn lại khi `grep` không còn importer nào ngoài test.
9. Cập nhật năm test file đang ghim hành vi sang ngữ nghĩa một store — **giữ tên test, đổi
   assertion**. Không được xoá test cho gọn. Bốn file metering (14/7/9/4/8 test) và
   `usage-metering-service.test.ts` đều nằm trong diện này.

## Validation

- `grep -rln "class UsageMeteringService\|class BillingMeter" src` → đúng 1
- `grep -rn "InMemoryCounter" src` → chỉ còn ở định nghĩa (nếu còn), không ở đường quyết định
- `npx tsc --noEmit` → 0 error
- `npx vitest run src/platform/metering src/platform/billing/__tests__` → pass
- `npx vitest run src/desk/opencoresaas2026monetization/__tests__` → 71 pass

## Status

Đã kiểm chứng tại thời điểm hoàn thành phase:

- Gate `grep -rln "class ..."` trả **2**, không phải 1: còn lại đúng canonical core và
  `desk/billing-meter.ts`. Cái thứ hai **không xoá được ở phase này** — người dùng cuối của nó là
  `open-core-routes.ts:24,98,107`, mà file đó thuộc phase 5 (`DO NOT TOUCH` ở trên). Đó là điều
  kiện tiên quyết của chính step 8 ("xoá khi grep không còn importer") chưa được đáp ứng, nên việc
  xoá được dời sang phase 5 thay vì phá phase 5 trước.
- Gate `InMemoryCounter` đạt: định nghĩa đã bị xoá (`signals-api/usage-metering-counter.ts`,
  0 importer). Chỗ duy nhất còn nhắc tên là một comment giải thích trong
  `usage-metering-durable-gate.test.ts`, không nằm trên đường quyết định.
- `npx tsc --noEmit` → exit 0.
- `npx vitest run src/platform/billing/__tests__ src/platform/signals-api/__tests__
  src/desk/opencoresaas2026monetization/__tests__ src/platform/middleware/__tests__`
  → 37 file / 272 test pass.

Hai lệch so với danh sách DELETE gốc, cả hai đều do bằng chứng chứ không do lựa chọn:

1. **Xoá thêm 6 file chết** so với kế hoạch: `platform/metering/usage-metering-service.ts`,
   `platform/billing/usage-metering.ts`, `platform/metering/usage-metering-persistence.ts`,
   `platform/middleware/usage-tracking-middleware.ts` (plugin không bao giờ được register),
   `platform/billing/overage-calculator{,-helpers}.ts` (0 importer), và
   `src/billing/billing-meter.ts` (facade, 0 importer). Bốn file đầu là những meter bóng mà phase
   này sinh ra để xoá; hai file sau là importer chết của chúng, không giữ được phần này nếu xoá
   phần kia. `src/billing/billing-meter.ts` cũng không "re-point" sang canonical như step 5 đề
   xuất: facade đó `export` `QuotaCheckResult`/`TIER_QUOTAS`, hai thứ canonical không định nghĩa,
   và nó không có một importer nào nên cũng không có contract nào cần giữ.
2. **Không xoá `src/platform/billing/usage-metering-{analytics,keys,status,sync,tracking,types}.ts`**:
   đây là một sub-system **backed by Redis** (không phải class, là pure function over
   `RedisClientType`), hoàn toàn không có importer ngoài test. Nó là *store thứ sáu* đúng theo tinh
   thần phase này, nhưng 3 test file của nó nằm trong include pattern của vitest và đang chạy
   (21 test), nên việc xoá thuộc về quyết định của user: xoá luôn 21 test, hay rewire sub-system đó
   lên `usage_metrics`. Câu hỏi được để lại ở cuối file này.

Phase 3 cũng tạo ra **domain thứ ba của meter** trên cùng một hàng `usage_metrics`: MCU
(`usage-metering-mcu-domain.ts`), cùng migration `059-add-usage-metrics-mcu-units.ts`. Đây là kết
quả của quyết định đã ghi lại "gộp đủ 3 domain vào một meter": canonical học thêm domain MCU thay
vì để meter ở desk giữ counter in-process của nó. Canonical được tách thành 5 module domain
(MCU / call / trade / reporting / queries) vì trần 200 LOC: `usage-metering-service-core.ts` từ
467 LOC xuống còn 303 LOC, mỗi module domain 135–157 LOC.

Một lỗi fail-open cũng được sửa khi tách: `recordTrade` và ba nhánh `?? 1_000`/`?? 100` trong core
đều trả một allowance ngầm khi upsert không trả hàng hoặc khi tier vắng mặt trong price book;
giờ chúng ném lỗi, và fallback đọc tên hằng (`MONTHLY_LIMITS.FREE`) thay vì số ma thuộc.

## Risk

Bốn trong năm meter có importer đang sống. Xoá trước khi rewire sẽ làm vỡ build. Thứ tự bắt buộc.

## Rollback

Giữ nguyên bốn file đã xoá trong git (`git revert` của commit xoá). Rewire là additive nên có
thể hoàn nguyên từng consumer.

## Unresolved questions

1. `src/platform/billing/usage-metering-{analytics,keys,status,sync,tracking,types}.ts` — store
   thứ sáu, backed by Redis, 0 importer ngoài 3 test file đang chạy (21 test). Xoá hẳn kèm 21
   test, hay rewire lên `usage_metrics`?
2. Gate "đúng 1" của phase này chỉ đạt được 2. Chấp nhận 2 cho tới khi phase 5 rewire
   `open-core-routes.ts` (khi đó `desk/billing-meter.ts` + `TIER_QUOTAS` mới xoá được), hay đẩy
   phase 5 lên trước?
3. `src/desk/opencoresaas2026monetization/billing-meter.ts` vẫn giữ `TIER_QUOTAS`
   (BASIC 1,000 / PREMIUM 25,000 / ENTERPRISE 250,000 / MASTER 1,000,000) và tier vocab
   `BASIC/PREMIUM`, lệch với `MCU_LIMITS` canonical. Phase 4 giải quyết; cần xác nhận MCU của
   BASIC cuối cùng là 1,000 (như `TIER_QUOTAS`) hay 10,000 (như `MONTHLY_LIMITS` FREE).
