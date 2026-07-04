---
phase: 4
title: Stitch Enhancement
status: completed
priority: P2
dependencies:
  - 1
---

# Phase 4: Stitch Enhancement

## Overview

Upgrade the existing Stitch UI component wrappers (`src/components/ui/stitch-*.tsx`) with the new gold design system tokens. Add gold/purple variants. When Stitch MCP is available, generate design mockups for key dashboard pages.

## Requirements

- Functional: StitchButton supports `variant="gold"` with gold gradient
- Functional: StitchCard supports `accent="gold"` and `accent="purple"` top-border
- Functional: StitchBadge uses gold/purple/emerald palette (not cyan)
- Functional: StitchSectionTitle eyebrow uses gold accent (not cyan)
- Optional: Stitch MCP generates design mockups for reference

## Related Code Files

- Modify: `dashboard/src/components/ui/stitch-button.tsx` — add gold variant
- Modify: `dashboard/src/components/ui/stitch-card.tsx` — add accent options
- Modify: `dashboard/src/components/ui/stitch-badge.tsx` — update palette
- Modify: `dashboard/src/components/ui/stitch-section-title.tsx` — update accent color

## Implementation Steps

### Step 1: Enhance StitchButton

Add a `gold` variant with the gold gradient from the landing page:

```tsx
// Add to Button component or StitchButton
const variants = {
  gold: 'bg-gradient-to-r from-[#F59E0B] to-[#D97706] text-[#060912] font-bold shadow-lg shadow-[#F59E0B]/20 hover:shadow-[#F59E0B]/40 hover:translate-y-[-1px] transition-all',
  // ... keep existing variants
};
```

### Step 2: Enhance StitchCard

Add accent options for top-border styling:

```tsx
// Add accent prop
interface StitchCardProps {
  accent?: 'gold' | 'purple' | 'none';
}

// Render top border based on accent
const accentBorder = accent === 'gold' ? 'border-t-[#F59E0B]' 
  : accent === 'purple' ? 'border-t-[#8B5CF6]' 
  : '';
```

### Step 3: Update StitchBadge

Colors already handled in Phase 3 Step 3. Ensure:
- `success` variant uses emerald (#34D399)
- `info` variant uses accent/gold (#F59E0B)
- All `tone`→`variant` mappings resolve correctly

### Step 4: Update StitchSectionTitle

Change the eyebrow/text accent from cyan to gold:

```tsx
// Change:
<p className="text-xs font-semibold uppercase tracking-widest text-accent mb-2">
// To:
<p className="text-xs font-semibold uppercase tracking-widest text-[#F59E0B] mb-2">
```

(Or keep using `text-accent` since the Tailwind config already maps `accent` to `#F59E0B`.)

### Step 5 (Optional): Stitch MCP Mockups

When Stitch MCP auth is resolved, generate reference mockups for:
- Dashboard main page (gold accent layout, predictive analytics cards)
- Pricing page (gold-highlighted Pro plan)
- Landing page hero section (Calistoga headline, gold glow)

## Success Criteria

- [ ] StitchButton renders gold gradient variant
- [ ] StitchCard supports gold/purple accent borders
- [ ] StitchBadge uses gold/purple/emerald palette
- [ ] StitchSectionTitle eyebrow is gold (via CSS class or direct)
- [ ] All components maintain backward compatibility
- [ ] No breaking changes to existing Stitch consumers
- [ ] `npm run build` passes

## Risk Assessment

- Stitch MCP auth issue prevents mockup generation — design spec is complete without it, mockups are optional enhancement
- Component changes are additive (new variants), not breaking — no regression risk
