# CLAUDE.md — cashclaw.cc Landing Page

Static landing page for CashClaw, deployed to Cloudflare Pages (`algo-trader` project). Custom domain: `cashclaw.cc` + `www.cashclaw.cc`.

## Commands

```bash
cd landing

# Deploy to CF Pages (production — updates cashclaw.cc)
./scripts/deploy-cf-pages.sh

# Quick deploy (dirty working tree OK)
ALLOW_DIRTY_DEPLOY=1 ./scripts/deploy-cf-pages.sh

# Verify deployment
./scripts/verify-deploy.sh
```

## Architecture (Sophia seed/tree/forest/land)

```
landing/src/
├── index.html                    # land — HTML shell only (~185 lines)
├── robots.txt                    # SEO
├── _headers                      # Security + cache (no unsafe-eval CSP)
├── _redirects                    # Canonical www→apex, SPA fallback
│
├── seed/                         # FOUNDATIONAL — design tokens only
│   ├── tokens.css                # Colors, fonts, spacing, radius, shadows, motion
│   └── tokens.lint.json          # Allowed token list for deploy audit
│
├── tree/                         # REUSABLE — imports seed only
│   ├── base.css                  # Reset, nav, footer, section, container, responsive
│   └── components.css            # All component styles (btn, card, modal, coupon, FAQ, etc.)
│
└── forest/                       # ORCHESTRATION — imports seed + tree
    └── js/
        ├── config.js             # Constants (CHECKOUT URLs, API base)
        ├── main.js               # Entry — wires everything on DOMContentLoaded
        ├── services/             # Business logic (NO DOM)
        │   ├── coupon-service.js
        │   ├── checkout-service.js
        │   └── stats-service.js
        ├── controllers/          # DOM reads/writes (NO business logic)
        │   ├── modal-controller.js
        │   ├── coupon-controller.js
        │   └── price-display.js
        └── utils/                # Pure helpers
            ├── api.js            # fetch wrapper (ok/error pattern)
            └── format.js         # Currency formatting
```

## Layer Rules (Enforced)

| Layer | Can Import | Cannot Import |
|-------|-----------|---------------|
| seed (tokens.css) | Nothing | tree, forest, land |
| tree (base.css, components.css) | Seed only | forest, land |
| forest (js/*) | Seed + tree | Nothing from land |
| land (index.html) | Seed + tree + forest | — |

**JS layer rules:**
- `config.js` → imports nothing
- `services/*` → imports config.js + utils/* (NO DOM)
- `controllers/*` → imports services/* (DOM only, no fetch)
- `main.js` → imports config + services + controllers (wires events)

## Design System (Terminal Brutalism v3)

- **Background**: `#060912` with noise texture + grid overlay + ambient glow orbs
- **Typography**: Cabinet Grotesk (headings) + DM Sans (body) + JetBrains Mono (mono/data)
- **Colors**: Gold `#F59E0B` (primary accent), Emerald `#34D399` (bull/positive), Rose `#FB7185` (bear/negative)
- **Motion**: Ambient glow drift animation
- **CSP**: `script-src 'self'` only (no unsafe-inline, no unsafe-eval)

## Quality Gates (MANDATORY before deploy)

1. All 8 required source files present (Gate 1)
2. CSS variable audit — all `var(--xxx)` in HTML exist in CSS files (Gate 2)
3. Security headers present (HSTS, CSP, X-Frame-Options, Permissions-Policy) (Gate 3)
4. No hardcoded secrets (Gate 4)
5. JS syntax check via `node --check` (Gate 5)

## Deploy Contract

- Source of truth: `landing/src/` (NOT `/tmp/cashclaw-redesign/`)
- Every deploy logged to `landing/plans/reports/deploy-*.md`
- CF CDN cache: `/seed/*`, `/tree/*`, `/forest/*` immutable 1y
- Git SHA auto-injected as cache buster in deploy reports

## Business Logic (NON-NEGOTIABLE)

These MUST survive any refactor:
1. NOWPayments checkout URLs (4 tiers: Free/Starter/Pro/Elite)
2. Coupon validation flow (validate → apply discount → update prices)
3. Activation modal (email + password → register → activate coupon)
4. Live stats fetch from `/api/public/stats`
5. Free access coupon path (coupon.freeAccess → modal instead of checkout)
