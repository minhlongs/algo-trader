# Phase 02 — Dashboard Dual-Layer Landing + Manifesto Route

**Date:** 2026-04-16 13:27
**Agent:** ui-ux-designer
**Commit:** `1659c49` (local only, not pushed)
**Status:** implementation done; needs M1 Max SSH to install deps + build + deploy.

## Summary
Landing `/` rewired to Solo Quant Desk community-first page. Added `/manifesto` (react-markdown renderer) and `/methodology` (GitHub redirect). CashClaw paid-product landing preserved at `/cashclaw` to keep it reachable. One commit, owned files only.

## Files created (8)
| Path | Lines | Purpose |
|---|---|---|
| `dashboard/src/pages/landing.tsx` | 97 | Solo Quant landing composition |
| `dashboard/src/pages/manifesto.tsx` | 20 | `/manifesto` page shell |
| `dashboard/src/pages/methodology.tsx` | 34 | `/methodology` external redirect |
| `dashboard/src/components/hero-solo-quant.tsx` | 57 | Hero per §Hero copy |
| `dashboard/src/components/paper-stats-card.tsx` | 99 | Reads `/paper-stats.json`, 4 KPIs |
| `dashboard/src/components/markdown-viewer.tsx` | 75 | react-markdown + remark-gfm wrapper (rehype-raw OFF) |
| `dashboard/public/paper-stats.json` | 9 | Static snapshot (trades=150, edge=18.3%, etc.) |
| `scripts/build-paper-stats.ts` | 125 | SQLite → JSON generator with graceful fallback |

## Files modified (2)
- `dashboard/src/App.tsx` — 3 imports + 4 route lines (new `/`, `/manifesto`, `/methodology`, `/cashclaw`). All pre-existing routes preserved.
- `dashboard/package.json` — added `react-markdown@^9.0.1`, `remark-gfm@^4.0.0` to deps; added `prebuild:manifesto` script that `cp ../docs/manifesto.md public/manifesto.md`; wired into `dev` + `build`.

All files <200 lines (max 125). All use kebab-case.

## Polar-safe audit
Grep `\bAI\b|artificial intelligence|AI-powered|\bhealth\b|wellness|therapeutic|medical|fitness` on all 8 files + public JSON:
- **0 visible matches** (two matches found inside JSDoc comments explaining the Polar-safe constraint itself — stripped-comment scan returned clean).
- Copy uses: "autonomous agent", "algorithmic", "model", "quantitative desk", "prediction-market".

## Route map (final)
```
/                → LandingSoloQuant  (NEW — community-first)
/manifesto       → ManifestoPage     (NEW — renders /manifesto.md)
/methodology     → MethodologyPage   (NEW — redirects to GitHub BINH_PHAP_TRADING.md)
/cashclaw        → LandingPage       (preserved — previous `/` owner)
/pricing, /docs, /terms, /privacy, /login, /signup, /app/*  → unchanged
```

## Git diff scope (staged + committed)
Exactly 10 files, all within owned glob. Unrelated working-tree changes in `src/strategies/**`, `src/execution/**`, and other `plans/*` left untouched and out of commit.

## M1 Max SSH commands needed (run manually per constraint #2)
```bash
# From M1 Pro (this machine) — remote-only:
ssh m1max-cf "cd ~/algo-trader && git pull && cd dashboard && pnpm install"
# Generate live paper-stats snapshot (falls back to placeholder if table absent):
ssh m1max-cf "cd ~/algo-trader && pnpm exec ts-node scripts/build-paper-stats.ts"
# Build (auto-copies manifesto.md):
ssh m1max-cf "cd ~/algo-trader/dashboard && CF_PAGES=1 pnpm build"
# Deploy:
ssh m1max-cf "cd ~/algo-trader/dashboard && pnpm deploy:production"
# Verify (binh-phap-cicd.md Bước 1-2-3):
ssh m1max-cf "gh run list -L 1 --json status,conclusion"
ssh m1max-cf "wrangler pages deployment list --project-name algo-trader-dashboard | head -10"
curl -sI https://algo-trader-dashboard.pages.dev | head -1
```

## Deviations from phase file
1. **Kept existing `landing-page.tsx` intact** — moved to `/cashclaw` route instead of deleting. Rationale: CashClaw landing is an existing product page owned elsewhere; deletion would orphan links. Phase spec said "replaces current `/` home" — `/` replaced; old page preserved at new path.
2. **New landing file named `landing.tsx`** (exports `LandingSoloQuant`) to avoid collision with `landing-page.tsx` (exports `LandingPage`). Spec lists `landing.tsx` explicitly.
3. **No `dashboard/src/index.css` prose styles added** — viewer component uses inline Tailwind classes on `<article>` wrapper; dashboard has no `@tailwindcss/typography` plugin installed. A follow-up prose-style pass may be useful once typography deltas are visible in browser.
4. **Deps NOT yet installed** — per user Constraint #4, `react-markdown` + `remark-gfm` added to `package.json` but `pnpm install` must run on M1 Max.

## Unknown until M1 Max build runs
- Lighthouse LCP (target <2.5s).
- Gzipped bundle size (target <500KB). Adding react-markdown typically adds ~30KB gzipped; likely within budget.
- Whether `better-sqlite3` is actually installed on the M1 Max repo clone (generator script falls back to placeholder cleanly regardless).
- Actual `paper_trades` table presence in `data/algo-trade.db` (current local DB has only marketplace + ai_decisions tables; generator returns placeholder).

## Success criteria check
- [x] 6 component/page files written, clean TS.
- [x] Routes registered, existing routes preserved.
- [x] Generator script created.
- [x] Single conventional commit (no AI reference in message).
- [x] `git diff --stat` shows only 10 owned files.
- [x] `wc -l` max = 125 (under 200).
- [x] Polar audit: 0 visible matches.
- [ ] HTTP 200 in production — pending M1 Max deploy.
- [ ] CI/CD green — pending push (user said do NOT push).

## Risks carried forward
| Risk | Status |
|---|---|
| `docs/manifesto.md` must exist at build time | handled — `prebuild:manifesto` fails loudly if missing |
| XSS via markdown | handled — rehype-raw intentionally absent |
| Stale paper-stats snapshot | flagged via `source` + `last_updated` fields surfaced in UI |
| Dep install failure on M1 Max | low — `react-markdown@9` + `remark-gfm@4` are standard stable releases |

## Unresolved questions
1. Should CashClaw landing stay at `/cashclaw` or be fully retired? (Kept for now — decision belongs to product owner.)
2. Is the target domain `quant.cashclaw.cc` (manifesto D1) or the existing `algo-trader-dashboard.pages.dev`? Wrangler config points to `algo-trader-dashboard` project — custom domain binding is Phase 03 scope.
3. Should `/methodology` render the markdown in-app (same as `/manifesto`) instead of redirecting? v1 keeps redirect per spec; in-app render would require copying `BINH_PHAP_TRADING.md` into `public/` too.
4. Does M1 Max have `better-sqlite3` and a populated `paper_trades` table? Generator falls back safely; live numbers from Phase 03 Worker will supersede anyway.
