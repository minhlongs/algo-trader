# Web Test Report — cashclaw.cc

**Date:** 2026-06-30 14:19 ICT | **Tool:** Lighthouse + manual security/HTTP audit

---

## 1. HTTP & Uptime

| Domain | HTTP | Latency | TLS |
|--------|------|---------|-----|
| `cashclaw.cc` | ✅ 200 | CF Edge | ✅ HTTPS |
| `www.cashclaw.cc` | ✅ 200 | CF Edge | ✅ HTTPS |
| `quant.cashclaw.cc` | ✅ 200 | CF Edge | ✅ HTTPS |
| `algo-trader.agencyos-openclaw.workers.dev` (API) | ✅ 200 | CF Edge | ✅ HTTPS |
| `/api/version` | ✅ 200 | SHA `b1c0e96a` | — |
| `/health` | ✅ 200 | `status: ok` | — |

---

## 2. Lighthouse Scores

### cashclaw.cc (Landing)
| Category | Score |
|----------|-------|
| Performance | 82/100 |
| Accessibility | 90/100 |
| Best Practices | 100/100 |
| SEO | 91/100 |
| Agentic Browsing | 67/100 |

**Top issues:**
- Render-blocking CSS (`tokens.css`, `components.css`) — 1,830ms saved
- No `<main>` landmark — accessibility
- Color contrast insufficient in places
- Cache lifetime too short (5 KiB savings)

### quant.cashclaw.cc (Dashboard)
| Category | Score |
|----------|-------|
| Performance | 83/100 |
| Accessibility | 93/100 |
| Best Practices | 92/100 |
| SEO | 82/100 |
| Agentic Browsing | 66/100 |

**Top issues:**
- 279 KiB unused JavaScript
- Browser console errors logged
- Missing `<meta name="description">`
- No `<main>` landmark

---

## 3. Security Headers

| Header | cashclaw.cc | quant.cashclaw.cc |
|--------|:-----------:|:-----------------:|
| **HSTS** (`strict-transport-security`) | ❌ MISSING | ✅ `max-age=31536000; includeSubDomains; preload` |
| **CSP** (`content-security-policy`) | ❌ MISSING | ✅ `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; ...` |
| **X-Frame-Options / frame-ancestors** | ❌ MISSING | ✅ `frame-ancestors 'none'` |
| **Permissions-Policy** | ❌ MISSING | ✅ `camera=(), microphone=(), geolocation=(), payment=()` |
| **X-Content-Type-Options** | ✅ `nosniff` | ✅ `nosniff` |
| **Referrer-Policy** | ✅ `strict-origin-when-cross-origin` | ✅ `strict-origin-when-cross-origin` |

**⚠️ Landing page (`cashclaw.cc`) thiếu toàn bộ security headers.** Dashboard (`quant.cashclaw.cc`) OK.

---

## 4. API CORS

| Origin | Allowed |
|--------|---------|
| `cashclaw.cc` | ✅ `Access-Control-Allow-Origin: https://cashclaw.cc` |
| Methods | GET, POST, PUT, DELETE, OPTIONS |

---

## 5. Page Metadata

| Tag | cashclaw.cc |
|-----|-------------|
| `<title>` | ✅ CashClaw — AI-Powered Prediction Market Analytics |
| `<meta description>` | ✅ Beat prediction markets with calibrated AI... |
| `<meta viewport>` | ✅ width=device-width, initial-scale=1.0 |
| `robots.txt` | ❌ Returns HTML (no file) |
| `<html lang>` | ✅ `lang="en"` |

---

## 6. Summary

| Area | Status | Action |
|------|--------|--------|
| Uptime | ✅ All 4 endpoints | — |
| TLS/HTTPS | ✅ | — |
| Performance | ⚠️ 82-83 | Optimize CSS delivery, split unused JS |
| Security Headers | ❌ Landing | Add HSTS, CSP, X-Frame-Options, Permissions-Policy |
| Accessibility | ⚠️ 90-93 | Add `<main>` landmark, fix contrast |
| API | ✅ | CORS locked to cashclaw.cc, version verified |

## Unresolved

- `cashclaw.cc` landing page is vanilla HTML/CSS served from CF Pages — who maintains the source? (not in this repo)
- `quant.cashclaw.cc` console errors logged — need JS source access to debug
