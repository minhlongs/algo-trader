# Phase 01: Execution Checklist / Danh sách Kiểm tra Thực thi
> **Require / Yêu cầu:** ALL items must PASS before Phase 02. Every item is challenged by GOM Opposition / TẤT CẢ items phải ĐẠT trước Phase 02. Tất cả items bị Opposition GOM thách thức.

---

## Pre-flight / Kiểm tra Trước Khởi động

| ID | Check | Owner | Pass Criterion | GOM Challenge |
|----|-------|-------|----------------|---------------|
| F1 | `npm run build` → 0 TypeScript errors | Platform | Exit 0, zero TS errors | Show build log, confirm no "error TS" lines |
| F2 | `npm test` → all green | QA | 844+ tests, 0 failures | Run `npx vitest run --reporter=verbose`, screenshot output |
| F3 | `.env` secrets loaded, not committed | Platform | `git ls-files .env*` returns only `.env.example` | Opposition verifies no secret blob in git history |
| F4 | NOWPayments IPN URL reachable at `POST /api/webhooks/nowpayments` | Platform | `curl -X POST <url>` returns 200 or 401 (auth-protected OK) | Verify route exists in wrangler.toml + source code |
| F5 | `api.cashclaw.cc` DNS → 200 OK with valid SSL | Infra | `curl -sI https://api.cashclaw.cc` → HTTP/2 200, cert valid >30 days | Opposition runs `openssl s_client` to verify chain |
| F6 | D1 database migrations applied | Platform | `npx wrangler d1 migrations apply <db>` → no errors | Check `migrations/` folder for unapplied migration files |

---

## Test Order Flow / Luồng Đặt Hàng Kiểm Tra

Each test step must complete with verifiable evidence (screenshot, log, DB record).

| ID | Step / Bước | Action / Hành động | Pass Criterion / Tiêu chí Đạt | GOM Challenge / Thách thức GOM |
|----|------------|--------------------|-------------------------------|-------------------------------|
| T1 | Register / Đăng ký | Visit cashclaw.cc, create account with test email | Account row in D1 `users` table, email confirmation sent | Opp: check email actually arrives (not spam-foldered) |
| T2 | FREE tier access / Truy cập FREE | Log in, confirm dashboard loads | Dashboard renders, no payment prompt for FREE features | Opp: attempt access to PAID-only route, expect 402/403 |
| T3 | Upgrade → tier BASIC ($1) / Nâng cấp → BASIC ($1) | Click upgrade, select BASIC tier | Redirect to NOWPayments checkout for $1 USD | Opp: verify checkout amount pulled from server, not client |
| T4 | NOWPayments checkout redirect / Chuyển hướng thanh toán | Complete $1 test payment in NOWPayments sandbox | Redirect back to cashclaw.cc with `?payment=success` | Opp: check redirect URL is whitelisted origin |
| T5 | IPN callback received / Nhận callback IPN | NOWPayments sends IPN POST to `/api/webhooks/nowpayments` | Log entry in D1 `payments` table with status `paid` | Opp: replay the same IPN payload → expect 200 with "already processed" |
| T6 | Tier activation in DB / Kích hoạt tier trong DB | IPN handler updates `users.tier` to `BASIC` | `SELECT tier FROM users WHERE email = <test_email>` returns `BASIC` | Opp: check row updated within 5 seconds of IPN |
| T7 | User sees active BASIC tier / Người dùng thấy BASIC active | Refresh dashboard post-payment | UI shows "BASIC" badge, PAID features unlocked | Opp: log out + back in, badge persists (session validated from DB) |
| T8 | Confirmation email sent / Email xác nhận gửi đi | Automated email triggered on tier change | Email received with order confirmation + receipt | Opp: check email contains order ID matching DB record |

**T-flow blocker resolution:** T5 (IPN idempotency) must pass before T6 is meaningful.

---

## Cashclaw.cc Upgrade / Nâng Cấp Cashclaw.cc

| ID | Step / Bước | Check / Kiểm tra | Pass Criterion | GOM Challenge |
|----|------------|-------------------|----------------|--------------|
| U1 | SSL certificate | `curl -v https://cashclaw.cc` | Cert valid, chain complete, >30 days expiry | Opp: check cert is NOT self-signed |
| U2 | Landing page performance | `curl -o /dev/null -w "%{time_total}" https://cashclaw.cc` | <2s on first load | Opp: test from VN endpoint (latency realistic) |
| U3 | Pricing page | Navigate to `/pricing` | Three tiers displayed (FREE, BASIC, PREMIUM) with prices | Opp: verify prices match TIER_CONFIG in seed |
| U4 | Email verification flow | Register with test email, check inbox | Verification link arrives, clicking activates account | Opp: test with disposable email domain — expect block |
| U5 | Payment button → NOWPayments | Click "Upgrade" on pricing page | NOWPayments checkout opens in new tab/window | Opp: verify button URL is server-rendered, not client-injectable |

---

## Alpha Vang / Alpha Vang

Target page: `/alpha-vang` on cashclaw.cc. This is the product-facing page for "Alpha Vang Energy 9 Solution."

| ID | Step / Bước | Check / Kiểm tra | Pass Criterion | GOM Challenge |
|----|------------|-------------------|----------------|--------------|
| A1 | Page routing | Navigate to `/alpha-vang` | HTTP 200, page renders without error | Opp: try `/alpha-vang/`, `/alpha-vang?test=1` — expect 404 or same page |
| A2 | Bilingual content | Page contains both Vietnamese and English text | VN+EN copy in headings and body | Opp: verify no placeholder text ("Lorem ipsum", "TODO") |
| A3 | Tier gating | FREE user visits `/alpha-vang` | BASIC+ tier required, FREE user sees "Upgrade to access" | Opp: attempt BASIC features as FREE user, expect 403 |
| A4 | Demo/teaser media | Page has embedded video or image | Media loads, has alt text, <5MB | Opp: check media CDN URL is not a local file path |
| A5 | CTA wired to checkout | "Get Started" button clickable | Links to NOWPayments checkout for BASIC tier | Opp: inspect button href — must be server-generated URL, not hardcoded |

---

## Energy 9 Solution / Giải pháp Năng lượng 9

Delivery endpoint: `POST /api/delivery/energy-9`. Triggered after successful BASIC tier payment.

| ID | Step / Bước | Check / Kiểm tra | Pass Criterion | GOM Challenge |
|----|------------|-------------------|----------------|--------------|
| E1 | Endpoint responds | `POST /api/delivery/energy-9` with valid BASIC token | HTTP 200 with delivery confirmation payload | Opp: test without auth header → 401. Test with FREE tier → 403 |
| E2 | Onboarding guide in app | After delivery, user sees Energy 9 onboarding | Guide appears in user dashboard under "My Solutions" | Opp: verify guide content references actual delivered artifact |
| E3 | Invoice/receipt generation | Payment triggers invoice creation | PDF or structured invoice linked in user account | Opp: check invoice contains real order ID, not template stub |
| E4 | Support escalation path | User has way to request help on Energy 9 | Support email/bot command documented and functional | Opp: try support contact, verify response SLA documented |

---

## Active Blockers / Cản Trở Đang Hoạt động

| ID | Blocker | Source | Severity | Owner | Resolution | Deadline |
|----|---------|--------|----------|-------|------------|----------|
| B1 | NOWPayments IPN endpoint not verified in prod | T5 | P0 | Platform Ops | Deploy + IPN smoke test | T+2h |
| B2 | `api.cashclaw.cc` DNS propagation | U1 | P0 | Infra | CF DNS purge + TTL verify | T+1h |
| B3 | Alpha Vang product page content not drafted | A2 | P1 | Content | Bilingual VN+EN copy | T+24h |
| B4 | Energy 9 delivery pipeline undefined | E1 | P1 | Engineering | Wire `/api/delivery/energy-9` | T+48h |

---

## GOM Phase 01 Sign-off / Phê Duyệt GOM Phase 01

- **Government (G) submission:** All checklist items submitted with evidence artifacts
- **Opposition (O) challenge:** All items challenged, P0 findings must be resolved
- **Moderator (M) decision:** GO → Phase 02 / NO-GO → fix blockers, resubmit

**Phase 01 complete when:** F1-F6 green, T1-T8 green, U1-U5 green, A1-A5 green (content OK with B3 tracked), E1-E4 tracked (E1 wired, E2-E4 post-delivery), B1+B2 resolved.
