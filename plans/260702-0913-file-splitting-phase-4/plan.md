# Plan: Phase 4 File Splitting

Split the last 2 oversized strategy files. Each gets config/types/helpers extracted to a separate file.

| File | Lines | After |
|------|-------|-------|
| `multi-leg-hedge.ts` | 452 | 345 + 126 (config) ✅ |
| `price-impact-estimator.ts` | 425 | 282 + 160 (config) ✅ |

## Target: `multi-leg-hedge.ts`
- Extract: Config interface, DEFAULT_CONFIG, internal types, 4 pure helpers, deps interface → `multi-leg-hedge-config.ts`
- Main: imports + tick factory + closures

## Target: `price-impact-estimator.ts`
- Extract: Config interface, DEFAULT_CONFIG, internal types, 4 pure helpers + bestBidAsk, deps interface → `price-impact-estimator-config.ts`
- Main: imports + tick factory + closures

## Steps
1. Phase 4a: Split `multi-leg-hedge.ts`
2. Phase 4b: Split `price-impact-estimator.ts`
3. Verify: `pnpm typecheck && pnpm lint`
