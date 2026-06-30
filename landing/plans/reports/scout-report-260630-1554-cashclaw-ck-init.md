# Scout Report — cashclaw.cc ClaudeKit Init & Fix

**Date:** 2026-06-30 15:54 ICT | **Scope:** Landing page source, deploy pipeline, quality gates

---

## 1. Architecture Baseline

| Signal | Value |
|--------|-------|
| Project type | Static HTML/CSS landing page |
| Platform | CF Pages direct upload (no git) |
| Project name | `algo-trader` |
| Custom domains | `cashclaw.cc`, `www.cashclaw.cc` |
| Source location (before) | `/tmp/cashclaw-redesign/` ❌ volatile |
| Source location (after) | `~/algo-trader/landing/src/` ✅ permanent |
| Version control | None ❌ |
| Deploy method | Manual `wrangler pages deploy` ❌ no gates |

## 2. Files Inventory

| File | Original (v1) | Current (v3) | Delta |
|------|---------------|--------------|-------|
| index.html | 35,474 bytes (1069 lines) | 23,012 bytes | -35% |
| tokens.css | 2,275 bytes (86 lines) | 18,873 bytes (250 lines) | +730% |
| _headers | 797 bytes | 797 bytes | unchanged |
| robots.txt | 101 bytes | 101 bytes | unchanged |
| components.css | 9,812 bytes | deleted | — |

## 3. Design Changes (v1 → v3)

| Property | v1 | v3 |
|----------|----|----|
| Font heading | Inter | Cabinet Grotesk |
| Font body | Inter | DM Sans |
| Font mono | JetBrains Mono | JetBrains Mono |
| Background | `#0B0E11` | `#060912` + noise + grid + glow orbs |
| Primary accent | `#00D4AA` (teal) | `#F59E0B` (gold) |
| Layout | Centered cards | Asymmetric split, data tables |
| Pricing | 3 rounded cards | Data table rows |
| Orderbook | None | Bid/Ask depth panel (new) |
| Motion | None | Ticker scroll, glow drift, stagger |

## 4. Issues Found

### Critical
1. **No quality gates before deploy** — 6 deploys in 1h, zero verification
2. **CDN cache poison** — `cashclaw.cc` served old `tokens.css` while HTML referenced new CSS vars → visual breakage
3. **Source in /tmp** — volatile, no backup, no version control

### High
4. **No CSS variable audit** — HTML uses variables not guaranteed to exist in tokens.css
5. **No deploy verification** — no HTTP check, no CSS integrity check
6. **No cache-busting strategy** — aggressive CF CDN caching on `/ui/*` (immutable, 1yr)

### Medium
7. **No responsive testing gate** — no check at 375/768/1024/1440
8. **No secret scanning** — no automated check before deploy
9. **Old `components.css` references** — v1 had it, v3 deleted it but HTML might still reference

## 5. Deploy History (Last Hour)

| # | Deploy ID | Time | Files Changed |
|---|-----------|------|---------------|
| 1 | 5b484be4 | 15:10 | Initial v2 deploy |
| 2 | ba8afe95 | 15:18 | v2 update |
| 3 | 7b0a94f0 | 15:21 | v3 tokens.css deploy |
| 4 | 8382bcf6 | 15:28 | v3 index.html deploy |
| 5 | 6b9c904c | 15:32 | Re-deploy (no changes) |
| 6 | e5c6bae0 | 15:52 | Cache buster fix (`?v=3`) |

**6 deploys, 4 had real changes, 2 were no-ops. Zero had verification.**

## 6. What Was Fixed (This Session)

| Fix | Status |
|-----|--------|
| Source moved to `~/algo-trader/landing/src/` | ✅ |
| CLAUDE.md created | ✅ |
| Deploy script with 4 quality gates | ✅ |
| Cache buster `?v=3` on tokens.css | ✅ |
| Git tracking (TODO) | ⬜ |
| Responsive test gate (TODO) | ⬜ |
| Visual diff before/after (TODO) | ⬜ |

## 7. Next Steps

1. Run deploy script → verify all gates pass
2. Add git tracking to landing/
3. Test responsive at 4 breakpoints
4. Document design system in `landing/docs/`

## Unresolved

- Should landing page have its own git repo or live in algo-trader monorepo?
- Should there be a staging deploy (preview URL) before production?
