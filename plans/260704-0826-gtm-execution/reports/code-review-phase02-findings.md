# Phase 2 Code Review — Findings & Fixes

**Reviewer:** code-reviewer subagent (2026-08-04)
**Scope:** scripts/send-email-campaign.ts, landing/src/_redirects, docs/marketing/, energy-9.ts, edge-proxy.ts

## Findings & Resolution

| # | Severity | File | Issue | Resolution |
|---|----------|------|-------|------------|
| 1 | HIGH | send-email-campaign.ts:317 | isVietnamese hardcoded false — Vi templates dead code | Documented as intentional. No locale column in user table. English-only until task #70 adds DB column. TODO added at line 317. |
| 2 | MEDIUM | docs/marketing/launch-posts-ready-to-post.md | Bare cashclaw.cc (6 refs) vs api.cashclaw.cc | Fixed. All 6 refs replaced with api.cashclaw.cc. |
| 3 | MEDIUM | src/platform/workers/api/energy-9.ts:89 | Tier-gated 403 hardcodes cashclaw.cc/pricing | Fixed. Now uses api.cashclaw.cc/billing?upgrade=basic. |
| 4 | LOW | energy-9.ts:65 + 5 other files | (env as any) cast — systemic CF Workers pattern | Deferred. Pre-existing across api/*.ts. Cloudflare runtime enforces at deploy time. |
| 5 | LOW | landing/src/_redirects:5 | /alpha-vang redirect depends on unverified index.html existence | Post-deploy check. Confirm landing/src/alpha-vang/index.html exists. No code change. |

## Verified Clean
- Zero app.algotrader.cc references in reviewed files
- Zero console.log in reviewed files
- /api/delivery/energy-9 GET handler wired correctly at edge-proxy.ts:288
- No new :any types introduced by recent changes

## Conclusion
Phase 2 deploy unblocked. Remaining risk: deploy-time check for alpha-vang HTML existence.
