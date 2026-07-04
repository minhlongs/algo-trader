# Gold Standard — Full Stitch Redesign Report

> Algo-Trade RaaS Platform: Unified design system across landing page + dashboard
> Generated: 2026-07-03 | Mode: brainstorm → ck:plan:deep:parallel | Ultracode: on

---

## 1. Problem Statement

Landing page (cashclaw.cc) and dashboard (quant.cashclaw.cc) have **two disconnected design systems**:

| Token | Landing | Dashboard | Problem |
|-------|---------|-----------|---------|
| Primary accent | Gold `#F59E0B` | Cyan `#00C8E8` | Zero brand continuity |
| Background | `#060912` | `#080B14` | Slightly different dark |
| Body font | DM Sans | Geist | Different typeface |
| Heading font | Cabinet Grotesk | Geist (same) | Mismatched |
| UI framework | Static HTML/CSS | Vite/React + Tailwind | Different stacks |

A user clicking "Open Terminal" on the landing page lands in a dashboard that looks like a different product.

---

## 2. Design System (from ui-ux-pro-max)

Generated via `search.py "algorithmic trading fintech" --design-system`:

### Palette

```
Primary:     #F59E0B  Gold      (wealth, trust, proven — landing page already uses this)
Secondary:   #8B5CF6  Purple    (tech, AI, innovation — replaces current cyan)
Positive:    #34D399  Emerald   (profit, bull market)
Negative:    #EF4444  Red       (loss, bear market)
Muted:       #64748B  Slate     (secondary text, labels)

BG Base:     #060912  Deep navy (unified — use landing's value)
BG Surface:  #0F172A  Card bg
BG Border:   #1E293B  Borders
Text:        #F8FAFC  Foreground primary
```

### Typography

```
Display:  Calistoga       (hero/title — bold, warm, premium)
Body:     Inter            (UI text, labels — clean, readable)
Mono:     JetBrains Mono   (data, metrics, code — already in both)
```

### Visual Patterns

| Surface | Pattern | From ui-ux-pro-max |
|---------|---------|-------------------|
| Landing | Real-Time / Operations Landing | Hero + live preview + metrics + CTA |
| Dashboard | Predictive Analytics + Real-Time Monitoring | Forecast lines, confidence bands, anomaly alerts |
| Pricing | Pricing Page + CTA | 3-column comparison, FAQ accordion, annual discount |

### Key Effects

- Gold glow shadows (already on landing: `box-shadow: 0 0 60px rgba(245, 158, 11, 0.2)`)
- Smooth transitions 200-300ms ease-out
- JetBrains Mono for all data/metrics with `tracking-wide` or `tabular-nums`
- Ambient glow orbs (existing landing pattern, extend to dashboard)

### Anti-patterns to avoid

- ❌ AI purple/pink gradients (despite purple secondary, keep it minimal)
- ❌ No emojis as icons (use Phosphor icons — already in dashboard)
- ❌ Bright neon colors (current dashboard's `#00C8E8` is borderline)
- ❌ Harsh animations (respect prefers-reduced-motion)

---

## 3. Current State Assessment

### Landing page (cashclaw.cc) — Static HTML/CSS on CF Pages
- **28 source files** across seed/tree/forest layers
- Token system in `src/seed/tokens.css` — already uses gold `#F59E0B`
- Fonts: Cabinet Grotesk + DM Sans + JetBrains Mono
- 8 sections: nav, hero, features, ticker, pricing, faq, cta, footer
- NOWPayments checkout integration (non-negotiable)
- Coupon validation flow
- Live stats fetch from `/api/public/stats`

### Dashboard (Vite/React on quant.cashclaw.cc) — 16 pages, 60+ components
- Tailwind config with cyan `#00C8E8` accent, Geist font
- Stitch components already provisioned at `src/components/ui/stitch-*.tsx`
  - `stitch-button.tsx` → re-exports Button
  - `stitch-card.tsx` → re-exports Card + StitchCardHeader/Body
  - `stitch-badge.tsx` → Stitch tone→variant mapping
  - `stitch-section-title.tsx` → eyebrow + title + subtitle pattern
- 16 app routes, auth-guarded, real-time WebSocket data
- React Router, Zustand, Motion, Recharts, Lightweight Charts
- 3 stores: trading-store, auth-store, dashboard-store

---

## 4. Scope — All-in-One Mega-Phase

One parallel push. Four work packages executing concurrently via orchestrated subagents:

### Package 1: Shared Design Token Layer (foundation)

**What:** Create `design-system/tokens.json` consumed by both landing + dashboard.

```
algo-trader/
├── design-system/
│   ├── tokens.json           # Canonical source of truth
│   └── tokens.css            # CSS custom properties (for landing page)
└── dashboard/
    └── src/
        └── styles/
            └── tokens.css    # Shared import for dashboard
```

**tokens.json shape:**
```json
{
  "$schema": "./tokens-schema.json",
  "colors": {
    "primary": "#F59E0B",
    "secondary": "#8B5CF6",
    "positive": "#34D399",
    "negative": "#EF4444",
    "bg": { "base": "#060912", "surface": "#0F172A", "border": "#1E293B" },
    "text": { "primary": "#F8FAFC", "secondary": "#CBD5E1", "muted": "#64748B" }
  },
  "fonts": {
    "display": "'Calistoga', serif",
    "body": "'Inter', system-ui, sans-serif",
    "mono": "'JetBrains Mono', 'Fira Code', monospace"
  },
  "spacing": { "base": 4, "scale": [4, 8, 12, 16, 20, 24, 32, 40, 48, 64] },
  "radius": { "sm": 4, "md": 8, "lg": 14, "xl": 20, "full": 9999 }
}
```

**Files to create:**
- `design-system/tokens.json` — canonical token source
- `design-system/tokens.css` — CSS custom properties for landing page
- `design-system/tokens-schema.json` — JSON schema for validation

**Files to modify:**
- `dashboard/tailwind.config.ts` — swap colors, add Calistoga/Inter fonts
- `landing/src/seed/tokens.css` — align with canonical tokens
- `dashboard/src/index.css` — update font imports, new token references

**Verification:** `npm run build` passes in both dashboard and landing.

---

### Package 2: Landing Page Retheme (Stitch-ready)

**What:** Update the static landing page to fully align with the unified gold system.

**Files to modify:**
- `landing/src/seed/tokens.css` — align with canonical gold tokens
- `landing/src/tree/base.css` — update layout tokens if needed
- `landing/src/tree/components.css` — update component colors
- `landing/src/forest/js/config.js` — update any hardcoded colors

**What changes (minimal — landing already gold):**
- Font: DM Sans → Inter (body), keep Cabinet Grotesk for headings or switch to Calistoga for hero
- Polish: match exact token values from tokens.json
- Add purple secondary accent for badges, highlights

**When Stitch MCP is available, generate mockups for:**
- Hero section (gold glow, terminal aesthetic)
- Pricing table gold-accented cards
- Feature showcase with purple tech accents

**Non-negotiable preserves:**
- NOWPayments checkout URLs (3 tiers)
- Coupon validation flow
- Activation modal
- Live stats from `/api/public/stats`
- Free access coupon path
- CSP `script-src 'self'` (no unsafe-eval)
- CF CDN cache headers for seed/tree/forest/*

**Verification:** Landing deploys to CF Pages, all 5 quality gates pass.

---

### Package 3: Dashboard Tailwind Retheme (Cyan → Gold)

**What:** Swap the dashboard's cyan `#00C8E8` accent to gold `#F59E0B` + purple `#8B5CF6`.

**Files to modify:**
- `dashboard/tailwind.config.ts` — the core change:
  - `accent: '#00C8E8'` → `accent: '#F59E0B'`
  - `gold: '#FFB800'` → keep as-is or align to `#F59E0B`
  - Add `purple: '#8B5CF6'` as secondary accent
  - Update `bg.DEFAULT` → `#060912` (unify with landing)
  - Update `bg.surface` → `#0F172A`
  - Update `bg.border` → `#1E293B`
  - Update `muted` → `#64748B`
  - Add `fontFamily.display: ['Calistoga', ...]`
  - Swap `fontFamily.sans` from Geist to Inter
- `dashboard/src/index.css` — update font imports (Google Fonts: Inter + Calistoga)
- `dashboard/src/components/ui/stitch-badge.tsx` — update variant colors to gold/purple

**What DOESN'T change (no functional impact):**
- All component logic, hooks, stores, API calls
- WebSocket connections, real-time data
- React Router configuration
- Auth guards
- Page layout structure

**Components to verify after retheme (spot-check):**
1. `layout-shell.tsx` — sidebar gold accent
2. `sidebar-navigation.tsx` — active state gold
3. `dashboard-page.tsx` — all section headers, status indicators
4. `pricing-page.tsx` — plan highlight cards
5. `signals-panel.tsx` — gold/purple for signal types
6. All `stitch-*.tsx` components — verify badge/border colors
7. All chart components — update bull/bear colors to emerald/red

**Verification:** `npm run build` in dashboard, visual check of 5 key pages.

---

### Package 4: Stitch UI Component Enhancement

**What:** Upgrade the seeded Stitch components with the new design system tokens.

**Files to modify:**
- `dashboard/src/components/ui/stitch-button.tsx` — add gold variant
- `dashboard/src/components/ui/stitch-card.tsx` — add gold/purple accent options
- `dashboard/src/components/ui/stitch-badge.tsx` — update to use gold/purple palette
- `dashboard/src/components/ui/stitch-section-title.tsx` — update accent color to gold

**Enhancements:**
- StitchButton: Add `variant="gold"` with gold gradient background
- StitchCard: Add `accent="gold"` and `accent="purple"` top-border accents
- StitchBadge: `success` → emerald, `info` → accent gold
- StitchSectionTitle: Eyebrow uses gold instead of cyan

---

## 5. Execution Strategy — One Workflow, 4 Parallel Agents

```
                      ┌─────────────────────────────┐
                      │  WORKFLOW ORCHESTRATOR       │
                      │  (creates worktrees,         │
                      │   coordinates parallel agents)│
                      └──────────┬──────────────────┘
                                 │
            ┌────────────────────┼────────────────────┐
            ▼                    ▼                    ▼
    ┌───────────────┐   ┌───────────────┐   ┌───────────────┐
    │ Agent 1       │   │ Agent 2       │   │ Agent 3       │
    │ Token Layer   │   │ Landing Page  │   │ Dashboard     │
    │ (tokens.json, │   │ Retheme       │   │ Retheme       │
    │  tailwind cfg,│   │ (tokens.css,  │   │ (tailwind,    │
    │  CSS vars)    │   │  components)  │   │  components,  │
    └──────┬────────┘   └──────┬────────┘   │  stitch)      │
           │                   │            └──────┬────────┘
           │                   │                   │
           └───────────────────┼───────────────────┘
                               ▼
                    ┌─────────────────────┐
                    │  Agent 4: Verify    │
                    │  Build + Visual     │
                    │  + Tests            │
                    └─────────────────────┘
```

All 4 agents run in parallel via git worktrees (no file conflicts).

---

## 6. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Stitch MCP auth error blocks mockups | No visual reference | Design system spec is complete without mockups — Stitch is optional enhancement |
| Font change (Geist→Inter) breaks layout | Text overflow, sizing | Use system-ui fallback, test at 375px/768px/1440px breakpoints |
| Color swap missed in edge component | Inconsistent appearance | Spot-check script: grep for `#00C8E8` to catch all cyan references |
| Token file breaks landing page deploy | Deploy fails | Landing has its own quality gates — test before deploy |
| Concurrent git conflicts | Merge issues | Use separate worktrees per agent, one per file ownership |

---

## 7. Success Criteria

- [ ] `design-system/tokens.json` exists with all canonical values
- [ ] Dashboard `tailwind.config.ts`: accent `#F59E0B`, no remaining `#00C8E8`
- [ ] Landing page tokens.css references only canonical values
- [ ] `npm run build` passes in both landing and dashboard
- [ ] All Stitch components render with gold accent
- [ ] No cyan `#00C8E8` references remain in dashboard src (grep zero hits)
- [ ] Dashboard pages visually consistent: gold accents, purple for info/secondary
- [ ] Landing page deploys to CF Pages, health check passes
- [ ] NOWPayments checkout flow unbroken

---

## 8. Unresolved Questions

- Stitch MCP auth: needs re-authentication or alternative connection method
- Geist→Inter font change: verify Google Fonts load times and FOIT handling
- Purple secondary usage ratio: how much purple vs gold in dashboard?
