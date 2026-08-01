# CLAUDE.deploy.md — SDLC Phase 4: Deploy

> **Role:** agent instructions for the *Deploy* phase.
> **Upstream:** `CLAUDE.code.md`. **Downstream:** production + feedback loop (`qwen-signals-loop`, Signals Loop journal).

---

## Purpose

Get merged, tested code to production on Cloudflare Pages, then *prove* it's green before the session ends. Vercel is banned (2026-03-27). Push-and-done is banned.

## Required inputs

- Green PR: CI gates 1–4, 6, 7 passed on the PR branch (Gate 5 runs post-merge).
- Migration drafted (applied to staging / D1 or pending manual apply on prod Postgres — noted in PR body).
- Code-reviewer report ≥9.0/10, 0 critical.
- Memory + changelog drafts ready.

## Deploy path

1. **Merge**
   - Squash-merge via `gh pr merge <N> --squash --delete-branch`. Use `--admin` only when required-contexts drift from current gate names (then `gh api PATCH …/required_status_checks` first).
   - Never `--no-verify`. If a hook fails, fix it, don't bypass.
2. **GitHub Actions on `main`**
   - Gates 1–4, 6, 7 re-run on every event; Gate 5 (deploy smoke) runs post-merge only.
   - Poll `gh run list -L 5` until all `completed/success`. 5-minute ceiling per gate.
3. **Cloudflare Pages auto-deploy**
   - Project: `algo-trader` (`algo-trader.pages.dev` + `cashclaw.cc`).
   - Check `wrangler pages deployment list --project-name algo-trader | head -10` for latest `success`.
4. **Prod smoke (Gate 5 script mirror)**
   - `curl -sI https://algo-trader.pages.dev | head -1` → `HTTP/2 200`.
   - `curl -sI https://cashclaw.cc | head -1` → `HTTP/2 200`.

## Hard constraints

- **Cloudflare only.** No `vercel …` commands. No new VPS-based deploy paths.
- **Branch protection.** `enforce_admins: true`. Required contexts: Gate 1, Gate 2, Gate 3, Gate 4 (Gate 5 post-merge only, so not required).
- **Secret management.** Cloudflare Worker / Pages secrets via `wrangler secret put` or dashboard. Never inline in `wrangler.toml`. Gate 2 catches hardcoded secrets.
- **Migrations** apply order: D1 via `wrangler d1 migrations apply` → prod Postgres via `psql` (idempotent). Note manual-apply items in PR body and in the ship memory.
- **Rollback readiness.** Know which tier catches the failure mode of what you're shipping:
  - **L0 static** — CI gates (PR #115). Pre-merge block.
  - **L0 dynamic** — Signals Loop journal (PR #113/#114). Observational.
  - **L1** — `QWEN_SIGNAL_KILL=1` env / `POST /api/v1/admin/qwen/kill`.
  - **L2** — `SWARM_QWEN_ENABLED` env controls the Qwen swarm route. Only the literal string `'true'` enables it; any other value (unset, empty, `'false'`, `'0'`) disables L2.
  - **L3** — `qwen-drawdown-monitor` -5% auto-disable (6h cron).
  - **L4** — `MIN_PAPER_DAYS=30` paper gate (until 2026-05-17).
- **Verification report required.** Binh-phap-cicd 11-line format. Push-and-done = task failed.

## Mandatory verification report

```
## Verification Report
- Build:      ✅ exit 0
- Tests:      ✅ N/N vitest pass
- Git Push:   ✅ <commit> → main
- CI Gate 1:  ✅ Validation
- CI Gate 2:  ✅ Security
- CI Gate 3:  ✅ Quality
- CI Gate 4:  ✅ Dependency
- CI Gate 5:  ✅ Deploy smoke
- CI Gate 6:  ✅ Paper gate lock
- CI Gate 7:  ✅ Shell lint
- CF Pages:   ✅ <deployment-id> success
- Prod HTTP:  ✅ 200 on algo-trader.pages.dev + cashclaw.cc
- Timestamp:  <ISO-8601 Asia/Saigon>
```

Missing any line = task incomplete.

## Post-deploy

- Update `project_algotrader_qwen_m1max_shipped.md` memory with PR#, commit, new rollback layer (if any).
- Update `MEMORY.md` index line.
- Update `docs/project-changelog.md` with the shipped version.
- Update `docs/development-roadmap.md` phase status.
- If architecture shifted, update `docs/system-architecture.md`.

## Emergency rollback

- **Bad code on main**: `git revert <commit>` → PR → merge fast. Never `push --force` to main.
- **Runaway signals**: `POST /api/v1/admin/qwen/kill` with `X-Admin-Key`, then investigate.
- **Drawdown breach**: L3 fires automatically. Verify `qwen-drawdown-monitor` logs.
- **Breaking migration**: forward-fix via new migration. No destructive down-migrations on prod.

## Definition of done

- [ ] Merge completed, branch deleted.
- [ ] All 7 gates green on `main` (1–5 required, 6–7 soft-required).
- [ ] CF Pages deployment `success`.
- [ ] Prod HTTP 200 on both URLs.
- [ ] Verification report posted (11 lines).
- [ ] Memory + changelog + roadmap updated.
- [ ] Manual follow-ups (e.g. migration on prod Postgres) explicitly listed as unresolved.

## Encryption at Rest

- Tenant credentials (api_key, api_secret, passphrase, private_key) use AES-256-GCM.
- Key length: 32 bytes (256 bits).
- IV: random 12 bytes per encrypt call.
- Auth tag: 16 bytes.
- Encoding: ciphertext, IV, and tag are concatenated colon-delimited and stored directly in the credential column.
- Primary key env: `ENCRYPTION_MASTER_KEY`.
- Fallback key env: `CREDENTIALS_ENCRYPTION_KEY`.
- Key rotation is out of scope for this phase.
- Encryption boundary doc: `docs/encryption-boundary.md`.

## Unresolved questions

Always log at end of verification report.
