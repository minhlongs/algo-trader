---
phase: 4
title: "Migration Rollback + Revenue"
status: pending
priority: P1
dependencies: []
---

# Phase 4: Migration Rollback + Revenue

## Fixes
1. Register the 23 un-tracked migration files in the rollback script registry
2. Wire overage revenue (fix hardcoded $0)

## Steps
1. Read rollback-migration.ts to understand registry
2. Add missing migration entries
3. Find overage billing code, wire to overage_invoices table
4. Verify typecheck

## Success Criteria
- [ ] 23 migrations registered for rollback
- [ ] Overage revenue no longer hardcoded to 0