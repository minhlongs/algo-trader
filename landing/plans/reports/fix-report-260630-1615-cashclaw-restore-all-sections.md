# Fix Report — cashclaw.cc `/fix all`

**Date:** 2026-06-30 16:15 ICT | **Complexity:** Complex | **Status:** ✅ Complete

---

## ✓ Step 1: Scouted

- **Project:** Static HTML/CSS landing page, CF Pages direct upload
- **v1 (original):** 1,069 lines, 35,474 bytes, 10 sections, 3 JS modules
- **v3 (redesign):** 352 lines, 23,012 bytes, 6 sections, 0 JS
- **Delta:** -8 sections, -all JS, -NOWPayments, -coupon, -activation modal, -FAQ, -social proof

## ✓ Step 2: Diagnosed

| Question | Answer |
|----------|--------|
| **Exact symptom** | Homepage missing: How It Works, Coupon input, Social Proof, FAQ, Activation Modal, NOWPayments checkout, coupon validation JS, registration flow |
| **Root cause** | v3 redesign treated landing page as pure design artifact. Replaced complete payment funnel (1,069 lines) with visual-only page (352 lines). No business logic preserved. |
| **Why now** | Redesign deployed without comparing against v1 section inventory — design-first, not business-first |
| **Blast radius** | NOWPayments payment flow, coupon activation API, user registration, FAQ SEO, social proof CTA — all non-functional |

## ✓ Step 3: Complex — Merged approach

Strategy: v1 complete structure + v3 design tokens + all JS preserved + v3 new sections (ambient glows, nav styling)

## ✓ Step 4: Fixed — 1 file changed

`landing/src/index.html`: 558 lines, 35,191 bytes

| Restored | Count |
|----------|-------|
| How It Works steps | 3 cards |
| Feature cards | 4 cards |
| Pricing cards (Starter/Pro/Elite) | 3 cards |
| Coupon code input | Full flow (validate, apply, discount) |
| Social Proof section | "We Eat Our Own Cooking" |
| FAQ items | 4 Q&A |
| Activation Modal | Email + password registration |
| NOWPayments USDT links | 3 checkout URLs |
| JS functions | Coupon, checkout, activation, stats, price update |

## ✓ Step 5: Verified + Prevented

| Gate | Status |
|------|--------|
| CSS Variable Audit | ✅ 150+ vars defined, zero missing |
| Security Headers | ✅ HSTS, CSP, X-Frame-Options, Permissions-Policy |
| Secrets Scan | ✅ Clean |
| Deploy HTTP | ✅ 200 |
| CSS Integrity | ✅ v3 Terminal Brutalism (18,873 bytes) |
| Business Logic | ✅ All sections + JS present |

**Prevention added:**
- CSS variable audit gate catches var mismatch before deploy
- Deploy script auto-generates audit report
- Source moved from `/tmp` → `landing/src/` (permanent, trackable)
- `.cache-version` for CDN cache busting
- Full ClaudeKit project structure (docs, plans, scripts, CLAUDE.md)

## ✓ Step 6: Complete

- **Deploy URL:** `https://647cfe88.algo-trader.pages.dev` → `cashclaw.cc`
- **Report:** `landing/plans/reports/fix-report-260630-1615-cashclaw-restore-all-sections.md`
- **Next:** Em verify cashclaw.cc với hard refresh (Cmd+Shift+R)

## Project Structure (Post-Fix)

```
landing/
├── CLAUDE.md              ← Agent contract
├── README.md              ← Human overview
├── package.json           ← npm run deploy / verify
├── .gitignore
├── docs/
│   ├── code-standards.md
│   ├── system-architecture.md
│   └── deployment-guide.md
├── scripts/
│   ├── deploy-cf-pages.sh      ← 4 quality gates
│   └── verify-deploy.sh
├── plans/reports/
└── src/                        ← Source of truth
    ├── index.html              ← 558 lines, complete
    ├── _headers
    ├── robots.txt
    └── ui/design-system/
        └── tokens.css          ← v3 Terminal Brutalism
```
