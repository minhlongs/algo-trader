# CLAUDE.md — cashclaw.cc Landing Page

Static landing page for CashClaw, deployed to Cloudflare Pages (`algo-trader` project). Custom domain: `cashclaw.cc` + `www.cashclaw.cc`.

## Commands

```bash
cd landing

# Deploy to CF Pages (production — updates cashclaw.cc)
./scripts/deploy-cf-pages.sh

# Quick deploy (dirty working tree OK)
ALLOW_DIRTY_DEPLOY=1 ./scripts/deploy-cf-pages.sh

# Verify deployment
curl -sL https://e5c6bae0.algo-trader.pages.dev | head -5
```

## Architecture

```
landing/src/
├── index.html              # Single-page landing (Terminal Brutalism design)
├── robots.txt              # SEO — allow /, disallow /dashboard & /app
├── _headers                # Security headers + cache policies (CF Pages routing)
└── ui/
    └── design-system/
        └── tokens.css      # Design tokens (CSS custom properties)
```

## Design System (Terminal Brutalism v3)

- **Background**: `#060912` with noise texture + grid overlay + ambient glow orbs
- **Typography**: Cabinet Grotesk (headings) + DM Sans (body) + JetBrains Mono (mono/data)
- **Colors**: Gold `#F59E0B` (primary accent), Emerald `#34D399` (bull/positive), Rose `#FB7185` (bear/negative)
- **Layout**: Asymmetric hero split, data-table pricing, OB depth panels
- **Motion**: Ticker scroll animation, ambient glow drift, stagger-reveal stats

## Quality Gates (MANDATORY before deploy)

1. `tokens.css` validates — all CSS variables in HTML exist in tokens.css
2. Visual diff check: compare `e5c6bae0.algo-trader.pages.dev` before/after deploy
3. Security headers present (HSTS, CSP, X-Frame-Options, Permissions-Policy)
4. Responsive check: 375px / 768px / 1024px / 1440px
5. No hardcoded secrets, tokens, or keys

## Deploy Contract

- Source of truth: `landing/src/` (NOT `/tmp/cashclaw-redesign/`)
- Deploy script creates a backup before overwriting
- Every deploy logged to `landing/plans/reports/deploy-*.md`
- CF CDN cache: use cache-buster (`?v=N`) on CSS when changing tokens

## Cache Busting Rules

- **`tokens.css` includes `?v=N` in HTML `<link>`** — increment N on every deploy that changes CSS
- **`_headers` sets `max-age=31536000, immutable` on `/ui/*`** — CDN caches aggressively
- After deploy, verify with: `curl -sL "https://cashclaw.cc/ui/design-system/tokens.css?v=N" | head -3`
- If custom domain stale: CF CDN edge cache TTL ≈ 2-4 hours on custom domains
