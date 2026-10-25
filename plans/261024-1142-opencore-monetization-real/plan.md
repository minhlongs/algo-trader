---
title: "Open-core monetization làm thật — một meter, một bộ tier, quota thật sự chặn"
description: "Thi hành 8 requirement từ advice-261024-1117: hợp nhất 5 meter về một nguồn durable, tạo migration usage_metrics còn thiếu, nối check() vào đường request, thống nhất tier, định nghĩa MCU, sinh leaderboard từ CSV, đổi nhãn license cho đúng."
status: in-progress
created: "2026-10-24T11:42:00.000Z"
source: "advise-261024-1117-opencore-monetization-advice.md"
branch: feat/opencore-monetization-real
authorization: "User chose all 8 requirements from /ak:advise (Vietnamese interview, confirmed 'Đúng, đi tiếp'), then invoked /ak:vibe to execute them"
route: feature
---

# Open-core monetization làm thật

## Outcome

Lớp monetization open-core hiện là một kiến trúc *tuyên bố* chạy song song với sản phẩm trả tiền
đang hoạt động. Mục tiêu của kế hoạch này là biến nó thành hệ thống có thể bán: **một** nguồn
durable quyết định cả việc cho phép lẫn việc tính tiền, một bộ tier, một đơn vị MCU có định nghĩa,
một nhãn license nói đúng, và leaderboard công khai tái tạo được từ artifact thật.

Bốn phát hiện đã kiểm chứng làm thay đổi thứ tự ưu tiên so với bản advice gốc:

1. **Bảng `usage_metrics` không được migration nào tạo** (tra 106 file migration). `recordCall`
   INSERT vào bảng không tồn tại → lỗi bị `catch` + `logger.warn` nuốt mất; `getPeriodUsage`
   trả `0` khi lỗi. Vì vậy `check()` luôn thấy `periodUsed = 0` và luôn trả `allowed: true`.
2. **Không ai gọi `check()`.** Middleware chỉ `recordCall` sau response; `checkUsage` và
   `getUsageSnapshot` (`subscription-service-d1.ts:117,127`) không có một caller nào.
3. **`remaining` tính từ `InMemoryCounter` không bao giờ được reset** (`reset` không có caller),
   nên nó chỉ giảm dần cho tới khi process khởi động lại.
4. **npm chưa từng publish** (`@mekong/algo-trader` → 404). MIT grant chỉ lọt qua GitHub công khai.

## Requirements

1. (R1) `docs/backtest-leaderboard.md` sinh từ `reports/backtest-results.csv`, hiện sample size,
   không chứa số nào CSV không hỗ trợ; CI guard fail khi doc lệch CSV.
2. (R2) `handleGetTiers` lấy mọi giá từ `PRICING_TIERS` qua `getTierPrice`; hết import chết.
3. (R3) Một meter: số chặn và số tính tiền đọc cùng một hàng `usage_metrics`; đường allow/deny
   không còn đọc `InMemoryCounter`; migration tạo bảng được viết; lỗi durable fail-closed 503 +
   cảnh báo (quyết định founder).
4. (R4) `FREE | STARTER | PRO | ENTERPRISE | MASTER` (đúng bộ `TierLabel` đã dùng ở production)
   là bộ duy nhất; `BASIC`/`PREMIUM` biến mất khỏi gate và limits; tên tier đối ngoại không đổi.
5. (R5) MCU có định nghĩa viết; `requestedMcu` không còn là input từ client; `TIER_QUOTAS`
   map vào định nghĩa.
6. (R6) License thứ hai nêu rõ thư mục entitlement gate là proprietary; SPDX MIT bỏ khỏi các file
   đó; grant đã phát hành được ghi nhận; git history không đổi.
7. (R7) Verdict 25 bước vẫn behavior-verified, không hồi qui về `fs.existsSync`.
8. (R8) Hosted và marketplace đều có đường thu tiền được wiring và test end-to-end, giá đọc từ
   price book.

## Constraints

- Không phá public contract: `OpenCoreReadinessAuditor.audit`, shape `/api/v1/open-core/*`,
  route platform API giữ nguyên (chỉ **thêm** field, hoặc đặt sau version nếu phải đổi).
- Mỗi file đã sửa ≤ 200 LOC.
- 0 `: any`; không `console.log` ở production code; không dữ liệu/mocks giả để qua check.
- Không hardcode secret; secret chỉ qua env var.
- Không sửa git history, không force-push, không tuyên bố rút grant MIT đã phát hành.
- Không đổi giá public (`MASTER` $999, 28 ghế enterprise).
- Không làm lại `plans/261021-2315-opencore-honest-verification` (đã `completed`).
- Test chạy từ gốc worktree (`vitest.config.ts` có alias `/src/*`).
- Khi DB đọc lỗi → **503 + cảnh báo** (quyết định founder, binding).

## Non-goals

- Không di chuyển `src/desk/opencoresaas2026monetization/` (relabel, không `git mv`).
- Không deploy, không đổi payment provider, không SOC 2.
- Không viết lại README marketing.
- Không đổi tên tier đối ngoại với khách.
- Không sửa lại `Master — $999/mo` (commit `eb07d8e2` đã xong).

## Phases

| Phase | Nội dung | File chính |
|---|---|---|
| 1 | Migration `usage_metrics` + làm cho đường metering bền vững | `src/shared/db/migrations/052-*.ts`, `usage-metering-service-core.ts` |
| 2 | Nối `check()` vào đường request; bỏ `InMemoryCounter` khỏi quyết định | `usage-tracking-middleware.ts`, `usage-metering-service-core.ts` |
| 3 | Hợp nhất 5 meter về 1; rewire consumer EventEmitter | `billing-meter.ts`, `usage-metering-service.ts` (×2), `usage-metering-persistence.ts` |
| 4 | Thống nhất tier + định nghĩa MCU | `usage-metering-types.ts`, `license-gate.ts`, `docs/mcu-definition.md` |
| 5 | Leaderboard sinh từ CSV + CI guard | `leaderboard-builder.ts` (sử dụng lại), `scripts/`, `docs/backtest-leaderboard.md` |
| 6 | `handleGetTiers` derive từ `getTierPrice` | `subscriptions-handlers.ts` |
| 7 | Relabel license | `COMMERCIAL-LICENSE.md`, `CONTRIBUTING.md`, 43 SPDX headers |
| 8 | Wiring + test E2E hai kênh | `nowpayments-webhook.ts`, `subscription-subscribe-handler.ts` |
| 9 | Cổng chất lượng + docs | toàn repo |

## Acceptance criteria

1. `grep -rln "class UsageMeteringService\|class BillingMeter" src` → đúng 1.
2. Test chứng minh migration tạo được bảng `usage_metrics` với đúng bộ cột code đọc.
3. Test chứng minh một subscriber quá hạn mức bị từ chối, và con số chặn = con số `remaining`.
4. `grep -rn "BASIC\|PREMIUM"` trong gate + limits → 0.
5. `docs/mcu-definition.md` tồn tại; `TIER_QUOTAS` map vào nó.
6. `node scripts/generate-leaderboard.mjs && git diff --exit-code docs/backtest-leaderboard.md` → exit 0.
7. `grep -rn "getTierPrice" src` có call site trong handler; không còn import chết.
8. `COMMERCIAL-LICENSE.md` tồn tại và nêu tên thư mục gate; `grep -rl "SPDX-License-Identifier: MIT" src/desk/opencoresaas2026monetization` → 0.
9. `npx tsc --noEmit` 0 error; `npx eslint` trên file đã sửa sạch; `npm test` xanh; 71 probe test monetization còn pass.

## Definition of done

Nhánh `feat/opencore-monetization-real` có PR, test xanh, typecheck sạch, và mọi số trên tài liệu
công khai truy được về `reports/backtest-results.csv`.
