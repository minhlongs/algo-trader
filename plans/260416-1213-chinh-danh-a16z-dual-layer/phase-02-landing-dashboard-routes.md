---
phase: 02
name: Dashboard landing `/` + `/manifesto` route
priority: P0
status: pending
blockedBy: [01]
blocks: [03]
---

# Phase 02 — Dashboard Landing + Manifesto Route

## Context Links
- `plan.md` (parent)
- `phase-01-decisions-manifesto.md` (manifesto content source)
- `dashboard/` (existing Vite + React + Tailwind + i18n)
- `dashboard/wrangler.toml` (CF Pages project `algo-trader-dashboard`)
- `dashboard/src/pages/` (existing pages structure)

## Overview
- **Priority:** P0 — public-facing first impression
- **Brief:** Rewrite landing `/` = community-first hero với numbers; add `/manifesto` route rendering `docs/manifesto.md` markdown

## Key Insights
- Hai layer, một codebase: landing tĩnh + manifesto markdown-rendered
- Dashboard đã có react-router setup ⇒ chỉ add routes
- CF Pages `pages_build_output_dir = "dist"` đã config ⇒ deploy = `pnpm build && wrangler pages deploy dist`
- Landing KHÔNG được show live P&L chưa có — chỉ paper numbers pre-resolution
- Domain binding theo D1 (Phase 01 decision)

## Requirements

### Functional
- Route `/` — hero "Solo Quant Desk on Polymarket", paper 150 trades, CTA "Read Methodology" + "Read Manifesto"
- Route `/manifesto` — render `docs/manifesto.md` via markdown component (react-markdown hoặc existing)
- Route `/methodology` — link vào `docs/BINH_PHAP_TRADING.md` (GitHub direct link OK for v1)
- Responsive mobile-first
- Dark mode inherit từ existing dashboard theme

### Non-functional
- First contentful paint < 2.5s (LCP target Front 3 Binh Pháp)
- Bundle size < 500KB gzipped
- 0 "AI" / Polar-unsafe words in visible copy (audit before deploy)

## Architecture

### Routes tree
```
dashboard/src/
├── pages/
│   ├── landing.tsx          (NEW — replaces current `/` home)
│   ├── manifesto.tsx        (NEW — markdown renderer)
│   ├── methodology.tsx      (NEW — redirect to docs)
│   └── [existing pages...]
├── components/
│   ├── hero-solo-quant.tsx  (NEW)
│   ├── paper-stats-card.tsx (NEW — reads static JSON)
│   └── markdown-viewer.tsx  (NEW — react-markdown wrapper)
└── App.tsx                   (MODIFY — add routes)
```

### Data source for Phase 02 (static)
- `dashboard/public/paper-stats.json` — pre-built snapshot of 150 trades stats
- Generated once via `scripts/build-paper-stats.ts` running on M1 Max
- Phase 03 will replace this with live D1 query

### Hero copy (Polar-safe)
```
H1: Solo Quant Desk — Live on Polymarket
H2: One human. Zero overhead. Open methodology.
Paper: 150 trades · 14.6–25.3% pre-resolution edge
[ Read Methodology ]  [ Read Manifesto ]
```

## Related Code Files

### To create
- `dashboard/src/pages/landing.tsx`
- `dashboard/src/pages/manifesto.tsx`
- `dashboard/src/pages/methodology.tsx`
- `dashboard/src/components/hero-solo-quant.tsx`
- `dashboard/src/components/paper-stats-card.tsx`
- `dashboard/src/components/markdown-viewer.tsx`
- `dashboard/public/paper-stats.json` (snapshot)
- `scripts/build-paper-stats.ts` (generator)

### To modify
- `dashboard/src/App.tsx` — add routes
- `dashboard/package.json` — add `react-markdown` + `remark-gfm`
- `dashboard/src/index.css` — prose styles for manifesto

### Reference
- `dashboard/src/i18n/` — follow existing i18n if D2=dual
- `data/algo-trade.db` — source for paper-stats.json

## Implementation Steps
1. Install deps: `cd dashboard && pnpm add react-markdown remark-gfm`
2. Write `scripts/build-paper-stats.ts` reading `data/algo-trade.db` → output `dashboard/public/paper-stats.json` (totals, edge avg, accuracy placeholder, last-updated timestamp)
3. Run generator on M1 Max via SSH, commit JSON snapshot
4. Create `hero-solo-quant.tsx` with hero copy (Polar-safe)
5. Create `paper-stats-card.tsx` reading JSON, render 4 stats (trades, edge, actionable %, last-updated)
6. Create `markdown-viewer.tsx` wrapper around react-markdown + remark-gfm + Tailwind prose
7. Create `landing.tsx` composing hero + stats-card + CTAs
8. Create `manifesto.tsx` fetching `/manifesto.md` (copy `docs/manifesto.md` to `dashboard/public/manifesto.md` at build time)
9. Add manifesto copy step to build script: `cp ../docs/manifesto.md public/manifesto.md`
10. Create `methodology.tsx` — simple redirect component to GitHub URL
11. Register routes in `App.tsx`
12. Dev test: `pnpm dev` → visit `/`, `/manifesto`, `/methodology` on M1 Max
13. Polar-safe audit visible copy: grep rendered HTML
14. Build: `pnpm build` — check bundle <500KB
15. Deploy: `wrangler pages deploy dist --project-name algo-trader-dashboard`
16. Verify production HTTPS 200 (binh-phap-cicd.md Bước 1-2-3)
17. Commit: `feat(dashboard): dual-layer landing + manifesto route`

## Todo List
- [ ] Install react-markdown + remark-gfm
- [ ] Build paper-stats.ts generator
- [ ] Generate + commit paper-stats.json snapshot
- [ ] Hero component
- [ ] Paper stats card component
- [ ] Markdown viewer component
- [ ] Landing page
- [ ] Manifesto page + build-time copy
- [ ] Methodology page
- [ ] Wire routes in App.tsx
- [ ] Dev smoke test all 3 routes
- [ ] Polar-safe visible copy audit
- [ ] Production build + bundle size check
- [ ] Deploy to CF Pages
- [ ] Verify HTTPS 200 + CI green
- [ ] Commit

## Success Criteria
- 3 routes respond HTTP 200 in production
- Hero visible in < 2.5s on mobile (Lighthouse LCP)
- Bundle < 500KB gzipped
- 0 "AI" / wellness / medical in rendered HTML
- CI/CD green per `binh-phap-cicd.md` Bước 1-2-3
- `wrangler pages deployment list` shows latest deploy success

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Paper stats JSON stale vs docs | Document "snapshot as of {date}" in JSON header |
| Markdown renderer XSS | react-markdown strips HTML by default; do NOT enable `rehype-raw` |
| Build missing manifesto.md | Add explicit cp step; fail build if missing |
| CF Pages custom domain DNS delay | Accept `*.pages.dev` URL first, custom domain post-Phase-02 |

## Security Considerations
- No secrets in client bundle
- Markdown renderer configured WITHOUT raw HTML passthrough
- CSP header: inherit existing dashboard config, verify no inline scripts introduced

## Next Steps
- Blocks Phase 03 (live dashboard needs these routes as mount point)
- Independent of Phase 04
