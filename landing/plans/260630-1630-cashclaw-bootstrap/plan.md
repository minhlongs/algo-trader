# CashClaw Bootstrap — Architecture Plan

**Date:** 2026-06-30 | **Status:** Planning | **Source:** /idea → /bootstrap

## Current State (558-line Monolith)

`src/index.html` — HTML + inline `<style>` (129 lines) + inline `<script>` (198 lines) all in one file.

| Problem | Severity | Impact |
|---------|----------|--------|
| Business logic inline in `<script>` | CRITICAL | Can't test, can't reuse across pages |
| CSS variables + component styles mixed | HIGH | tokens.css is clean but index.html has 129 lines of component CSS |
| Global JS variables (`var CHECKOUT`, `var activeCoupon`) | HIGH | Pollutes global scope, no encapsulation |
| Inline styles on elements | MEDIUM | 15+ instances, overrides tokens, breaks consistency |
| No CSP-safe architecture | MEDIUM | `unsafe-inline` required for style + script |
| Manual cache buster (`?v=4`) | LOW | Git SHA automation already spec'd, not implemented |

## Target Architecture (Sophia seed/tree/forest/land)

```
landing/src/
├── index.html                    # land — HTML shell only, ~150 lines
├── robots.txt                    # SEO
├── _headers                      # Security + cache
├── _redirects                    # NEW — canonical domain, SPA fallback
│
├── seed/                         # FOUNDATIONAL — importable by all
│   ├── tokens.css                # Design tokens ONLY (colors, fonts, spacing, radius, shadows)
│   └── tokens.lint.json          # Allowed token list for deploy audit
│
├── tree/                         # REUSABLE — imports seed only
│   ├── base.css                  # Reset, body, nav, footer, section layouts
│   └── components.css            # All component styles (btn, card, modal, coupon, FAQ, stats, pricing, steps, features)
│
├── forest/                       # ORCHESTRATION — imports seed + tree
│   └── js/
│       ├── config.js             # Constants (CHECKOUT URLs, API base)
│       ├── main.js               # Entry — wires everything on DOMContentLoaded
│       ├── services/             # Business logic (NO DOM)
│       │   ├── coupon-service.js # validate + calculate prices
│       │   ├── checkout-service.js # NOWPayments URL routing
│       │   └── stats-service.js  # Live stats fetch
│       ├── controllers/          # DOM reads/writes (NO business logic)
│       │   ├── modal-controller.js # Activation modal show/hide/submit
│       │   ├── coupon-controller.js # Coupon input wiring
│       │   └── price-display.js  # Price DOM updates
│       └── utils/
│           ├── api.js            # fetch wrapper with error handling
│           └── format.js         # Currency formatting
│
└── assets/                       # Future: self-hosted fonts
```

## Layer Rules (Enforced)

| Layer | Can Import | Cannot Import |
|-------|-----------|---------------|
| **seed** (tokens.css) | Nothing | tree, forest, land |
| **tree** (base.css, components.css) | seed only | forest, land |
| **forest** (js/*) | seed + tree | Nothing from land |
| **land** (index.html) | seed + tree + forest | — |

**JS layer rules:**
- `config.js` → imports nothing
- `services/*` → imports config.js + utils/* (NO DOM)
- `controllers/*` → imports services/* (DOM only, no fetch)
- `main.js` → imports config + services + controllers (wires events)

## File Size Targets

| File | Target | Current |
|------|--------|---------|
| `index.html` | ~150 lines | 558 lines |
| `tokens.css` | ~220 lines | 250 lines (good) |
| `components.css` | ~130 lines | 0 (inline today) |
| `base.css` | ~40 lines | 0 (inline today) |
| Each JS module | ~30-60 lines | 198 lines (monolithic) |

## Phase Plan

### Phase 1: Extract seed layer (tokens.css audit)
- Audit tokens.css for component-level styles → move to components.css
- Add `tokens.lint.json` with all valid variable names
- Result: tokens.css contains ONLY design tokens

### Phase 2: Extract tree layer (CSS split)
- Create `base.css` — reset, nav, footer, section, container, responsive breakpoints
- Create `components.css` — btn, card, modal, coupon, FAQ, stats, pricing, steps, features, social-proof
- Remove all `<style>` from index.html, replace with `<link>` tags
- Remove all inline `style=""` attributes, replace with classes

### Phase 3: Extract forest layer (JS modules)
- Create `js/config.js` — CHECKOUT URLs, API base
- Create `js/utils/api.js` — fetch wrapper with `{ ok, data, error }` pattern
- Create `js/utils/format.js` — price formatting
- Create `js/services/coupon-service.js` — validate + calculate
- Create `js/services/checkout-service.js` — URL resolution
- Create `js/services/stats-service.js` — live stats fetch
- Create `js/controllers/modal-controller.js` — activation modal
- Create `js/controllers/coupon-controller.js` — coupon input
- Create `js/controllers/price-display.js` — price DOM updates
- Create `js/main.js` — entry point, wires all event listeners
- Result: 0 lines of inline `<script>`, replaced by `<script type="module" src="/forest/js/main.js">`

### Phase 4: Add _redirects
- Canonical www → apex redirect
- SPA fallback for dashboard

### Phase 5: Deploy + Verify
- Run deploy script (4 quality gates)
- All sections functional (NOWPayments, coupon, activation, stats, FAQ)
- CSP tightened (remove unsafe-eval if possible)
- Git SHA auto cache-buster in deploy script

## Business Logic Preservation (NON-NEGOTIABLE)

These MUST survive the refactor unchanged:
1. NOWPayments checkout URLs (3 tiers)
2. Coupon validation flow (validate → apply discount → update prices)
3. Activation modal (email + password → register → activate coupon)
4. Live stats fetch from `/api/public/stats`
5. Free access coupon path (coupon.freeAccess → modal instead of checkout)
6. All 10 HTML sections (Nav, Hero, Stats, How It Works, Features, Pricing+Coupon, Social Proof, FAQ, Modal, Footer)

## Verification Checklist

- [ ] `npm run deploy` passes all 4 quality gates
- [ ] `curl -sL <deploy-url>` returns HTTP 200
- [ ] tokens.css loaded with correct cache buster
- [ ] Coupon: enter "LAUNCH20" → prices update with 20% discount
- [ ] Checkout: click "Start Pro Trial" → redirects to NOWPayments
- [ ] Modal: free coupon → activation modal opens → email/password → registers
- [ ] Stats: live stats fetch populates stat values
- [ ] FAQ: all 4 items expandable
- [ ] Responsive: 375px, 768px, 1024px, 1440px
- [ ] CSP: no `unsafe-eval` needed
- [ ] Zero inline `<style>` blocks
- [ ] Zero inline `style=""` attributes
- [ ] Zero inline `<script>` blocks (except `type="module"` entry)
