# Design System — Neg Risk Dashboard

## Colors
- `bg-bg` (#060814) — primary background
- `bg-bg-card` (#101426) — card/panel background
- `border-bg-border` (rgba(255,255,255,0.05)) — borders
- `text-accent` (#00D9FF) — cyan accent, primary actions
- `text-profit` (#00FFA3) — positive values
- `text-loss` (#FF2E93) — negative values
- `text-muted` (#8892B0) — secondary text
- `text-white` — primary text

## Typography
- `font-mono` — prices, numbers, market names
- `font-bold` — headings, stat values
- `text-xs` — table cells, labels
- `text-sm` — buttons, secondary text
- `text-base` — card titles
- `text-2xl` — stat values

## Spacing
- `p-4` / `p-5` — card padding
- `gap-4` — grid gaps (cards)
- `gap-6` — section gaps
- `px-4 py-3` — table cell padding

## Components
- `<header>` — top bar with logo + nav
- `<div className="grid grid-cols-1 sm:grid-cols-3">` — stats cards row
- `<div className="bg-bg-card border border-bg-border rounded-xl">` — card container
- `<table>` — data table with striped rows
- `<input type="range">` — threshold slider
- `<button className="bg-accent text-bg">` — primary action button

## Notes
- Dark theme only (no light mode)
- Desktop-first, responsive down to mobile
- Tailwind CSS utility classes
- Generated for algo-trader dashboard
