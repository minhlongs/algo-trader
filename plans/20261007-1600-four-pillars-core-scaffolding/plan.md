---
title: "Four Pillars Core Scaffolding Implementation"
description: "Parallel implementation of Risk Cockpit, High-Throughput Backtester, Polymarket Relayer, and Strategy Optimizer."
status: pending
priority: P1
effort: 16h
branch: head
tags: [risk, alpha-lab, polymarket, infrastructure]
created: 2026-10-07
---

# Four Pillars Core Scaffolding

This plan outlines the parallel implementation of the four core infrastructure pillars in `algo-trader` to harden our risk management, alpha simulation, and execution capabilities.

## Phases
1. **[Risk Cockpit & L0-L4 Killswitch Controller](phase-01-risk-cockpit.md)** (effort: 4h)
2. **[High-Throughput Alpha Backtester](phase-02-alpha-backtester.md)** (effort: 4h)
3. **[Polymarket On-Chain CTF Settlement & Nonce Relayer](phase-03-polymarket-ctf-client.md)** (effort: 4h)
4. **[Strategy Optimization Grid & Walk-Forward Optimizer](phase-04-strategy-optimizer.md)** (effort: 4h)

## Dependencies
- All phases are independent but share the core TypeScript types defined in the desk and alpha-lab modules.
- Implementation should follow the established modular patterns (`<=200 LOC per file`).

## Compliance & Security Gates
- All modules must pass unit tests with 100% code coverage.
- No `:any` types.
- Zod validation for all API/On-chain inputs.

## Success Criteria
- L0-L4 Controller successfully triggers test killswitches in production-like environment.
- Backtester achieves > 1M ticks/sec performance.
- Polymarket Relayer successfully handles nonce collisions via Redis locks.
- Strategy Optimizer demonstrates Purged & Embargoed Cross-Validation (CPCV) convergence in test environment.
