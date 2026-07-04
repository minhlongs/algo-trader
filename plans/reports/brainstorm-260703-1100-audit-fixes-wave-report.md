# Audit Fixes Wave — 6 Gaps

> Implementation plan for the 6 gaps found in the Backend/Infra audit.
> Source: docs/infrastructure-audit.md, docs/backend-features-audit.md, docs/live-trading-runbook.md
> Mode: brainstorm → ck:plan --deep --parallel

---

## Items

| # | Fix | Effort | Priority | File(s) |
|---|-----|--------|----------|---------|
| 1 | Fix certbot script → Caddy | Small | P1 | `scripts/renew-certs.sh` |
| 2 | Fix alertmanager webhook | Small | P1 | `config/alertmanager.yml` |
| 3 | Implement DEX connectors | Large | P2 | `src/desk/markets/dex/` |
| 4 | Fill 14 strategy stubs | Medium | P2 | `src/desk/strategies/*/` |
| 5 | Register 23 untracked migrations | Medium | P1 | `scripts/rollback-migration.sh` |
| 6 | Wire overage revenue | Small | P2 | Billing code |

## Execution

3 parallel tracks:
- **Track A (P1):** Items 1, 2, 5 — config/scripts fixes
- **Track B (P2):** Items 3, 4 — backend feature gaps
- **Track C (P2):** Item 6 — revenue fix
