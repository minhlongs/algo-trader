---
phase: 3
title: Dashboard Retheme
status: completed
priority: P1
dependencies:
  - 1
---

# Phase 3: Dashboard Retheme

## Overview

Swap the dashboard's entire color system from cyan `#00C8E8` → gold `#F59E0B` + purple `#8B5CF6`. Font swap Geist → Inter + Calistoga. Tailwind config is the single touchpoint; everything else cascades from it.

## Requirements

- Functional: Dashboard Tailwind config uses gold `#F59E0B` as `accent`
- Functional: Purple `#8B5CF6` available as secondary accent
- Functional: Font imports changed to Inter + Calistoga + JetBrains Mono
- Functional: All existing dashboard pages render with new colors
- Non-functional: Zero `#00C8E8` references remaining in dashboard src
- Non-functional: `npm run build` passes with 0 TypeScript errors
- Non-functional: All components retain their layout and behavior
- Non-functional: Dashboard tests pass

## Architecture

The retheme is almost entirely in `tailwind.config.ts`. Tailwind's design system means a single color change in the config cascades to every CSS class across 60+ components. Very few hardcoded colors exist.

## Related Code Files

- Modify: `dashboard/tailwind.config.ts` — THE core change
- Modify: `dashboard/src/index.css` — font imports
- Modify: `dashboard/src/components/ui/stitch-badge.tsx` — update variant colors
- Modify: `dashboard/src/components/layout-shell.tsx` — verify color references
- Modify: `dashboard/src/components/sidebar-navigation.tsx` — verify active state
- Review: all 60+ components — spot-check for hardcoded colors
- No new files needed

## Implementation Steps

### Step 1: Update tailwind.config.ts

```typescript
colors: {
  bg: { DEFAULT: '#060912', surface: '#0F172A', border: '#1E293B' },
  accent: '#F59E0B',          // WAS: '#00C8E8'
  purple: '#8B5CF6',          // NEW
  profit: '#34D399',          // KEEP
  loss: '#FF4466',            // KEEP
  gold: '#F59E0B',            // ALIGN (WAS: '#FFB800')
  muted: '#64748B',           // WAS: '#8892B0'
},
fontFamily: {
  display: ['Calistoga', 'serif'],           // NEW
  sans: ['Inter', 'system-ui', 'sans-serif'], // WAS: Geist
  mono: ['JetBrains Mono', 'Menlo', 'Monaco', 'Courier New', 'monospace'], // KEEP
},
```

### Step 2: Update index.css font imports

Replace Geist font import with Inter + Calistoga + JetBrains Mono:

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Calistoga&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
```

### Step 3: Update stitch-badge.tsx

Update variant colors to use gold/purple palette:

```typescript
const variants: Record<string, string> = {
  default: 'bg-white/10 text-white/80 border-white/15',
  success: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',  // #34D399
  warning: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  danger: 'bg-loss/10 text-loss border-loss/20',
  info: 'bg-accent/10 text-accent border-accent/20',                    // gold #F59E0B
};
```

### Step 4: Search for hardcoded colors

```bash
cd dashboard
grep -rn '#00C8E8' src/          # Should be zero after tailwind config change
grep -rn 'bg-accent' src/        # Verify tailwind classes resolve correctly
grep -rn 'text-accent' src/      # Verify text accent classes
```

If any component has `#00C8E8` hardcoded (not via Tailwind), update to `#F59E0B`.

### Step 5: Spot-check key pages

1. Dashboard main page — gold accent in headers, signals, status indicators
2. Pricing page — plan highlight cards
3. Strategies/Marketplace page — gold for active items
4. Settings page — verify all form elements
5. API Keys page — verify table/badge colors
6. Login/Signup pages — verify public pages match

### Step 6: Build verification

```bash
cd dashboard
npm run build
```

## Success Criteria

- [ ] `tailwind.config.ts` accent is `#F59E0B`, not `#00C8E8`
- [ ] Dashboard index.css imports Inter + Calistoga
- [ ] `grep -r '#00C8E8' dashboard/src/` returns 0 matches
- [ ] `npm run build` passes in dashboard (0 TS errors)
- [ ] All 16 dashboard pages load with new color scheme
- [ ] All section header accents (gold bars) render correctly
- [ ] Badges show gold/purple/emerald/red appropriately
- [ ] Sidebar active state uses gold accent
- [ ] Mobile sidebar opens correctly
- [ ] Dashboard tests pass

## Risk Assessment

- `gold: '#FFB800'` → `'#F59E0B'` is a subtle shift; components referencing `text-gold` will slightly darken. Acceptable since `#F59E0B` is the canonical value.
- Some components may reference `accent` indirectly through `StitchBadge` tone prop — verify the tone→variant mapping works.
- Geist→Inter: Geist is essentially a fork of Inter, so visual diff should be minimal.
