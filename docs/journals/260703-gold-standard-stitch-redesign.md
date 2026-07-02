# Gold Standard Design System Unification -- Stitch Redesign

**Date**: 2026-07-03 04:23
**Severity**: Medium
**Component**: Design system, dashboard, landing page, Stitch UI
**Status**: Resolved (commit `a1829bbf9`)

## What Happened

Unified two separate frontends (static landing cashclaw.cc + Vite/React dashboard) under a single gold design system. 43 files changed, 367 insertions, 195 deletions across one mega-phase with 4 sub-phases running in parallel after the token layer completed.

Token source: ui-ux-pro-max search engine recommendation for fintech/trading platforms. Primary: gold `#F59E0B`, secondary accent: purple `#8B5CF6` (replaced dashboard's cyan `#00C8E8`), fonts: Inter (body) + Calistoga (display) swapped in from Geist + DM Sans + Cabinet Grotesk.

## The Brutal Truth

This should have been done weeks ago. The dashboard was using cyan `#00C8E8` while the landing page was already gold -- no shared token source, no single point of truth, just two codebases drifting further apart with every feature commit. The retheme itself was mechanical (Tailwind config change cascades everywhere), but the 94 hardcoded color replacements across 34 files is the real story: developers had been painting outside the lines for months, and we paid the cost all at once. The font swap Geist -> Inter feels like a nothingburger because Geist is literally a fork of Inter, but we still had to touch every import link and base CSS file.

## Technical Details

- **Token source**: `design-system/tokens.json` + `design-system/tokens.css` (canonical)
- **Primary color**: `#F59E0B` (gold, replaced cyan `#00C8E8` across dashboard)
- **Secondary accent**: `#8B5CF6` (purple, new addition)
- **Fonts**: Inter + Calistoga + JetBrains Mono (replaced Geist + DM Sans + Cabinet Grotesk)
- **Files touched**: 43 total -- 34 dashboard, 7 landing, 2 new design-system files
- **Hardcoded replacements**: 94 color values across 34 components/pages
- **Stitch additions**: `StitchButton` gold gradient variant, `StitchCard` gold/purple accent borders, `StitchBadge` palette update
- **Tailwind config key change**: `accent: '#00C8E8'` -> `accent: '#F59E0B'`, added `purple`, swapped `fontFamily.sans` from Geist to Inter
- **Protected flows untouched**: NOWPayments checkout, coupon validation, CSP headers, CF CDN cache -- all survived

## What We Tried

Single mega-phase with 5 sub-phases: Phase 1 (token layer) first, then Phases 2-4 (landing, dashboard, Stitch) in parallel, Phase 5 (verify/merge) at the end. The parallel plan was correct -- Phase 1 created the tokens, Phases 2-4 consumed them independently, Phase 5 caught any cross-cutting leaks. No worktrees needed because the session stayed on main and committed atomically.

The approach was right. The execution was mechanical replacement work. The only real decision was whether to chase Stitch MCP mockups or ship without them. We shipped without -- the design spec was prompt-complete, and Stitch MCP auth was still flaky. Good call.

## Root Cause Analysis

No shared design tokens between landing page and dashboard meant each frontend developed its own visual language. Landing went gold (the `#F59E0B` was already there), dashboard went cyan (`#00C8E8`). When both appear in the same product funnel (landing -> dashboard), the transition was jarring. The font divergence made it worse -- Cabinet Grotesk on landing, Geist on dashboard, no family relationship at all.

The root cause is organizational, not technical: there was no design system governance. No single file that both frontends import from. No one said "if we change a color, we change it once."

## Lessons Learned

1. **Design tokens are not optional.** `design-system/tokens.json` should have existed before the first line of frontend code. Two frontends without it is technical debt by default.
2. **Parallel execution on a single commit works** when the phases are truly independent (config -> consumers). Do this again for similar rethemes.
3. **Geist is Inter, basically.** The font swap was invisible because Geist is a near-identical fork. This was a calculated bet and it paid off -- no layout shifts reported.
4. **Hardcoded color grep is the canary.** `grep -rn '#00C8E8'` returned 34 hits before the fix. That number should have triggered a design token refactor months ago, not today.

## Next Steps

- Integrate `design-system/tokens.json` import into both build pipelines (currently consumed manually -- needs automated validation)
- Add a CI gate that fails if any source file contains a hardcoded color value outside `tailwind.config.ts` or `tokens.css`
- Monitor for any visual regression reports from customers (dashboard color swap is visible change -- gold vs cyan is noticeable)
- Still no Stitch MCP design mockups -- revisit when Stitch MCP auth is stable, but low priority
