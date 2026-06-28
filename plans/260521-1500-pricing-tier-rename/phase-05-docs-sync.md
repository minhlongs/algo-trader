# Phase 05 — README + docs/ pricing sync

**Priority:** P1
**Status:** pending
**Depends on:** Phase 02 (canonical price decision)

## Goal

All `docs/` and `README.md` pricing references reflect canonical Starter $49 / Pro $149 / Growth $399.

## Files to modify

| File | Current | Target |
|------|---------|--------|
| `README.md:219-221` | Starter $49 / Pro $149 / Growth $399 | ✓ already correct — verify only |
| `docs/system-architecture.md:258` | FREE $0, PRO $49, ENTERPRISE $299 | FREE $0, STARTER $49, PRO $149, GROWTH $399 |
| `docs/LICENSE_API_GUIDE.md:33-34, 265-266` | PRO $49 / ENTERPRISE $199 | PRO $149 / GROWTH $399 (+ STARTER $49 row) |
| `docs/api-rate-limiting.md:17` | PRO $49/mo | PRO $149/mo |
| `docs/project-changelog.md:411` | PRO $49 / ENTERPRISE $299 | leave historical entry; add new entry dated 2026-05-21 noting the rename |
| `docs/trading-architecture-sops.md:576` | PRO $49 | PRO $149 |
| `docs/client-self-hosted-trading-company-deployment-architecture.md:399` | Business $99 | Growth $399 (rename Business→Growth) |
| `docs/cmo-sops.md:229`, `docs/caio-cso-cco-sops.md:115` | TEAM $99 | leave (Team is a separate org-tier discussion — out of scope) OR add note "→ now Growth $399". Decision: **leave** (different tier conceptually). |
| `docs/marketing/twitter-thread.md:115` | PRO $49/mo | PRO $149/mo |
| `docs/marketing/email-sequence.md:44, 173` | PRO $49 | PRO $149 |
| `docs/marketing/blog-arbitrage-engine.md:292` | PRO $49 | PRO $149 |
| `docs/marketing/landing-page.md:47` | PRO $49 | PRO $149 (+ Starter $49 + Growth $399 rows) |
| `docs/marketing/discord-announce.md:39` | PRO $49 | PRO $149 |

## Implementation steps

1. Bulk-grep verify pre-state: `grep -rnE '\$(49|99|149|199|299|399|499)' docs/ README.md | grep -iE 'pro|enterprise|starter|growth|tier|mo'`
2. Edit each file in the table.
3. Add changelog entry to `docs/project-changelog.md` at top:
   ```
   ### 2026-05-21 — Pricing & Tier Rename (R-10)
   - Replaced LicenseTier.ENTERPRISE with STARTER + GROWTH.
   - Canonical pricing: Starter $49 / Pro $149 / Growth $399.
   - Legacy `rep-*` license keys and stored `'ENTERPRISE'` tier strings continue to validate via `normalizeTier()`.
   - Touched 30+ files. See plans/260521-1500-pricing-tier-rename/.
   ```
4. Run `grep -rnE '\$(99|199|299|499)' docs/ README.md | grep -iE 'pro|enterprise|tier|mo'` — should be empty.

## Acceptance

- [ ] No `docs/` file references `ENTERPRISE` tier name in active pricing copy (changelog history exempt).
- [ ] No `docs/` file references `$99`, `$199`, `$299`, or `$499` in PRO/ENTERPRISE/Growth pricing context.
- [ ] `docs/project-changelog.md` has new 2026-05-21 entry.
- [ ] `docs/system-architecture.md` lists 4 tiers.

## Out of scope

- `docs/cmo-sops.md` "TEAM $99" — separate org-tier concept; leave as-is.
- `docs/caio-cso-cco-sops.md` "TEAM $99" — same.
- `docs/client-self-hosted-.../Business $99` — renamed to Growth $399 above; if context indicates a different product line, flag during execution.
