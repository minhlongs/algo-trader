# Phase 02 — Wasm Sandbox (Per-Subscriber Execution Isolation)

**File ownership:** `src/sandbox/**`, `src/db/migrations/011_sandbox_*.sql`

## Context Links

- PDF digest: `plans/reports/researcher-260416-2312-deepseek-solo-platform.md` (sec 4, 7)
- Scout reuse: `plans/reports/scout-260416-2312-raas-reuse-surface.md` (BUILD-NEW #1)

## Overview

- Priority: P1
- Status: pending
- Brief: Wrap per-subscriber strategy execution in WebAssembly sandbox. Isolation at CPU+memory level, capability-based syscalls. MVP target: strategy compute (pure math) only — network I/O stays in host, gated by Phase 03 IronClaw.

## Key Insights

- Wasmtime or browser-native Wasm (CF Workers support Wasm) — use CF Workers Wasm on edge, wasmtime-like in node for dev.
- KISS: start with pure-compute sandbox (no WASI network). Strategies return signals; host fetches market data + executes orders.
- Existing strategies in `src/strategies/polymarket/*.ts` stay TS; we compile a "strategy kernel" variant to Wasm per subscriber.
- Capability-based: sandbox receives read-only market snapshot + subscriber config; returns signal events only.

## Requirements

**Functional:**
- Compile selected strategy to Wasm module (AssemblyScript or Rust-to-Wasm)
- Load module per subscriber call with 64MB memory cap + 500ms CPU cap
- Input: JSON snapshot (market, config, BYOK-gated params)
- Output: signal array (type/side/size/ticker)
- Reject sandbox outputs > 1MB (prevent exfil via size channel)

**Non-functional:**
- Cold start < 100ms
- Memory reset per invocation (no cross-tenant state)
- Execution trace emitted to audit log

## Architecture

```
host (TS)                       sandbox (Wasm)
──────────                      ──────────────
fetch market snapshot  ───────> read-only input
subscriber config      ───────> read-only input
                                strategy.compute()
                       <─────── signal[] (JSON)
validate+route to exec
```

## Related Code Files

**Create:**
- `src/sandbox/wasm-runtime-loader.ts` (~150 LOC)
- `src/sandbox/wasm-memory-limiter.ts` (~100 LOC)
- `src/sandbox/wasm-cpu-limiter.ts` (~80 LOC)
- `src/sandbox/sandbox-input-encoder.ts` (~120 LOC)
- `src/sandbox/sandbox-output-validator.ts` (~100 LOC)
- `src/sandbox/sandbox-invocation-tracer.ts` (~90 LOC)
- `src/sandbox/index.ts` (~40 LOC barrel)
- `src/sandbox/kernels/spread-mean-reversion.wat` (proof-of-concept, hand-written WAT or compiled)
- `src/sandbox/__tests__/wasm-runtime-loader.test.ts`
- `src/sandbox/__tests__/sandbox-output-validator.test.ts`
- `src/db/migrations/011_sandbox_invocations.sql`

**Modify:** none (sandbox is additive; existing strategies keep working)

## Implementation Steps

1. Pick Wasm runtime: Cloudflare Workers Wasm for edge; `@wasmer/wasi` for node dev
2. Write migration `011_sandbox_invocations.sql` (track subscriber, strategy_id, input_hash, output_hash, duration_ms)
3. Build `wasm-runtime-loader.ts` (instantiate, with memory + CPU hooks)
4. Build `wasm-memory-limiter.ts` (growth trap at 64MB)
5. Build `wasm-cpu-limiter.ts` (timeout via `AbortSignal` + fuel metering)
6. Build `sandbox-input-encoder.ts` (JSON → linear memory pointer)
7. Build `sandbox-output-validator.ts` (parse return, size + schema check)
8. Build `sandbox-invocation-tracer.ts` (emit audit row per call)
9. Compile 1 PoC kernel: port `spread-mean-reversion` logic to AssemblyScript → `.wasm`
10. Integration: call PoC kernel from test; compare output vs TS reference within tolerance
11. Unit tests: memory trap, CPU timeout, oversize output rejection

## Todo List

- [ ] Runtime choice documented (CF Workers Wasm vs wasmer)
- [ ] Migration 011 applied
- [ ] `wasm-runtime-loader.ts` + test
- [ ] `wasm-memory-limiter.ts` + test (OOM trap)
- [ ] `wasm-cpu-limiter.ts` + test (timeout)
- [ ] `sandbox-input-encoder.ts` + test
- [ ] `sandbox-output-validator.ts` + test (oversize reject)
- [ ] `sandbox-invocation-tracer.ts` + test
- [ ] PoC kernel `spread-mean-reversion.wasm` built
- [ ] TS vs Wasm parity test (< 1% numerical drift)

## Success Criteria

- `bun test src/sandbox` green
- PoC kernel matches TS reference output on 100 fixtures
- Memory cap + CPU cap verified via adversarial test
- Audit row written per invocation
- No `any` / `@ts-ignore`

## Risk Assessment

- **R1:** AssemblyScript toolchain churn → pin version in `package.json`; commit `.wasm` artifacts
- **R2:** CF Workers Wasm memory limit (128MB hard cap) → MVP 64MB budget safe
- **R3:** Porting all 46 strategies = huge scope → YAGNI, ship 1 PoC kernel + framework, port-on-demand

## Security Considerations

- Sandbox cannot access network, filesystem, or env vars (WASI off)
- Input sanitized via Zod schema before encode
- Output hash stored for tamper-evidence
- Audit trace feeds Phase 03 IronClaw

## Next Steps

- Phase 06 swaps direct-TS-strategy calls with sandbox-mediated calls for enterprise tier
- Port remaining 45 strategies incrementally post-MVP (backlog)
