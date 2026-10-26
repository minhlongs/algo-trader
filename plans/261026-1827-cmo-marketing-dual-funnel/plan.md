# Plan: CMO Mekong CLI Kit & Marketing Full Business Push (Dual-Funnel, SEO, Multi-Channel)

- **Date:** 2026-10-26
- **Branch:** `feat/cmo-marketing-dual-funnel-push`
- **Status:** completed
- **Mode:** `official` (`--ship --parallel`)

## 1. Objective & Context

Deliver 100% Marketing business capabilities for `algo-trader` / `CashClaw` based on the approved Handoff Brief from `ak-advise --ultra` (Report: `plans/reports/advise-261026-1822-cmo-marketing-dual-funnel.md`):

1. **Agent `/cmo` Permissions (`~/.claude/agents/sophia-cmo.md`)**:
   - Expand `allowed-paths` to include `dashboard/src/pages/**`, `dashboard/src/components/**`, `dashboard/src/locales/**`, `dashboard/public/**`, `dashboard/index.html`, and `docs/**`.
   - Add CashClaw / Solo Quant Desk Brand Voice doctrine (Polar-safe, verifiable quant desk, Kelly sizing, transparent numbers).

2. **Dual-Funnel & Bilingual UI on `dashboard/`**:
   - Update `dashboard/src/components/hero-solo-quant.tsx` to accept `lang?: 'en' | 'vi'` and render full bilingual VN/EN copy.
   - Update `dashboard/src/pages/landing.tsx`:
     - Maintain `< 200` LOC by extracting copy dictionary to `dashboard/src/pages/landing-copy.ts`.
     - Pass `lang` to `<HeroSoloQuant lang={lang} />`.
     - Replace *"No paywall"* with Dual-Funnel CTA: Button 1 to `/methodology` / `/manifesto`, Button 2 to `/pricing` ($0 Free, $49 Pro, $199 Enterprise) / `/signup`.
   - Update `dashboard/src/pages/pricing-page.tsx`:
     - Fix English translation in `COPY.en` for `faq3a` and `faq4a` (currently mixed Vietnamese).
     - Keep under 200 LOC or extract copy dictionary to `dashboard/src/pages/pricing-copy.ts` if needed.

3. **Technical SEO 100% (`dashboard/index.html` & `dashboard/public/`)**:
   - `dashboard/index.html`: SEO meta description, canonical `https://cashclaw.cc`, OpenGraph, Twitter card, JSON-LD (`SoftwareApplication` + `FAQPage`).
   - `dashboard/public/robots.txt`: Allow all search engines, point to sitemap.
   - `dashboard/public/sitemap.xml`: Full XML sitemap covering all 9 public routes (`/`, `/cashclaw`, `/pricing`, `/methodology`, `/manifesto`, `/enterprise`, `/docs`, `/login`, `/signup`).

4. **100% Multi-Channel Marketing Content Refresh (`docs/marketing/`)**:
   - Standardize all 17 marketing files across 4 fronts to the verified product reality (Polymarket Quant Desk + CashClaw RaaS $0 / $49 / $199, Quarter-Kelly sizing, Fail-Closed Risk Guard, PostgreSQL MCU Metering, 17,353+ tests, truthful leaderboard sample warnings):
     - Front 1 (Social & Community): `launch-twitter-thread.md`, `launch-reddit-post.md`, `reddit-posts.md`, `launch-posts-ready-to-post.md`.
     - Front 2 (Discord & Telegram): `launch-discord-announcement.md`, `discord-announce.md`, `golive-announcement-brief.md`, `golive-launch-content.md`.
     - Front 3 (5-Stage Email Nurture Free -> Pro): `email-sequence.md`, `email-campaign-starter-tier.md`, `email-campaign-co-pilot.md`.
     - Front 4 (Technical Blog SEO & Investor): `launch-blog-post.md`, `blog-arbitrage-engine.md`, `landing-page.md`, `investor-one-pager.md`.

5. **Build, Deploy & Smoke Verification**:
   - Run `npx tsc --noEmit`, `npm test`, `cd dashboard && pnpm run build`.
   - Open PR, merge with `--squash`, and deploy to Cloudflare Pages (`cashclaw.cc`).

## 2. Phases & File Ownership

| Phase | Scope | Owned Files | Status |
|---|---|---|---|
| Phase 1 | Agent `/cmo` Multi-Project Governance | `~/.claude/agents/sophia-cmo.md` | completed |
| Phase 2 | Dual-Funnel UI & Bilingual Localization | `dashboard/src/components/hero-solo-quant.tsx`, `dashboard/src/pages/landing.tsx`, `dashboard/src/pages/landing-copy.ts`, `dashboard/src/pages/pricing-page.tsx` | completed |
| Phase 3 | Technical SEO (Meta, JSON-LD, Robots, Sitemap) | `dashboard/index.html`, `dashboard/public/robots.txt`, `dashboard/public/sitemap.xml` | completed |
| Phase 4 | Multi-Channel Content Suite Standardization | `docs/marketing/*.md` | completed |
| Phase 5 | Quality Verification, PR, Merge & CF Pages Deploy | All test suites, CI checks, Cloudflare Pages | completed |

## 3. Acceptance Criteria

1. `~/.claude/agents/sophia-cmo.md` sandbox `allowed-paths` covers `dashboard/**` and `docs/**`.
2. Language toggle on `/` translates 100% of hero and page copy to Vietnamese; `/pricing` in English has zero Vietnamese sentences.
3. Trang chủ `/` has clear Dual-Funnel CTA driving to `/pricing` ($0 / $49 / $199) and `/signup`.
4. `dashboard/public/robots.txt` and `dashboard/public/sitemap.xml` exist and pass curl probe; `dashboard/index.html` has valid SEO and JSON-LD.
5. All `docs/marketing/` references reflect the real product and pricing tiers ($0 / $49 / $199).
6. Every code file in `dashboard/src/` is `<= 200` LOC, zero `:any`, zero `console.log` in production.
7. Build passes (`cd dashboard && pnpm run build`), PR merged to `main`, and deployed to `cashclaw.cc` with HTTP 200 smoke test.
