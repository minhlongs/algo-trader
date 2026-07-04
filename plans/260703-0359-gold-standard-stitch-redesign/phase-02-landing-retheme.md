---
phase: 2
title: Landing Retheme
status: completed
priority: P1
dependencies:
  - 1
---

# Phase 2: Landing Retheme

## Overview

Update the cashclaw.cc static landing page to fully align with the unified gold design system. Font swap (DM Sans→Inter, Cabinet Grotesk→Calistoga), color alignment, purple secondary accent. Minimum changes — landing already uses gold as its primary.

## Requirements

- Functional: Landing page uses all canonical token values from Phase 1
- Functional: Font swap applied: Inter for body, Calistoga for display
- Functional: Purple `#8B5CF6` secondary accent added where appropriate
- Non-functional: All 5 landing deploy quality gates pass
- Non-functional: NOWPayments checkout flow unbroken
- Non-functional: Coupon validation flow unbroken
- Non-functional: CSP `script-src 'self'` preserved
- Non-functional: CF CDN cache headers preserved

## Protected Flows (NON-NEGOTIABLE)

These MUST survive the retheme unchanged:
1. NOWPayments checkout URLs (3 tiers: Starter/Pro/Elite)
2. Coupon validation flow (validate → apply discount → update prices)
3. Activation modal (email + password → register → activate coupon)
4. Live stats fetch from `/api/public/stats`
5. Free access coupon path (coupon.freeAccess → modal instead of checkout)
6. CSP `script-src 'self'` only (no unsafe-inline, no unsafe-eval)

## Related Code Files

- Modify: `landing/src/seed/tokens.css` — align with canonical
- Modify: `landing/src/tree/base.css` — update font references and layout colors
- Modify: `landing/src/tree/components.css` — update component colors to gold/purple
- Modify: `landing/src/forest/js/config.js` — update hardcoded colors if any
- Modify: `landing/src/index.html` — update font link URLs (Calistoga + Inter)
- No new files needed

## Implementation Steps

### Step 1: Update HTML font links

In `landing/src/index.html`, replace the Google Fonts link:
- Remove Cabinet Grotesk + DM Sans
- Add Calistoga + Inter + JetBrains Mono (JetBrains already there)

```html
<link href="https://fonts.googleapis.com/css2?family=Calistoga&family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
```

### Step 2: Update tokens.css

Already handled in Phase 1 Step 5. Ensure:
- Font variables point to Inter (body) and Calistoga (display)
- All color values match canonical tokens
- Purple secondary accent added

### Step 3: Update base.css

Replace font-family references:
- `--font-heading` → uses `--font-display` (Calistoga)
- `--font-body` → uses `--font-body` (Inter)
- `--font-mono` stays JetBrains Mono

### Step 4: Update components.css

Update component styling to use purple secondary:
- Badges, code blocks, secondary CTAs → purple tint where appropriate
- Review all color references for alignment

### Step 5: Verify protected flows

- Open landing in browser
- Click pricing CTA → should redirect to NOWPayments checkout
- Enter coupon code → should apply discount
- Click "Open Terminal" → should navigate to dashboard URL
- Stats section should load live data

### Step 6: Deploy to CF Pages

```bash
cd landing
./scripts/deploy-cf-pages.sh
```

## Success Criteria

- [ ] Landing page loads with Inter + Calistoga fonts
- [ ] All colors match canonical tokens (gold primary, purple secondary)
- [ ] No remaining DM Sans or Cabinet Grotesk references
- [ ] `./scripts/deploy-cf-pages.sh` exits 0
- [ ] Landing page health check passes (all 5 quality gates)
- [ ] NOWPayments checkout flow works end-to-end
- [ ] Coupon validation flow works
- [ ] Activation modal renders correctly
- [ ] `grep -r 'unsafe-inline\|unsafe-eval' landing/src/` returns empty (in CSP)

## Risk Assessment

- Font change affects perceived load time — Google Fonts CDN, Inter + Calistoga are well-cached
- CF Pages deploy may have CDN propagation delay — cache-bust via deploy reports
