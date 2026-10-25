## Outcome

Biến lớp monetization open-core của repo từ kiến trúc tuyên bố thành hệ thống có thể bán: **một**
nguồn durable quyết định cả việc cho phép lẫn việc tính tiền, một bộ tier, một đơn vị MCU có định
nghĩa, một nhãn license nói đúng, leaderboard công khai tái tạo được từ artifact chạy thật, và cả
hai kênh thu tiền (SaaS hosted + marketplace) nối về cùng một entitlement.

## How It Works

- Cổng hạn mức hiện **không chặn được ai**: bảng `usage_metrics` không được migration nào tạo
  (đã tra 106 file), `recordCall` INSERT vào bảng không tồn tại bị `catch` + `logger.warn` nuốt,
  `getPeriodUsage` trả `0` khi lỗi — nên `check()` luôn thấy `periodUsed = 0` và luôn
  `allowed: true`.
- Không có ai gọi `check()`: middleware chỉ `recordCall` **sau** khi response xong, còn
  `checkUsage`/`getUsageSnapshot` (`subscription-service-d1.ts:117,127`) không có một caller nào.
  Quyết định "có cho phép" hiện không tồn tại trên đường request.
- Repo có **năm** meter song song (`BillingMeter` Map trong RAM, `signals-api/…core.ts` Postgres,
  hai `EventEmitter` ở `platform/metering` + `platform/billing`, và bảng `license_usage_daily`)
  dưới **ba** bộ tên tier không giao nhau, nên một khách không phải một thực thể ở hai chỗ.

## Architecture / Flow

```mermaid
flowchart TD
    subgraph BEFORE["Trước — năm meter, cổng cho qua tự do"]
        direction TB
        Q1["5 meter song song<br/>3 bộ tên tier"]
        Q2["check() không ai gọi<br/>bảng usage_metrics không tồn tại"]
        Q3["docs công khai nói Sharpe 3.82<br/>CSV thật: 87 lệnh, 22/30 chiến lược 0 lệnh"]
        Q4["license-gate mang SPDX MIT<br/>trong nhánh bảng gọi là MIT"]
    end

    subgraph AFTER["Sau — một meter, một quota thật"]
        direction TB
        R1["nowpayments webhook<br/>order_id: sig_ / mp_ / license"]
        R2["tier đọc từ PRICING_TIERS"]
        R3["UsageMeteringService duy nhất"]
        R4[("Postgres usage_metrics<br/>UNIQUE subscriber_id + period")]
        R5["429 khi quá hạn mức<br/>503 khi DB lỗi"]
        R6["docs/backtest-leaderboard.md<br/>sinh từ CSV"]
        R7["COMMERCIAL-LICENSE.md<br/>nêu đúng thư mục gate"]

        R1 --> R2 --> R3 --> R4
        R3 --> R5
        R4 --> R6
        R3 --> R7
    end

    BEFORE -->|"9 phase"| AFTER

    style BEFORE fill:#2a1414,stroke:#7a1f1f,color:#f5e8e8
    style AFTER fill:#0f2a1f,stroke:#1f7a4d,color:#e8f5ee
```

## Implementation metadata

- **Branch:** `feat/opencore-monetization-real`
- **Plan:** `plans/261024-1142-opencore-monetization-real/plan.md`
- **Mode:** official (stable)
- **Route:** feature (via `/ak:cook`)
- **PR:** (điền sau khi ship)

## Acceptance Criteria

- [ ] `grep -rln "class UsageMeteringService\|class BillingMeter" src` → đúng 1
- [ ] Migration tạo bảng `usage_metrics` với đúng bộ cột code đang đọc, có test chứng minh
- [ ] Test chứng minh subscriber quá hạn mức bị từ chối, và số chặn = số `remaining`
- [ ] `grep -rn "BASIC\|PREMIUM"` trong gate + limits → 0
- [ ] `docs/mcu-definition.md` tồn tại; `TIER_QUOTAS` map vào định nghĩa viết
- [ ] `node scripts/generate-leaderboard.mjs && git diff --exit-code docs/backtest-leaderboard.md` → exit 0
- [ ] `grep -rn "getTierPrice" src` có call site trong handler; không còn import chết
- [ ] `COMMERCIAL-LICENSE.md` tồn tại; SPDX MIT bỏ khỏi file gate; git history không đổi
- [ ] `npx tsc --noEmit` 0 error; `npx eslint` file đã sửa sạch; `npm test` xanh; 71 probe pass

## Pipeline State

- [x] worktree + branch
- [x] investigate (đã kiểm chứng trong procedure `/ak:advise` trước đó + red-team plan)
- [x] plan (validate OK; red-team đã vá 3 lỗ hổng)
- [ ] issue + label `ready to cook`
- [ ] cook (9 phase)
- [ ] code review
- [ ] test
- [ ] docs
- [ ] ship PR
- [ ] review/fix/reply PR
- [ ] merge + watch CI
