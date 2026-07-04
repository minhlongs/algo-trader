---
phase: 1
title: Token Layer
status: completed
priority: P1
dependencies: []
---

# Phase 1: Token Layer

## Overview

Create the canonical design system token source and propagate to both frontends. This is the foundation — everything else depends on it.

## Requirements

- Functional: Create `design-system/tokens.json` as single source of truth
- Functional: Generate `tokens.css` CSS custom properties for landing page
- Functional: Update dashboard `tailwind.config.ts` to consume canonical tokens
- Functional: Update landing `tokens.css` to align with canonical
- Non-functional: Zero visual regressions on existing pages
- Non-functional: All builds must pass

## Architecture

```
algo-trader/
├── design-system/                     # NEW — shared token source
│   ├── tokens.json                    # Canonical JSON token file
│   └── tokens.css                     # CSS custom properties (for landing)
│
├── landing/src/seed/tokens.css        # MODIFY — replace with @import from design-system/tokens.css
│
└── dashboard/
    ├── tailwind.config.ts             # MODIFY — use design-system/tokens.json values
    └── src/index.css                  # MODIFY — font imports, token references
```

## Related Code Files

- Create: `design-system/tokens.json`
- Create: `design-system/tokens.css`
- Modify: `landing/src/seed/tokens.css`
- Modify: `dashboard/tailwind.config.ts`
- Modify: `dashboard/src/index.css`

## Implementation Steps

### Step 1: Create `design-system/tokens.json`

Canonical token values from ui-ux-pro-max recommendation:

```json
{
  "$schema": "./tokens-schema.json",
  "colors": {
    "primary": "#F59E0B"   (Gold — trust, wealth)
    "secondary": "#8B5CF6"  (Purple — tech, AI)
    "positive": "#34D399"   (Emerald — profit, bull)
    "negative": "#EF4444"   (Red — loss, bear)
    "bg": {
      "base": "#060912"     (Deep navy — landing's current value)
      "surface": "#0F172A"  (Card background)
      "border": "#1E293B"   (Borders)
    }
    "text": {
      "primary": "#F8FAFC"
      "secondary": "#CBD5E1"
      "muted": "#64748B"
    }
  }
  "fonts": {
    "display": "'Calistoga', serif"
    "body": "'Inter', system-ui, sans-serif"
    "mono": "'JetBrains Mono', 'Fira Code', monospace"
  }
  "spacing": { "base": 4, "scale": [4, 8, 12, 16, 20, 24, 32, 40, 48, 64] }
  "radius": { "sm": 4, "md": 8, "lg": 14, "xl": 20, "full": 9999 }
}
```

### Step 2: Create `design-system/tokens.css`

CSS custom properties mirroring tokens.json, for the static landing page:

```css
:root {
  --color-primary: #F59E0B;
  --color-secondary: #8B5CF6;
  --color-positive: #34D399;
  --color-negative: #EF4444;
  --color-bg-base: #060912;
  --color-bg-surface: #0F172A;
  --color-bg-border: #1E293B;
  --color-text-primary: #F8FAFC;
  --color-text-secondary: #CBD5E1;
  --color-text-muted: #64748B;
  --font-display: 'Calistoga', serif;
  --font-body: 'Inter', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 14px;
  --radius-xl: 20px;
  --space-unit: 4px;
}
```

### Step 3: Update `dashboard/tailwind.config.ts`

Key changes:
- `accent: '#00C8E8'` → `accent: '#F59E0B'`
- Add `gold: '#F59E0B'` (align)
- Add `purple: '#8B5CF6'` (new)
- `bg.DEFAULT` → `'#060912'` (unify)
- `bg.surface` → `'#0F172A'`
- `bg.border` → `'#1E293B'`
- `muted` → `'#64748B'`
- `profit` → keep `'#34D399'`
- `loss` → keep `'#EF4444'`
- Add `fontFamily.display: ['Calistoga', 'serif']`
- Swap `fontFamily.sans` from Geist to Inter: `['Inter', 'system-ui', 'sans-serif']`

### Step 4: Update `dashboard/src/index.css`

Change font imports from Geist + JetBrains Mono to Inter + Calistoga + JetBrains Mono:

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Calistoga&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
```

### Step 5: Update `landing/src/seed/tokens.css`

Align with canonical tokens.json. Key changes:
- Keep `#F59E0B` gold (already matches)
- Change font: DM Sans → Inter, Cabinet Grotesk → Calistoga for display
- Change `--color-bg-elevated` → align surface/border values
- Add `--color-secondary: #8B5CF6` (purple)
- Ensure all variable names match `design-system/tokens.css`

### Step 6: Build verification

- `cd dashboard && npm run build` — 0 TypeScript errors
- `cd landing && ./scripts/deploy-cf-pages.sh` — smoke test OK

## Success Criteria

- [ ] `design-system/tokens.json` exists with all canonical values
- [ ] `design-system/tokens.css` exists with matching CSS vars
- [ ] Dashboard tailwind.config.ts has gold `#F59E0B` accent, no `#00C8E8`
- [ ] Dashboard index.css imports Inter + Calistoga
- [ ] Landing tokens.css aligns with canonical tokens
- [ ] `npm run build` passes in both dashboard and landing
- [ ] `grep '#00C8E8' dashboard/tailwind.config.ts` returns empty

## Risk Assessment

- Font swap may shift text width — use system-ui fallback, test at 375px/768px/1440px
- Landing page deploy unaffected — quality gates run before deploy
