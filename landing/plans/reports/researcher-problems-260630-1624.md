# Architectural Problems Report -- cashclaw.cc Landing Page

**Date:** 2026-06-30
**Scope:** Full source audit of `landing/src/` (index.html, tokens.css, _headers, robots.txt) + deploy script
**Files analyzed:** 5 source files, 1 shell script, 1 config file

---

## Executive Summary

The cashclaw.cc landing page has **two competing design systems** rendering one page. tokens.css (18,873 bytes) defines 54 CSS classes of which **36 are dead code** -- never used in the HTML body. The index.html `<style>` block (12,865 bytes) defines its own parallel system. The result is ~32KB of CSS for what should be <8KB of actual styling. 20% of CSS variables are unused. All 123 JS declarations use `var` (zero `let`/`const`). Payment IDs are hardcoded in client-side JS. 9 `innerHTML` assignments with API response data create XSS vectors.

---

## CRITICAL (will cause production failures or security incidents)

### C1. Dual Design Systems -- Two Competing CSS Layers

tokens.css and the inline `<style>` block define **completely different class names** for the same visual sections:

| Section | tokens.css uses | index.html `<style>` uses |
|---------|----------------|--------------------------|
| Hero | `.hero-section`, `.hero-grid`, `.hero-title` | `.hero` |
| Stats | `.stats-section`, `.stats-grid`, `.stat-value.accent` | `.stats-bar` |
| Features | `.features-grid` (3-col), `.feature-num`, `.features-section` | `.features-grid` (2-col) |
| Pricing | `.pricing-section`, `.pricing-table` (data table) | `.pricing-grid`, `.price-card` (cards) |
| CTA | `.cta-section`, `.cta-card` | Not present in body |
| Order Book | `.ob-section`, `.ob-panel`, `.ob-side` (entire component) | Not present in body |
| Ticker | `.ticker-bar`, `.ticker-item` | Not present in body |

**Consequence:** The page loads 18,873 bytes from tokens.css, then overrides/replaces almost all of it with 12,865 bytes from the `<style>` block. **36 of 54 classes (66%) in tokens.css are dead code** -- included in every page load but never rendered. This includes entire component systems (order book, ticker bar, CTA card, glitch text).

**Risk:** Dead code masks refactoring. A developer editing tokens.css may break subtle inherited styles they cannot see. The page load is ~20% heavier than needed.

### C2. NO `let` or `const` -- All 123 JS Declarations Use `var`

```
var: 123
let: 0
const: 0
```

No block scoping. All variables hoist to function scope. All callback variables leak. The IIFE at line 388 (`wireButtons()`) creates no privacy because everything inside it references globally-declared `CHECKOUT` and `activeCoupon`. The functions `formatPrice`, `updatePrices`, `showActivationModal`, `closeModal`, `submitActivation` are all global -- any script on the page can call or override them.

### C3. innerHTML With API Response Data (XSS Vectors)

9 `innerHTML` assignments in the script block. Lines 440-452 inject API response data directly into the DOM:

```js
msg.innerHTML = '<span style="color:var(--color-rose)">✗ ' + (data.reason || 'Invalid code') + '</span>';
```

The CSP in `_headers` allows `'unsafe-inline'` and `'unsafe-eval'` for scripts, so any malicious content from the coupon validation API or intercepted response becomes executable. The `updatePrices()` function (line 417) builds HTML strings with concatenated tier prices and coupon discounts -- less critical since values are numeric, but the pattern is dangerous.

### C4. Hardcoded Payment Credentials in Client-Side JS

Lines 360-362:
```js
var CHECKOUT = {
  STARTER: { url: "https://nowpayments.io/payment?iid=4725459350&sid=1563487829", price: 49 },
  PRO:     { url: "https://nowpayments.io/payment?iid=5493882802&sid=270466099",  price: 149 },
  ELITE:   { url: "https://nowpayments.io/payment?iid=5264305182&sid=1338018334", price: 499 }
};
```

These **iid** and **sid** parameters are NOWPayments identifiers. Anyone viewing page source can inspect, copy, or manipulate these. If they are secret credentials, they are exposed. If they are public payment links, then there is no server-side verification of which tier was purchased (the client creates the URL).

### C5. Fire-and-Forget Activation Call Silently Swallows Errors

Line 535-539:
```js
fetch('https://api.cashclaw.cc/api/coupons/activate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: email, tier: _activationTier, couponCode: activeCoupon ? activeCoupon.code : '', project: 'cashclaw' })
}).catch(function() {});
```

If this request fails (network error, server error, timeout), the **error is silently discarded**. The user sees "Account Created" in the UI but the backend never gets the activation. No retry, no user-visible error. The operator has no log of this failure.

### C6. No HTTPS-Enforced Registration Endpoint

The registration form sends `email` and `password` via `fetch('/api/auth/register', ...)`. The relative URL inherits the page's protocol. On a local preview (`file://` or `http://localhost`), credentials are sent **in cleartext**. There is no `https://` enforcement in the JS.

---

## HIGH (maintenance nightmare, structural debt)

### H1. 36 Unused CSS Classes (66% Dead Code)

Classes defined but never used in the HTML body:

```
btn-ghost, cta-card, cta-section, eyebrow, feature-num, features-section,
footer-copy, footer-grid, footer-links, glitch, hero-grid, hero-section,
hero-terminal, hero-title, mono, ob-header, ob-panel, ob-row, ob-section,
ob-side, ob-spread, ob-vis, pricing-section, pricing-table, section-subtitle,
section-title, sr-only, stats-grid, stats-section, terminal-dot, terminal-main,
terminal-prompt, terminal-row, terminal-title, ticker-bar, ticker-item
```

**36 of 54 classes defined in tokens.css (66%) are dead.** This includes entire components: order book panel (8 classes), ticker bar (2 classes), terminal widget (6 classes), hero alternate layout (6 classes), CTA section (2 classes).

### H2. 12 Unused CSS Variables (20%)

Defined in tokens.css, never `var()`-referenced in index.html:

```
--color-bg, --color-cyan, --color-emerald-glow, --color-purple,
--color-purple-dim, --color-surface, --ease-spring, --shadow-purple,
--signal-bear, --signal-bull, --space-24, --text-3xl
```

Some of these appear to be references for future use (e.g., `--signal-bull`/`--signal-bear` used in the order book component in tokens.css which is itself unused). They add to CSS size and confusion.

### H3. 25 Inline Style Attributes -- Repeated Patterns

25 inline `style="..."` attributes scattered through the HTML. The most egregious duplication:

- **Step card h3** (3 times): `style="font-family:var(--font-heading);font-size:var(--text-lg);font-weight:700;color:var(--text-primary);margin-bottom:var(--space-2)"` -- identical text repeated 3 times. Should be a CSS class.
- **Step/feature card p** (7 times): `style="font-size:var(--text-sm);color:var(--text-secondary);line-height:1.7"` -- repeated 7 times. Should be a CSS class.
- **CTA button width** (3 times): `style="width:100%;text-align:center;justify-content:center"` -- repeated on all 3 pricing buttons. Should be a CSS class.

**Total: 25 inline styles vs 110 class attributes (ratio 1:4.4).** Every inline style bypasses the CSS cascade and forces the browser to recalculate on every element.

### H4. No Build Step, Linting, or Validation

`package.json` `lint:*` scripts are TODOs:
```json
"lint:css": "echo 'TODO: stylelint src/'",
"lint:html": "echo 'TODO: htmlhint src/'"
```

No HTML validator, no CSS linter, no JS formatter. The deploy script checks CSS variable consistency (Gate 2) but does not validate:
- HTML syntax (missing closing tags, attribute errors)
- CSS syntax (invalid property values, undefined classes)
- JS syntax errors
- Broken anchor links (`#faq`, `#pricing` -- if renamed, no warning)
- Image/file existence

### H5. Accessibility Gaps

- **No `<main>` element** -- screen readers cannot skip directly to content
- **No `<header>` element** -- navigation is not semantically wrapped
- **4 inline SVGs** with no `<title>` or `<desc>` -- decorative only via `aria-hidden`
- **Password field** (line 340) with no autocomplete attribute -- browser cannot suggest password manager
- **No skip-to-content link** -- keyboard users must tab through entire nav
- **Only 4 `aria-*` attributes** across 558 lines -- minimal accessibility for a marketing page
- **Color contrast** not verified -- `var(--text-muted): #64748B` on `var(--color-bg): #060912` needs WCAG compliance check

### H6. Fragile DOM Coupling in JS

27 `document.getElementById()` calls and 2 `onclick=` DOM0 handlers. The JS assumes DOM element IDs never change. IDs like `price-starter`, `btn-pro`, `coupon-input`, `modal-tier` are hardcoded in both HTML and JS strings. Renaming an ID silently breaks functionality.

The coupon JS at line 422-470 has **5 separate DOM queries** for the same 3 elements (`coupon-input`, `coupon-apply-btn`, `coupon-message`) -- cached in closures but queried repeatedly across different scope boundaries.

---

## MEDIUM (quality/devex concerns)

### M1. Deprecated CSP With `unsafe-inline` and `unsafe-eval`

```http
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; ...
```

`unsafe-inline` is required because all JS is inline. `unsafe-eval` appears to be unused but is allowed. This means any XSS vulnerability (like the `innerHTML` injection in C3) allows arbitrary code execution. Modern best practice: use nonces or hashes for inline scripts.

### M2. No Responsive Breakpoint Coverage

Only 2 breakpoints: 768px and 480px. Missing:
- 1024px tablet landscape (layout shifts directly from desktop to mobile)
- 375px / 320px small phones (480px may still overflow on iPhone SE)

### M3. Duplicated Section Name Patterns

CSS comments in `<style>` use `══════════` separators but 2 sections use `════════════` (12 chars vs 8 chars). Inconsistent formatting adds visual noise with no structural value.

### M4. No FOUT/FOFT Handling

Google Fonts loaded via `<link>` with no `font-display: swap` or font loading strategy. Users on slow connections may see invisible text until fonts download (FOUT). The `Cabinet Grotesk` font is a variable font loaded without `axes` specification.

### M5. Deploy Script CSS Gate Is Incomplete

Gate 2 (line 32-39) checks that all `var(--xxx)` in HTML exist in tokens.css. It does NOT check:
- The reverse -- unused variables in tokens.css
- Unused CSS classes (the 36-class dead code problem)
- CSS rules in `<style>` tag that override/conflict with tokens.css
- CSS syntax validity

### M6. No Cookie/Storage Handling

The JS never reads or writes cookies, localStorage, or sessionStorage. If the user applies a coupon code and refreshes the page, the discount is lost. No session persistence for pricing selections.

### M7. `scroll-behavior: smooth` Without `prefers-reduced-motion` Scoping

Line 62 of tokens.css: `html{scroll-behavior:smooth}` is global. While line 248 has a `prefers-reduced-motion:reduce` rule, it targets `animation/transition`, not scroll behavior. Users who prefer reduced motion still get smooth scrolling.

---

## Summary Metrics Table

| Category | Count |
|----------|-------|
| Total files deployed | 4 (`index.html`, `tokens.css`, `_headers`, `robots.txt`) |
| HTML file size | 35,191 bytes / 558 lines |
| CSS size (tokens.css + style block) | 31,738 bytes / 367 lines |
| JS size (inline script) | 8,310 bytes / 199 lines |
| CSS classes defined | 54 |
| CSS classes actually used | 19 (34%) |
| CSS classes dead | 36 (66%) |
| CSS variables defined | 61 |
| CSS variables used | 49 |
| CSS variables unused | 12 (20%) |
| Inline styles | 25 |
| Class attributes | 110 |
| Ratio inline:class | 1:4.4 |
| Hardcoded hex colors | 19 (17 in tokens.css, 2 in style block) |
| Hardcoded rgba/hsla | 7 |
| Hardcoded px values | 25 |
| `var` declarations (JS) | 123 |
| `let` / `const` | 0 / 0 |
| `innerHTML` usages | 9 |
| Hardcoded API paths | 4 |
| Hardcoded payment URLs | 3 |
| `onclick=` DOM0 handlers | 2 |
| Semantic `main` elements | 0 |
| Semantic `header` elements | 0 |
| `<img>` tags | 0 (icons are SVG) |
| Breakpoints | 2 (768px, 480px) |
| Linting configured | 0 (both are TODOs) |

---

## Ranked Recommendations

1. **Eliminate the dual design system.** Choose ONE set of class names. Delete the 36 dead classes from tokens.css. Move component styles used by the page either into tokens.css or a single component CSS file. Dead CSS removal alone saves ~40% of CSS weight.

2. **Replace all `var` with `let`/`const`.** Modernize the 123 variable declarations. This is a mechanical find-replace that eliminates hoisting bugs and improves scope safety.

3. **Replace `innerHTML` with `textContent` for user-facing messages.** The coupon message display (8 assignments) and error messages should use `textContent` to prevent XSS. Only the pricing HTML (price display with spans) legitimately needs `innerHTML`.

4. **Validate and sanitize API response data before DOM insertion.** Even for `innerHTML` on pricing strings, ensure coupon/API data passes through a DOM sanitizer or simple escaping.

5. **Move NowPayments payment links to environment-configurable constants or a server endpoint.** Hardcoded payment IDs in client JS are exfiltrable and non-rotateable without redeploy.

6. **Deduplicate the 25 inline styles into CSS classes.** The 3 repeating patterns (step h3, step/feature p, CTA button width) cover 13 of 25 inline styles.

7. **Add nonce-based CSP and remove `unsafe-inline`/`unsafe-eval`.** This requires restructuring the inline script into an external file with a hash-based CSP, but it eliminates the XSS amplification risk.

8. **Add `<main>` and `<header>` semantic elements** for screen reader navigation.

9. **Configure stylelint and htmlhint** (or equivalent) in the deploy script, not as TODOs.

10. **Add a 1024px breakpoint** between desktop layout and 768px collapse.

---

## Unresolved Questions

- Are the NOWPayments `iid` and `sid` values intended to be public? If so, what verifies that a user paid for the correct tier?
- Who maintains tokens.css? The dead code suggests it was written for a v3 redesign that was partially adopted but never completed.
- Does `/api/auth/register` accept credentials over HTTP in production, or does the CF worker enforce HTTPS redirect?
- Is the `https://api.cashclaw.cc` endpoint for coupon activation a separate service from `cashclaw.cc`? The domain mismatch suggests a different deploy target.
- Why does the coupon validation go to `/api/coupons/validate` (relative) but activation goes to `https://api.cashclaw.cc/api/coupons/activate` (absolute)? Inconsistent endpoint routing.
- What is the relationship between `--space-7` and the space scale? `--space-1` to `--space-6` and `--space-8`, `--space-10`, `--space-12`, `--space-16`, `--space-20`, `--space-24` follow a pattern, but `--space-7` breaks the sequence.
