---
phase: 4
title: "Fix Enterprise Backend"
status: pending
effort: S
---

# Phase 4: Fix Enterprise Backend

## Overview
Update enterprise backend to accept new tier values (PRO/ENTERPRISE/MASTER instead of old growth/scale/unlimited).

## Related Code Files
- Modify: `src/platform/billing/enterprise-inquiry-store.ts`
- Verify: enterprise routes in server.ts
- Check: DB table constraints on tier values

## Implementation Steps
1. Read enterprise-inquiry-store.ts — find tier enum/validation
2. Update tier values: "growth"→"PRO", "scale"→"ENTERPRISE", "unlimited"→"MASTER"
3. Verify POST /api/enterprise/inquiries route is registered in server.ts
4. Check if DB table has CHECK constraints on old tier values
5. Run `npx tsc --noEmit` then `npx vitest run`

## Success Criteria
- [ ] Enterprise store accepts PRO/ENTERPRISE/MASTER tiers
- [ ] All tests pass
- [ ] TypeScript: 0 errors
