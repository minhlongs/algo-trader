# UI Pipeline — 7 Remaining Items

> Brainstorm scope: 7 UI/design items using Stitch + frontend-design + ui-styling + ui-ux-pro-max
> Credits available: 386 | Mode: brainstorm → ck:plan --deep --parallel

---

## Items

| # | Item | Skill | Effort | Stitch Credits | Deps |
|---|------|-------|--------|---------------|------|
| 1 | Stitch Mobile App (React Native) | Stitch MOBILE + react-native-components | L | 7 | — |
| 2 | Admin/Ops Dashboard | Stitch DESKTOP + frontend-design | M | 3 | — |
| 3 | Dark Mode Toggle | ui-styling | S | 0 | — |
| 4 | i18n Dashboard | frontend-design | M | 0 | — |
| 5 | Landing Page Refresh | Stitch + ui-ux-pro-max | M | 3 | — |
| 6 | Animated Components | stitch-animate + motion | S | 0 | 3? |
| 7 | Accessibility Audit | stitch-a11y | S | 0 | 3,6 |

## Execution Structure

3 parallel tracks:

**Track A: Mobile (Items 1, 5)** — Generate 7 screens with deviceType MOBILE + landing page → stitch-react-native + stitch-html-components
**Track B: New Panels (Items 2, 4)** — Admin dashboard Stitch → frontend-design i18n
**Track C: Polish (Items 3, 6, 7)** — Dark mode toggle → animations → accessibility audit (sequential: 3→6→7)

## Risk

- Stitch MCP auth may block design system creation — CLI scripts work (verified)
- Mobile layout differs significantly from desktop — verify at 375px
- Dark mode + animations must respect prefers-reduced-motion
