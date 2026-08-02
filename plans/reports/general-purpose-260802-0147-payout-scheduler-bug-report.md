# Marketplace Payout Scheduler — Bug Report

## Summary

Three test failures caused by a severely under-implemented worker processor. The loop in `marketplace-payout-scheduler.ts:79-96` only fetches a revenue record and immediately marks it paid. It is missing the entire strategy lookup → address validation → USDT payout → conditional mark-as-paid flow that the tests (and test fixtures) expect.

## Exact Bug Lines

**File:** `/Users/macbook/algo-trader/src/platform/marketplace/services/marketplace-payout-scheduler.ts`
**Lines:** 79–96 (the `for (const id of ids)` loop)

The current loop:
```ts
for (const id of ids) {
  try {
    const record = await revenueShareRepository.findById(id);
    if (!record) { … continue; }
    if (record.status === 'paid') continue;
    await revenueShareRepository.markAsPaid(id);  // ← marks paid unconditionally
    paid++;
    paidIds.push(id);
  } catch (err) { … }
}
```

Three things are missing:

1. **No strategy lookup** — `strategyRepository.findById(record.strategyId)` is never called, so the payout address is never validated.
2. **No payout creation** — `nowPaymentsService.getInstance().createPayout({ address, amount })` is never called. The test mocks are set up for it but the service ignores them.
3. **`paid` increments unconditionally** — because there's no payout step, `markAsPaid` always succeeds and `paid` always increments, making all skip scenarios report `processed: 1`.

## Test Failures Explained

| # | Test (line) | Expected | Actual | Cause |
|---|---|---|---|---|
| 1 | "processes pending revenue shares and sends USDT payouts" (115/116) | `processed=1`, `createPayout` called with address+amount | `processed=1` (passes), but `createPayout` never called | No payout call in loop |
| 2 | "does NOT mark as paid when payout API fails" (134) | `processed=0`, `errors` length 1 | `processed=1`, `errors` length 0 | `markAsPaid` called regardless of payout result |
| 3 | "skips when creator has no payoutAddress" (163) | `processed=0`, `createPayout` not called | `processed=1`, `createPayout` not called | No address check before processing |

## Fix Required (one logical change)

Replace the loop body (lines 80-96) with the full pipeline:

```
For each revenue record:
  1. Skip if already paid (keep existing check)
  2. Load the strategy via strategyRepository.findById(record.strategyId)
  3. Skip if strategy has no payoutAddress (push to skipped)
  4. Call nowPaymentsService.createPayout({ address, amount: creatorShareCents / 100 })
  5. If payout fails → push error, do NOT mark paid, do NOT increment paid
  6. Only on payout success → markAsPaid(id, payoutId), increment paid
```

This requires importing `strategyRepository` and `NowPaymentsService` (mocks already exist in the test module imports at lines 48-61 — they just aren't used).

The fix is roughly **~15 lines of replacement** in the loop body, changing the increment logic from unconditional to conditional on payout success.
