# Execution — algo-trader: bootstrap → build → ship

## Escrow TODOs (from CONDITIONAL PASS ROUND 1)

- [ ] Resolve Assumption #1: pick one canonical arbitrage workstream (merge 260808-1500 into 260808-arbitrage-execution-engine, OR separate PRs)
- [ ] Resolve Assumption #2: decide `.agentkit/ownership.json` tracked vs ignored; document in Phase 0
- [ ] Add "verify staged set contains no secrets" step to Phase 3 commit and pre-flight checklist
- [ ] Prove bootstrap-destructive claim: run dry-run before relying on it
- [ ] Define explicit commit scope (which dirty files are in vs out payload)
- [ ] Verify `688f1f187` security-hardening commit exists in local log

## Phase Execution Log

### Phase 1 — Harness fix
- **Block:** `config-manager.ts:223` called `getCKConfigSafe()` (undefined)
- **Fix:** replaced with `(this as any).ckConfig?.modelOverrides?.[this.persona`
- **Verify:** `/Users/macbook/bin/ak --help` exits 0 cleanly

### Phase 2 — Binary verification
- `ak --help` ✅ (post-fix)
- Available commands: `init`, `update`, `doctor`, `uninstall`, `gui`, `kit`, `new`, `plan`, `projects`, `self-update`, `setup`
- `bootstrap`/`ship`/`cook` do NOT exist in installed kit
- Action: native Claude Code agent pipeline used instead of ak subcommands
