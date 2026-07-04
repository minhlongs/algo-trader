# Stitch Pages Implementation Plan

## Overview
Refactor 3 Core pages to use Stitch design system components and tokens.

## Pages to Refactor
1. `src/pages/dashboard-page.tsx` (502 lines → <200 lines)
2. `src/pages/marketplace-page.tsx` (124 lines)
3. `src/pages/settings-page.tsx` (200 lines)

## Stitch Components to Use
- `StitchCard`, `StitchCardHeader`, `StitchCardBody`
- `StitchButton`
- `StitchBadge`
- `StitchInput`
- `StitchStatCard`
- `StitchTable`
- `StitchTabs`
- `StitchSectionTitle`
- `StitchPageShell`

## Design Token Mappings
| Current Class | Stitch Token |
|---------------|--------------|
| `text-muted` | `COLORS.onSurfaceVariant` |
| `text-accent` | `COLORS.primary` |
| `bg-bg-card` | `COLORS.surface` |
| `border-bg-border` | `COLORS.outline` |
| `text-profit` | `COLORS.profit` |
| `text-loss` | `COLORS.loss` |
| `bg-accent/10` | `${COLORS.primary}1a` |
| `border-accent/30` | `${COLORS.primary}4d` |

## Dashboard Extractions (to reduce to <200 lines)
1. `src/pages/dashboard-widgets/candlestick-widget.tsx`
2. `src/pages/dashboard-widgets/strategy-controls-widget.tsx`
3. `src/pages/dashboard-widgets/pnl-analytics-widget.tsx`
4. `src/pages/dashboard-widgets/positions-widget.tsx`
5. `src/pages/dashboard-widgets/logs-widget.tsx`
6. `src/pages/dashboard-widgets/widget-registry.tsx`

Keep main page as composition shell.

## Implementation Order
1. Dashboard (most complex, needs extractions)
2. Marketplace (straightforward component swap)
3. Settings (moderate, extract MM form)

## Success Criteria
- All pages compile without errors
- Stitch components used throughout
- Each file <200 lines
- Existing functionality preserved
- Visual design matches Stitch dark theme
