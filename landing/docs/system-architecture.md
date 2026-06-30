# System Architecture — cashclaw.cc

## Delivery Chain

```
Source (landing/src/) → wrangler pages deploy → CF Pages (algo-trader) → cashclaw.cc
                                                                          → www.cashclaw.cc
                                                                          → *.algo-trader.pages.dev
```

## CF Pages Project

| Setting | Value |
|---------|-------|
| Project Name | `algo-trader` |
| Type | Direct Upload (no git provider) |
| Custom Domains | `cashclaw.cc`, `www.cashclaw.cc` |
| Build | None (static assets) |
| Deploy Command | `wrangler pages deploy . --project-name algo-trader --branch=main` |

## Asset Pipeline

```
_tokens.css_ ──┐
                ├── <link rel="stylesheet"> in <head>
_index.html_ ───┘
_headers_ ────── CF Pages routing rules
robots.txt ───── Direct serve
```

## Cache Strategy

| Path | Cache-Control | Reason |
|------|---------------|--------|
| `/ui/*` | `max-age=31536000, immutable` | Design tokens rarely change; cache-bust via `?v=N` |
| `/assets/*` | `max-age=31536000, immutable` | Future static assets |
| `/*.html` | `no-cache, no-store, must-revalidate` | Always serve fresh HTML |

## Design Token Architecture

```
:root {
  ── Colors ──
  --color-bg           #060912     Page background
  --color-bg-elevated  #0B1120     Slightly raised surfaces
  --color-bg-card      #0F172A     Card backgrounds
  --color-bg-card-hover #141F38    Card hover state
  --color-border       #1E3A5F     Visible borders
  --color-border-subtle #152240    Subtle separators
  --color-gold         #F59E0B     Primary accent
  --color-emerald      #34D399     Bull/positive
  --color-rose         #FB7185     Bear/negative
  --signal-bull        #34D399     Buy signal
  --signal-bear        #FB7185     Sell signal

  ── Typography ──
  --font-heading   Cabinet Grotesk
  --font-body      DM Sans
  --font-mono      JetBrains Mono
  --text-hero      clamp(3.5rem, 7vw, 6rem)
  --text-display   clamp(2.25rem, 4vw, 3.5rem)

  ── Spacing (4px base) ──
  --space-1: 0.25rem ... --space-24: 6rem

  ── Effects ──
  --shadow-gold    0 0 60px rgba(245,158,11,0.2)
  --ease-out       cubic-bezier(0.16, 1, 0.3, 1)
}
```

## Section Layout

```
[NAV] fixed top, backdrop blur, gold CTA
[HERO] min-h-dvh, asymmetric grid (1.1fr / 0.9fr)
  ├── Left: badge + title + subtitle + CTAs + ticker scroll
  └── Right: sparkline chart + terminal widget + ticker bar
[STATS] 4-column grid, gold glow on hover
[FEATURES] 3×2 grid with numbered cards (01-06)
[ORDERBOOK] 2-column bid/ask depth panels
[PRICING] Data table with featured row highlight
[CTA] Centered card with dual radial gradient background
[FOOTER] Simple row: copyright + links
```

## Environment Effects

- **Noise overlay**: SVG `feTurbulence` at 3% opacity, fixed, `pointer-events: none`
- **Grid**: CSS `linear-gradient` at 60px, `rgba(30,58,95,0.06)`
- **Ambient glows**: Two 500-600px blurred orbs, `border-radius: 50%`, `filter: blur(120px)`, 4% opacity, 20-25s drift animation
