---
phase: 02
title: Risk visualization components
status: completed
priority: P1
---

# Phase 02 — Risk Visualization Components

## Context

Visual components to make risk exposure instantly understandable:
- **RiskGauge**: Semi-circle gauge showing current risk level vs threshold (0-100%)
- **ExposureHeatmap**: Grid visualization of market exposure by asset
- **PnlSparkline**: Mini chart showing recent P&L trajectory with risk zone markers

All components use Stitch design tokens.

## Architecture

Components live in `src/components/ui/risk/` or directly `src/components/ui/` if few.

### RiskGauge

```typescript
interface RiskGaugeProps {
  value: number; // 0-1
  threshold: number; // 0-1, threshold line
  size?: 'sm' | 'md' | 'lg';
  label?: string;
}
```

SVG-based gauge:
- Semi-circle arc (180°) from green→yellow→red gradient
- Needle or fill indicator at current value
- Threshold marker as vertical line
- Color-coded: green (<0.3), yellow (0.3-0.7), red (>0.7)

### ExposureHeatmap

```typescript
interface ExposureHeatmapProps {
  data: Array<{
    marketId: string;
    marketName: string;
    exposure: number; // positive = long, negative = short
    notional: number; // USD
  }>;
  maxExposure?: number; // for color scaling
}
```

Grid of rectangles:
- Color intensity based on |exposure| as % of max
- Sign indicated by border color (cyan for long, pink for short) or pattern
- Tooltip on hover: market name, exposure $USD, % of portfolio

### PnlSparkline

Lightweight SVG polyline:
- Shows last N P&L values
- Background gradient fill below line
- Horizontal lines for risk thresholds (max loss per trade)
- Current value as dot at end

## Implementation Steps

1. Create `src/components/ui/risk-gauge.tsx`
2. Create `src/components/ui/exposure-heatmap.tsx`
3. Create `src/components/ui/pnl-sparkline.tsx`
4. Write unit tests for each component (rendering, props, accessibility)
5. Verify TypeScript compilation
6. Add to `src/components/ui/index.ts` exports

## Files to Create

- `src/components/ui/risk-gauge.tsx`
- `src/components/ui/exposure-heatmap.tsx`
- `src/components/ui/pnl-sparkline.tsx`
- `src/components/ui/__tests__/risk-gauge.test.tsx`
- `src/components/ui/__tests__/exposure-heatmap.test.tsx`
- `src/components/ui/__tests__/pnl-sparkline.test.tsx`

## Files to Modify

- None (new components)

## Success Criteria

- Components render correctly with Stitch color tokens
- All tests pass (vitest)
- No TypeScript errors
- Responsive design (use relative units or responsive props)

## Risk Assessment

- Medium risk: SVG math can be tricky, but isolated components
- Mitigation: use simple SVG paths, test edge cases (0, 1, negative values for exposure)
- Low: Recharts bundle size → already in dependencies, no extra cost
- Low: Performance with large heatmap → limit max cells, virtualize if needed
