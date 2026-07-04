# Agentic Resilience Hardening

**Source:** `plans/reports/agentic-patterns-research-260523.md` — 4 unresolved questions
**Mode:** cook-auto-parallel --deep
**Date:** 2026-05-23

## Phases (Parallel — No File Overlap)

| Phase | Title | Files | Status |
|-------|-------|-------|--------|
| 01 | Recovery Manager Instance Isolation | `src/resilience/recovery-manager.ts`, `tests/resilience/recovery-manager-instance.test.ts` | [ ] |
| 02 | JetStream Ordered Consumer for Consensus | `src/messaging/jetstream-manager.ts`, `tests/resilience/jetstream-ordered.test.ts` | [ ] |
| 03 | Vibe Controller Multi-Instance CAS | `src/wiring/vibe-controller.ts`, `tests/resilience/vibe-controller-cas.test.ts` | [ ] |
| 04 | Signal Dedup Race Condition Fix | `src/signal/signal-dedup-guard.ts`, `src/signal/signal-ttl-enforcer.ts`, `tests/resilience/signal-dedup-race.test.ts` | [ ] |

## Key Constraints

- YAGNI: fix the 4 documented issues, no over-engineering
- Each phase owns distinct files — safe for parallel execution
- Tests must pass: `pnpm vitest run`
- TypeScript must compile: `pnpm tsc --noEmit`
