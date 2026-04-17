# AI-First Enforcement Gates

> Pillar 1 of the a16z Solo Platform doctrine (DeepSeek Solo-Platform PDF).
> Source of truth for what CI must verify before AI-generated code reaches production.

## Why

Algo-trader ships autonomous code from Claude, Qwen, DeepSeek, Ollama, and Codex swarms.
Without explicit enforcement points, AI regressions reach production silently.
These gates give each AI commit a deterministic pass/fail signal the founder can audit
in one glance via the GitHub Checks UI.

## The five gates

Each gate maps 1:1 to a job in `.github/workflows/ci.yml`. A failure surfaces
the offending gate by name instead of a single monolithic "CI failed".

| Gate | Name | Hard fail | Purpose |
| ---- | ---- | --------- | ------- |
| 1 | Validation | yes | `tsc --noEmit`, `eslint src/`, `validate-strategies`, full vitest suite |
| 2 | Security scan | yes | Hardcoded-secret regex (`ci-gate-secret-scan.mjs`) + `pnpm audit --audit-level=critical`; high-severity advisories downgrade to warning |
| 3 | Quality | yes on PR | `eslint --max-warnings 0` on changed TS files only; >400 LOC files surfaced as warnings |
| 4 | Dependency hygiene | yes | Lockfile must install reproducibly; `pnpm outdated` advisory-only |
| 5 | Deployment smoke | yes on `main` | `ci-gate-deploy-smoke.mjs` probes `algo-trader.pages.dev` + `cashclaw.cc` with 5-attempt backoff |

Gates 1–4 run in parallel on every push and PR. Gate 5 runs only after `main`
is updated and depends on all prior gates passing.

## Secret-scan patterns

The scanner rejects the following patterns in any tracked `src/`, `scripts/`,
`migrations/`, or `workers/` file (excluding tests, fixtures, and markdown):

- AWS access keys (`AKIA…`)
- GitHub personal tokens (`ghp_…`, `github_pat_…`)
- Slack bot tokens (`xox[baprs]-…`)
- Anthropic keys (`sk-ant-…`)
- OpenAI keys (`sk-…` 48-char)
- Stripe live keys (`sk_live_…`)
- Google API keys (`AIza…`)
- PEM-encoded private keys

Add a new pattern: edit `scripts/ci-gate-secret-scan.mjs` → `PATTERNS` array.

## Dependency thresholds

| Level | Behavior |
| ----- | -------- |
| critical | `pnpm audit` fails CI immediately |
| high | advisory only (soft warning via GitHub annotation) |
| moderate/low | ignored in CI |

Rationale: transitive deps through `vite`/`fastify` currently emit six high-severity
advisories with no upstream patch. Blocking on them freezes shipping without
improving safety. Critical advisories stay blocking because they map to
exploitable paths in our runtime.

## Deployment smoke

`ci-gate-deploy-smoke.mjs` probes each URL up to 5 times with 6s backoff.
Any non-2xx or non-3xx response after retries fails the gate and blocks the
deploy from being marked "green" in the release dashboard.

## Rollback hierarchy alignment

These gates sit at L0 (static) in the trader rollback stack:

1. **L0 static** — Enforcement Gates (this doc)
2. **L0 dynamic** — Qwen Signals Loop + Journal (PR #113/#114)
3. **L1** — kill switch (`QWEN_KILL=1`)
4. **L2** — swarm disable (`SWARM_QWEN_ENABLED=false`)
5. **L3** — drawdown auto-disable at −5%
6. **L4** — 30-day paper gate (until 2026-05-17)

## Changelog

- 2026-04-17 — Initial shipped (restructured single job → 5 gates, added secret scan + deploy smoke scripts).
