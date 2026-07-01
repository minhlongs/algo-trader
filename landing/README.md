# CashClaw Landing Page

Static landing page for [cashclaw.cc](https://cashclaw.cc) — AI Prediction Market Terminal.

## Quick Start

```bash
cd landing
open src/index.html        # Preview locally
./scripts/deploy-cf-pages.sh  # Deploy to production
```

## Architecture

Single-page static site deployed to Cloudflare Pages. No build step, no JS framework.

```
src/
├── index.html          # Terminal Brutalism landing page
├── _headers            # CF Pages routing: security + cache
├── robots.txt          # SEO
└── ui/design-system/
    └── tokens.css      # All design tokens (CSS custom properties)
```

## Design

- **Style**: Terminal Brutalism — dark, data-dense, asymmetric
- **Fonts**: Cabinet Grotesk (headings), DM Sans (body), JetBrains Mono (data)
- **Colors**: Gold `#F59E0B` accent, Emerald green (bull), Rose red (bear)
- **Background**: `#060912` with noise texture + grid + ambient glow orbs

See `docs/system-architecture.md` for full design system reference.

## Deploy

```bash
./scripts/deploy-cf-pages.sh
```

4 quality gates run before deploy: source check, CSS variable audit, security headers, secret scan. Each deploy generates a report in `plans/reports/`.

See `docs/deployment-guide.md` for details.

## Quality Gates

| Gate | What |
|------|------|
| Build | No build step (static HTML/CSS) |
| CSS Audit | `var(--xxx)` in HTML must exist in tokens.css |
| Security | HSTS, CSP, X-Frame-Options, Permissions-Policy |
| Secrets | No API keys/tokens in source |
| Verify | HTTP 200 + CSS integrity post-deploy |
