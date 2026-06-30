# Research Report: Static HTML/CSS/JS Site Architecture for Cloudflare Pages

**Date:** 2026-06-30
**Project:** cashclaw.cc — AI Prediction Market Terminal
**Context:** Single-page SaaS landing page with payment checkout, coupon validation, user activation, live stats, FAQ, pricing. No framework, no build step, deployed to CF Pages direct upload.

---

## 1. Architecture for Static Sites with Business Logic

### Current State (Monolith)
`index.html` is ~560 lines: HTML + inline `<style>` + inline `<script>`. All business logic (coupon validation, checkout routing, stats fetch, activation modal) lives in one script block. This works at small scale but introduces risks as features grow.

### Recommended: File-Based Modular Split

Split the monolith into a flat file tree — no build step, no bundler, just native ES modules and CSS `@import`.

```
src/
├── index.html                    # Main entry — layout shell, no inline logic
├── nav.html                      # (optional) SSI-style component via fetch
├── robots.txt
├── _headers
├── _redirects                    # (NEW) SPA routing, canonical redirects
├── ui/
│   ├── design-system/
│   │   ├── tokens.css            # Design tokens (already exists)
│   │   ├── base.css              # Reset, global styles
│   │   └── tokens.lint.json      # (NEW) Allowed var() list for CI audit
│   ├── components/
│   │   ├── btn.css               # Button variants
│   │   ├── modal.css             # Activation modal styles
│   │   ├── coupon.css            # Coupon section styles
│   │   ├── pricing.css           # Pricing table styles
│   │   └── stats.css             # Stats bar styles
│   └── layout.css                # Nav, footer, container
├── js/
│   ├── main.js                   # Entry point (type="module")
│   ├── services/
│   │   ├── coupon-service.js     # Coupon API logic
│   │   ├── checkout-service.js   # NOWPayments URL routing
│   │   └── stats-service.js      # Live stats fetch
│   ├── ui/
│   │   ├── modal-controller.js   # Activation modal DOM logic
│   │   ├── stats-controller.js   # Stats bar update
│   │   └── price-display.js      # Price formatting + update
│   ├── utils/
│   │   ├── api.js                # fetch wrapper with error handling
│   │   └── format.js             # Currency formatting
│   └── config.js                 # CHECKOUT URLs, API base URL
└── assets/
    └── fonts/                    # (future) self-hosted fallbacks
```

### Key Decisions
- **`<script type="module">`** — defer-loaded by default, no blocking, built-in `import`/`export`, works in all modern browsers (94%+ global support).
- **No bundler** — each `import` creates an HTTP request. For a landing page with 5-8 modules, this is acceptable. If module count exceeds ~12, consider a build step (Vite, esbuild) for bundling.
- **CSS `@import` in tokens.css** — tokens.css imports component CSS files. Trade-off: more HTTP requests vs. one monolithic file. The current approach (single `<link>` to tokens.css with everything concatenated) is actually simpler for now given CF CDN. Recommend keeping the single-file approach until component count justifies splitting.

### Anti-Patterns to Avoid
- **IIFE-based "namespacing"** (e.g., `var App = App || {}`) — unnecessary with ES modules
- **Copy-paste JS into every HTML page** — use `type="module"` imports
- **Loading entire library for one feature** (e.g., axios just for fetch)
- **Build step for a 5-module app** — YAGNI

---

## 2. Design Token Architecture

### Current Assessment
`tokens.css` already implements a solid two-tier system (primitives → semantic), ~220 lines. This is good. Key observations:

| Aspect | Current State | Verdict |
|--------|--------------|---------|
| Raw color values | All in `:root` as `--color-*` | Correct |
| No raw hex in HTML | Enforced by code standards | Correct |
| Semantic naming | Some mixed (e.g. `--color-emerald` is semantic, `--color-gold-glow` is effect) | Minor issue |
| Typography scale | `--text-hero` through `--text-xs` | Good |
| Spacing scale | 4px base: `--space-1` through `--space-24` | Good |
| Gap in naming | Some component-level tokens inline (e.g., `.modal-box` uses hardcoded `90%`) | Minor |

### Recommended: Two-Tier with Optional Third Tier

For a static landing page (not a design system for multiple products), two tiers are sufficient:

**Tier 1 — Primitives** (raw values, rarely change):
```css
:root {
  --color-gold-raw: #F59E0B;
  --color-gold-bright-raw: #FBBF24;
  --color-bg-raw: #060912;
  /* etc. */
}
```

**Tier 2 — Semantic** (contextual usage):
```css
:root {
  --color-primary: var(--color-gold-raw);
  --color-bg-page: var(--color-bg-raw);
  --color-text-heading: var(--color-text-primary-v3);
  --color-signal-bull: var(--color-emerald-raw);
}
```

**Tier 3 — Component** (optional, add only when a component needs overriding):
```css
.modal-box {
  --modal-bg: var(--color-bg-card);
  --modal-radius: var(--radius-xl);
  --modal-padding: var(--space-8);
}
```

### Specific Recommendations for cashclaw.cc

1. **Rename effect tokens** to semantic purpose, not visual description:
   - `--shadow-gold` → `--shadow-highlight` (describes function, not color)
   - `--color-gold-glow` → `--color-glow-primary`

2. **Add `tokens.lint.json`** — a JSON file listing every valid `--xxx` variable. The deploy script's CSS variable audit (`Gate 2`) could read this instead of parsing tokens.css, making it more reliable:

```json
{
  "allowedTokens": [
    "--color-bg", "--color-bg-elevated", "--text-primary", ...
  ],
  "categories": ["color-", "text-", "font-", "space-", "radius-", "shadow-", "duration-", "ease-"]
}
```

3. **Keep tokens.css under 300 lines** — current ~220 lines is fine. The file does not need splitting yet.

### Sources

- W3C Design Tokens Community Group stable spec (October 2025): [dtcg-w3c](https://www.w3.org/community/design-tokens/)
- Three-tier aliased architecture used by Salesforce SLDS, IBM Carbon, Google Material Design
- Penpot guide: [developer-guide](https://penpot.app/blog/the-developers-guide-to-design-tokens-and-css-variables/)

---

## 3. Component Organization for Static HTML

### Current State
All component CSS is inline in `<style>` blocks in `index.html`. Components are identified by comment separators (`/* ═════════ BUTTONS ═════════ */`). This works for a single-page site but makes it impossible to reuse a component across pages without copying.

### Recommended: BEM-Inspired Naming + Content-Based Selectors

Since there is no Shadow DOM (too much overhead for a landing page), use **progressive enhancement** naming:

```
.block__element--modifier
```

Applied to current codebase:
- `.btn` (not `.btn-primary`, `.btn-ghost` — keep these)
- `.price-card` (not `.price-card--popular` — already exists, good)
- `.stat-card` (already good)
- `.feature-card` (already good)

### Component File Organization (for multi-page future)

If the site ever grows beyond one page:

```
ui/components/
├── btn.css               # All button variants
├── card.css               # Generic card patterns
├── modal.css              # Activation modal
├── pricing-table.css      # Pricing table + rows
├── coupon.css             # Couron apply section
├── stats-bar.css          # Stats grid
├── terminal-widget.css     # Hero terminal
├── ticker-bar.css          # Ticker strip
├── faq-item.css            # FAQ accordion
├── nav.css                 # Navigation bar
└── social-proof.css        # Testimonial section
```

Each file contains: component styles + BEM modifiers + responsive breakpoints for that component.

### Section-Level Organization (for single-page)

Even without splitting into files, organize the single `<style>` block by **content type**, not visual order:

```
/* ════════ GLOBAL ════════ */    — resets, body, fonts
/* ════════ TOKENS ════════ */    — tokens.css already handles this
/* ════════ LAYOUT ════════ */    — .container, .section
/* ════════ COMPONENTS ════════ */
  /* ── nav ── */
  /* ── hero ── */
  /* ── stats ── */
  /* ── features ── */
  /* ── pricing ── */
  /* ── coupon ── */
  /* ── modal ── */
  /* ── footer ── */
/* ════════ RESPONSIVE ════════ */ — all breakpoints at bottom
/* ════════ ACCESSIBILITY ════════ */ — prefers-reduced-motion, :focus-visible
```

### Anti-Patterns to Avoid

- **Shadow DOM for everything** — costly overhead for a marketing page. Reserve for truly isolated widgets (e.g., embedded terminal)
- **CSS-in-JS** — adds a JS library dependency to gain nothing that CSS custom properties don't already solve
- **Tailwind-style utility classes** (`p-4`, `text-lg`) without a build step — verbose HTML, hard to maintain
- **Nesting >4 levels** — `var(--space-8)` referenced inline is cleaner than `.card .body .content .title { padding: var(--space-8) }`

---

## 4. JavaScript Organization

### Current State
All JS is in one inline `<script>` block: coupon logic, checkout routing, stats fetch, activation modal. Monolithic — ~200 lines, no module separation, all global.

### Recommended: Layer Separation

```
js/
├── config.js              # Static configuration
├── main.js                # Bootstrap / entry point
├── services/              # Business logic (no DOM manipulation)
│   ├── coupon-service.js
│   ├── checkout-service.js
│   └── stats-service.js
├── controllers/           # UI logic (DOM reads/writes)
│   ├── modal-controller.js
│   ├── price-display.js
│   └── coupon-controller.js
└── utils/                 # Pure helpers
    ├── api.js
    └── format.js
```

### Separation Principle

| Layer | Knows about | Does |
|-------|------------|------|
| `config.js` | Nothing | Exports constants (API base URL, CHECKOUT URLs) |
| `services/*` | Config + API | Fetches data, validates, returns structured responses |
| `controllers/*` | DOM + Services | Reads inputs, calls services, updates DOM |
| `main.js` | Everything | Wires event listeners, initializes controllers |
| `utils/*` | Nothing | Pure functions (currency formatting, validation) |

### Specific Refactoring Plan

**`config.js`** — move CHECKOUT URLs and constants here:
```js
export const CHECKOUT = {
  STARTER: { url: "...", price: 49 },
  PRO:     { url: "...", price: 149 },
  ELITE:   { url: "...", price: 499 }
};
export const API_BASE = window.location.origin;
```

**`services/coupon-service.js`** — pure business logic:
```js
export async function validateCoupon(code) { /* fetch POST + return { valid, discountPercent, ... } */ }
export function calculatePrice(originalPrice, coupon) { /* apply discount */ }
```

**`services/checkout-service.js`** — redirect logic:
```js
export function getCheckoutUrl(tier, coupon) { /* resolve URL or null (free) */ }
```

**`controllers/modal-controller.js`** — DOM interactions:
```js
export function showActivationModal(tier) { /* DOM manipulation */ }
export function closeModal() { /* DOM manipulation */ }
export async function submitActivation(email, password, tier) { /* call API, update DOM */ }
```

**`controllers/coupon-controller.js`** — wire coupon input to service:
```js
export function initCouponUI(inputEl, applyBtnEl, messageEl) {
  // wire up click + keydown events, call coupon-service
}
```

**`main.js`** — entry point:
```js
import { initCouponUI } from './controllers/coupon-controller.js';
import { initPricingUI } from './controllers/price-display.js';
import { initStats } from './controllers/stats-controller.js';

document.addEventListener('DOMContentLoaded', () => {
  initCouponUI(
    document.getElementById('coupon-input'),
    document.getElementById('coupon-apply-btn'),
    document.getElementById('coupon-message')
  );
  initStats();
  initPricingUI();
});
```

### Error Handling Pattern

Every service function returns `{ ok: true, data }` or `{ ok: false, error: string }`. Controllers check `.ok` before touching the DOM. This keeps UI logic out of service layers.

### Anti-Patterns to Avoid

- **jQuery-style DOM soup** — `$('#foo').on('click', ...)` inside a fetch callback
- **Anonymous IIFE globals** — `window.couponState = ...` pollutes global scope
- **Mixing fetch and DOM update in same function** — services return data, controllers handle DOM
- **try/catch swallowing errors silently** — always surface to user or at minimum log

---

## 5. Cloudflare Pages Optimization

### Current State Assessment

| Area | Status | Verdict |
|------|--------|---------|
| `_headers` | Present, 20 lines | Good — HSTS, CSP, X-Frame-Options, Permissions-Policy all set |
| Cache strategy | `/ui/*` immutable 1y, `/*.html` no-cache | Good |
| `_redirects` | Not present | Missing — need for SPA routing to dashboard |
| Asset hashing | Manual `?v=N` cache buster | Acceptable but fragile |
| CSP | Includes `'unsafe-inline'` and `'unsafe-eval'` | Acceptable for static site (no CSP bypass risk with trusted scripts) |
| `robots.txt` | Present | Good |

### Recommendations

**1. Add `_redirects` for SPA fallback and canonical URLs:**

```
# Canonical domain — redirect www to apex
https://www.cashclaw.cc/*  https://cashclaw.cc/:splat  301

# SPA rewrite — dashboard uses client-side routing
/dashboard/*  /dashboard/index.html  200

# Ensure trailing slash doesn't break
/coupon/:code  /?coupon=:code  302

# SEO — noindex staging/preview
*  X-Robots-Tag: noindex
```

**Important:** `_redirects` rules are evaluated top-to-bottom. Place specific rules before generic ones.

**2. Add `_redirects` for UTM/link tracking passthrough (if needed).**

**3. Consider adding a `_headers` entry for preview domains:**

```
https://*.algo-trader.pages.dev/*
  X-Robots-Tag: noindex, nofollow
```

**4. CSP hardening opportunities:**

Current CSP is permissive (`script-src 'self' 'unsafe-inline' 'unsafe-eval'`). For a static site that does not use eval:
```http
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; ...
```

Drop `'unsafe-eval'` — NOWPayments checkout and the API calls (`/api/coupons/validate`, `/api/public/stats`, `/api/auth/register`) use JSON.parse or fetch, which do not require eval. Only keep if a library explicitly needs it.

**5. Asset hash automation (optional improvement):**

Instead of manual `?v=N` bumps, use git commit hash as cache buster in deploy script:
```bash
CACHE_BUSTER=$(git rev-parse --short HEAD)
sed -i '' "s/tokens.css?v=[a-f0-9]*/tokens.css?v=$CACHE_BUSTER/" src/index.html
```

This ensures every deploy automatically busts the CDN cache. Add to `deploy-cf-pages.sh`.

### Cache Decision Flow

```
Is it /ui/* or /assets/*?
  → YES: Cache-Control: public, max-age=31536000, immutable
  → NO: Is it *.html?
    → YES: Cache-Control: no-cache, no-store, must-revalidate
    → NO: Is it /api/* or /_next/*?
      → Let CF Pages Functions handle (dynamic)
      → Else: Default CF cache (usually respecting origin headers)
```

Current config already implements this correctly. No change needed.

### Sources

- Cloudflare Pages official docs: [Serving Pages](https://c98050e0-cloudflare-docs.cloudflare-docs.workers.dev/pages/configuration/serving-pages/)
- CF Pages custom headers guide: [Add custom HTTP headers](https://c98050e0-cloudflare-docs.cloudflare-docs.workers.dev/pages/how-to/add-custom-http-headers/)
- Cloudflare Cache Rules optimization (May 2025): [kenwagatsuma.com](https://kenwagatsuma.com/blog/blog-cache-rules-optimisation)

---

## 6. Applying Sophia's seed/tree/forest/land Architecture to a Static Site

### The Sophia Model (Simplified)

| Layer | Purpose | Import Rule |
|-------|---------|------------|
| **seed** | Foundational primitives | Importable by all layers |
| **tree** | Reusable domain logic | Imports seed only |
| **forest** | Orchestrators / workflows | Imports seed + tree (+ may call land) |
| **land** | Business workflows / pages | Imports seed + tree + forest |

### Static Site Adaptation

The same layered dependency principle applies, just mapped to CSS and JS files:

```
seed (tokens.css, fonts, reset)
  └── tree (component CSS, utility classes)
        └── forest (JS controllers that orchestrate components)
              └── land (page-specific HTML + layout)
```

### Concrete Mapping for cashclaw.cc

| Sophia Layer | Static Site Analogue | Files | Dependency Rule |
|---|---|---|---|
| **seed** | Design tokens, base styles, config | `tokens.css`, `config.js`, `utils/` | Importable by everything |
| **tree** | Reusable components & services | `ui/components/*.css`, `js/services/*.js` | Imports seed only |
| **forest** | Controllers & orchestrators | `js/controllers/*.js` | Imports seed + tree |
| **land** | Page-specific | `index.html` (layout/HTML only) | Imports seed + tree + forest |

### Why This Works Here

1. **One-way dependency** — `services/coupon-service.js` imports `config.js` (seed), not `modal-controller.js` (forest). Prevents circular imports.
2. **Testability** — services can be tested in isolation (they know nothing about DOM).
3. **Reusability** — if a dashboard page needs coupon validation, it imports the same `coupon-service.js`.
4. **Clarity** — new developers can reason about dependencies by file path: `js/services/` is business logic, `js/controllers/` is UI.

### Anti-Pattern (What Not To Do)

```
// BAD — controller imports another controller
import { showModal } from '../controllers/modal-controller.js';
    ↓
// GOOD — both controllers import from services
import { validateCoupon } from '../services/coupon-service.js';
```

Controllers should not import other controllers — if they share logic, extract it to a service.

---

## Directory Structure Recommendation (Final)

```
landing/src/
  index.html              # Entry — layout shell, <link> to CSS, <script type="module"> to JS
  robots.txt              # SEO
  _headers                # Security + cache headers
  _redirects              # (NEW) SPA routing, canonical redirects

  ui/
    design-system/
      tokens.css           # All design tokens (EXISTING — keep as-is)
      tokens.lint.json     # (NEW) Allowed token list for CI audit
    components/            # (NEW — for future multi-page)
      btn.css
      modal.css
      coupon.css
      pricing.css
      stats.css

    layout.css             # (NEW — nav, footer, container, section patterns)

  js/
    main.js                # Entry — wires everything up
    config.js              # Constants — CHECKOUT URLs, API base
    services/
      coupon-service.js    # Coupon validation API
      checkout-service.js  # NOWPayments URL routing
      stats-service.js     # Live stats fetch
    controllers/
      modal-controller.js  # Activation modal DOM
      price-display.js     # Price formatting + update
      coupon-controller.js # Coupon input wiring
      stats-controller.js  # Stats bar update
    utils/
      api.js               # fetch wrapper
      format.js            # Currency, date helpers

  assets/
    images/                # (future) Static images
    fonts/                 # (future) Self-hosted font fallbacks
```

### File Count Impact

- **Current:** 4 files (index.html, tokens.css, _headers, robots.txt)
- **Proposed (full split):** ~18 files
- **Recommended for immediate next step:** 8 files (extract JS into modules first, keep CSS monolithic)

Start with JS extraction only (highest maintainability gain per file created). CSS splitting is optional until the single-page grows to multiple pages.

---

## Summary: Ranked Recommendations

| Priority | Change | Effort | Impact | Rationale |
|----------|--------|--------|--------|-----------|
| 1 | Extract inline JS to ES modules | 1-2h | High | Enables testing, prevents global pollution, separates concerns |
| 2 | Remove `'unsafe-eval'` from CSP | 5min | Medium | Simple security hardening, zero functional impact |
| 3 | Add `_redirects` for domain/SESEO/Passthrough | 15min | Medium | Prevents canonical domain issues, enables SPA routing |
| 4 | Add git SHA as auto cache-buster in deploy script | 15min | Medium | Eliminates manual `?v=N` bumps | 
| 5 | Add `tokens.lint.json` for CI | 10min | Low | More reliable CSS variable audit in deploy gates |
| 6 | Split component CSS into individual files | 1h | Low | Only needed if multi-page site emerges |
| 7 | Rename effect tokens to semantic purpose | 30min | Low | Design hygiene, no functional change |

---

## Unresolved Questions

1. **NOWPayments CSP requirement** — Does the NOWPayments checkout redirect require any specific `connect-src` or `frame-src` directives? Need to verify if adding the redirect URL to CSP allows removing `'unsafe-inline'` from script-src.
2. **`/api/*` routing** — The current site calls `/api/coupons/validate`, `/api/public/stats`, `/api/auth/register`. Are these served by Cloudflare Pages Functions, a separate Worker, or an external server? This affects whether CSP needs additional `connect-src` entries.
3. **Multi-page future** — Is there a plan to add more pages (e.g., `/blog`, `/docs`, `/terms`)? If yes, component CSS splitting becomes higher priority.
4. **Browser support target** — Are IE11 or very old Safari versions in the audience? If so, ES modules may need a fallback or a build step.
