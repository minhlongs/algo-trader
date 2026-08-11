---
phase: 1
title: "Live Trading Go-Live"
status: complete
priority: P0
dependencies: []
---

# Phase 1: Live Trading Go-Live

## Overview
Verify and document the live trading activation procedure. PAPER_MODE env var exists with validation. Create go-live checklist and rollback plan.

## Steps
1. Audit current PAPER_MODE env var and live validation in orchestrator
2. Document paper→live transition procedure
3. Create rollback plan
4. Verify risk gates fire at correct thresholds

## Files
- Read: src/platform/config/env-schema.ts, src/desk/polymarket/live-trading-orchestrator.ts
- Modify: docs/live-trading-runbook.md

## Success Criteria
- [ ] Paper→live procedure documented
- [ ] Rollback plan ready
