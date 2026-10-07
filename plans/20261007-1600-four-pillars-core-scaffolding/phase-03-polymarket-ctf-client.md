---
title: "Phase 03: Polymarket On-Chain CTF Settlement & Nonce Relayer"
description: "Implementation of secure relayer with nonce-management and gas-price dynamics."
status: pending
priority: P1
effort: 4h
---

## Overview
Rebuild the Polymarket Execution client to handle transactional nonce-locks, gas price dynamic estimation, and event-based settlement.

## Implementation Steps
1. Create `src/desk/polymarket/relayer-nonce-manager.ts`: Atomic Redis-backed nonce management.
2. Implement `src/desk/polymarket/gas-station-client.ts`: Dynamic fee calculation (EIP-1559).
3. Update `src/desk/polymarket/polymarket-relayer-engine.ts`: Signature-heavy relayer build-out.
4. Hook up `GnosisCTFEventResolution` listeners.

## Todo List
- [ ] Redis nonce locking mechanism.
- [ ] EIP-1559 dynamic gas price client.
- [ ] Signature generation refactor.
- [ ] Unit tests for nonce handling under high concurrency.

## Success Criteria
- Relayer successfully handles nonce collisions via Redis locks.
- Signed transactions accurately include dynamic fee limits (GasStation API).
