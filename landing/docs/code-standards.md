# Code Standards — cashclaw.cc Landing Page

## HTML

- Semantic HTML5 landmarks (`<nav>`, `<main>`, `<section>`, `<footer>`)
- `aria-label` on all interactive elements
- `aria-hidden="true"` on decorative-only elements
- Skip-to-content link as first `<body>` child
- `<meta name="theme-color">` for browser chrome
- No inline styles — all styling via `tokens.css` + `<style>` block in `<head>`
- Max 1 `<style>` block per page for critical above-fold tweaks only

## CSS (tokens.css)

- All design values as CSS custom properties in `:root`
- No raw hex/rgba in HTML or `<style>` blocks — reference `var(--xxx)` only
- Naming: `--{category}-{variant}` (e.g. `--color-gold`, `--text-primary`, `--space-8`)
- Categories: `color-`, `text-`, `font-`, `space-`, `radius-`, `shadow-`, `duration-`, `ease-`
- Mobile-first breakpoints: 375 / 768 / 1024 / 1440
- `prefers-reduced-motion` support mandatory
- `:focus-visible` outline mandatory
- File under 300 lines — split to separate file if exceeding

## Fonts

- Google Fonts only (no self-hosted)
- Preconnect to `fonts.googleapis.com` + `fonts.gstatic.com`
- Cabinet Grotesk (headings), DM Sans (body), JetBrains Mono (data)
- `font-display: swap` for no FOIT

## Security

- CSP: `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; ...`
- HSTS: `max-age=31536000; includeSubDomains; preload`
- No external scripts (no Google Analytics, no third-party trackers)
- No `target="_blank"` without `rel="noopener noreferrer"`

## Performance

- Inline critical CSS in `<style>` block (above-fold only)
- `tokens.css` loaded via `<link>` (cacheable, CDN-optimized)
- No render-blocking JS
- SVG inline for charts (no external images)
- Font preconnect to warm up DNS
