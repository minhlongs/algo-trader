# Phase 04: Blocker Validation / Xác thực Chặn
> **Require / Yêu cầu:** All blockers resolved or accepted with owner + milestone + residual risk sign-off before Phase 05. / Tất cả cản trở được giải quyết hoặc chấp nhận với người phụ trách + cột mốc + phê duyệt rủi ro trước Phase 05.

---

## Blocker Register / Danh sách Cản trở

| ID | Blocker / Cản trở | Origin / Nguồn | Severity | Owner | Resolution | Deadline | Status |
|----|-------------------|----------------|----------|-------|------------|----------|--------|
| B1 | NOWPayments IPN endpoint not verified in prod | Phase 01 T5 | P0 | Platform Ops | Deploy + IPN smoke test with sandbox | T+2h | Open |
| B2 | `api.cashclaw.cc` DNS propagation not confirmed | Phase 01 U1, O2 | P0 | Infra | CF DNS purge + TTL verify + curl check | T+1h | Open |
| B3 | Alpha Vang product page content not drafted | Phase 01 A2, O3 | P1 | Content | Bilingual VN+EN copy in `landing/app/alpha-vang/page.tsx` | T+24h | Open |
| B4 | Energy 9 delivery pipeline undefined | Phase 01 E1, O4 | P1 | Engineering | Wire `POST /api/delivery/energy-9` with success/fallback paths | T+48h | Open |

---

## Blocker Resolution Protocol / Giao thức Giải quyết

For each blocker, the GOM tri-cameral runs:

1. **Government (G)** proposes resolution approach / đề xuất giải pháp
2. **Opposition (O)** challenges sufficiency / thách thức đủ đầy
3. **Moderator (M)** accepts, modifies, or rejects / chấp nhận, sửa, hoặc bác bỏ

### B1: NOWPayments IPN Endpoint — P0 / P0

**Government (G) proposal:**
- Deploy current branch to production with `npm run deploy:full`
- Send test IPN from NOWPayments sandbox dashboard to production URL
- Verify D1 `payments` table receives row with `status='paid'`
- Verify `users.tier` updates from `FREE` to `BASIC`
- Confirm within T+2h

**Opposition (O) challenges:**
- O1: "Deploying to prod just to test IPN is risky if other Phase 01 items (T1-T4) are not yet verified." → G response: This IS the blocker. T1-T4 have local/staging evidence. Only T5 requires prod.
- O2: "Sandbox IPN may not fire in prod mode — NOWPayments docs say sandbox IPNs only go to sandbox endpoints." → G response: Verify NOWPayments API key mode. If sandbox key → use sandbox URL. If production key → test in prod.
- O3 (P0 challenge): "What if IPN fails silently? Need a dead-man alert." → G acceptance: Add alert to Grafana: if no IPN received within 30 min of checkout redirect, fire alert.

**Moderator (M) decision:**
- O2 is P0 — must verify API key mode before any IPN test
- O3 accepted as residual risk with owner (Platform Ops, alert config during deploy)
- GO: Verify API key mode first, then run IPN smoke test

**Resolution criteria (measurable):**
```bash
# 1. Verify IPN endpoint reachable
curl -X POST https://api.cashclaw.cc/api/webhooks/nowpayments \
  -H "Content-Type: application/json" \
  -d '{"payment_id":"test_001","status":"waiting","pay_address":"test"}'
# Expected: HTTP 200

# 2. Check D1 for payment record
# (via wrangler d1 execute or admin dashboard)
# Expected: row exists with payment_id='test_001'

# 3. Live IPN from NOWPayments sandbox
# Use NOWPayments dashboard to trigger test IPN
# Expected: D1 row created within 10 seconds
```

---

### B2: DNS Propagation — P0 / P0

**Government (G) proposal:**
- `api.cashclaw.cc` CNAME → Cloudflare Workers route
- CF DNS purge: `curl -X POST "https://api.cloudflare.com/client/v4/zones/<zone_id>/purge_cache" ...`
- Verify from multiple geographic endpoints:
  - Vietnam: `curl -sI https://api.cashclaw.cc --resolve api.cashclaw.cc:443:<ip>`
  - Global: `dig api.cashclaw.cc +short`
- SSL cert auto-provisioned by CF (Let's Encrypt), verify with `openssl s_client`

**Opposition (O) challenges:**
- O1 (P0): "Previous CNAME change broke traffic for 48h. How do we guarantee zero downtime?" → G: Add new CNAME first, verify both old and new serve, then remove old after 24h grace period.
- O2: "SSL cert may not auto-provision if Workers route not activated yet." → G: Activave Workers route first, wait 5 min for cert, then switch DNS.

**Moderator (M) decision:**
- O1 accepted — use dual-CNAME strategy
- O2 accepted — activate route first, cert second, DNS last
- GO: Follow sequence (route → cert → DNS with dual-CNAME)

**Resolution criteria:**
```bash
# 1. CF Workers route active
curl -s https://api.cashclaw.cc/api/health
# Expected: HTTP 200

# 2. SSL valid
echo | openssl s_client -connect api.cashclaw.cc:443 -servername api.cashclaw.cc 2>/dev/null | openssl x509 -noout -dates
# Expected: notAfter > today + 30 days

# 3. DNS propagated globally
dig api.cashclaw.cc +short
# Expected: CF edge IP
```

---

### B3: Alpha Vang Page Content — P1 / P1

**Government (G) proposal:**
- Content drafted in `landing/app/alpha-vang/page.tsx`
- Bilingual VN+EN structure:
  - Headline: "Alpha Vang / Alpha Vang"
  - Subheadline: "Energy 9 Solution — Automate your energy strategy / Giải pháp Năng lượng 9 — Tự động hóa chiến lược năng lượng"
  - Body: Vietnamese primary, English secondary (or side-by-side toggle)
  - CTA: "Get Started — $1 Trial / Bắt đầu — Dùng thử $1"
- Placeholder images with alt text; video embed placeholder (to be replaced by actual media)

**Opposition (O) challenges:**
- O1: "Placeholder content leaks on page load before real content is ready." → G: Use skeleton loading or staging flag.
- O2: "No pricing on product page — user must navigate to /pricing. Add inline pricing." → G accepted: Add BASIC $1 tier price directly on Alpha Vang page to reduce friction.

**Moderator (M) decision:**
- O1 accepted as development note (skeleton placeholder OK during build, must be real content at deploy)
- O2 accepted — inline pricing reduces conversion friction
- GO: Draft bilingual content with inline pricing, target T+24h

---

### B4: Energy 9 Delivery Pipeline — P1 / P1

**Government (G) proposal:**
- Endpoint: `POST /api/delivery/energy-9` (Server Action or API route)
- Auth: Requires `users.tier >= BASIC`
- Success path: Generate delivery confirmation, update `user_deliveries` table, trigger onboarding guide
- Failure path: Retry queue (3 attempts, exponential backoff), alert on final failure
- A/B paths:
  - A (success): delivery record created → onboarding guide available → email confirmation
  - B (failure): retry queue entry → alert to ops → user sees "delivery pending" status

**Opposition (O) challenges:**
- O1 (P1): "Delivery endpoint with no rate limit could be abused. What happens if user spams it?" → G: Rate limit to 1 request per user per 30 min. Subsequent calls return current delivery status.
- O2 (P1): "No SLA for delivery completion. How long before user gets Energy 9 access?" → G: Delivery is digital (API-gated), so instant. "Pending" state max 5 min (retry window).
- O3: "What if user's tier is downgraded (chargeback) after delivery? Do we revoke access?" → G tier downgrade handler must check `user_deliveries.energy_9` and downgrade accordingly.

**Moderator (M) decision:**
- O1 accepted — rate limit at endpoint layer
- O2 accepted — 5 min SLA documented
- O3 accepted — downgrade handler checks deliveries
- GO: Wire endpoint with rate limit + retry + downgrade awareness

**Resolution criteria:**
```bash
# 1. Endpoint responds with auth
curl -X POST https://api.cashclaw.cc/api/delivery/energy-9 \
  -H "Authorization: Bearer <BASIC_USER_TOKEN>"
# Expected: HTTP 200 with delivery confirmation

# 2. FREE tier rejected
curl -X POST https://api.cashclaw.cc/api/delivery/energy-9 \
  -H "Authorization: Bearer <FREE_USER_TOKEN>"
# Expected: HTTP 403

# 3. Rate limit enforced
# Send 5 requests in 60 seconds
# Expected: 4th+ request returns 429
```

---

## Escalation Protocol / Giao thức Escalate

| Scenario | Escalation Path | Threshold |
|----------|----------------|-----------|
| B1 not resolved within T+2h | `/mekong escalate incident-escalate` | Payment flow blocked |
| B2 DNS not propagated within T+1h | Manual CF purge + CF support ticket | Zero revenue until resolved |
| B3 not drafted within T+24h | Content team escalation | Alpha Vang page cannot launch |
| B4 not wired within T+48h | Engineering sprint | Energy 9 delivery delayed |

---

## GOM Moderator Gate / Cổng Điều tiết GOM

| Criterion | Threshold for GO | Current State |
|-----------|-----------------|---------------|
| P0 blockers | 0 unresolved | B1, B2 open |
| P1 blockers | 0 unresolved | B3, B4 open |
| Security findings (Phase 03) | All HIGH/CRITICAL addressed | Pending Phase 03 |
| Evidence artifacts | Each blocker has resolution artifact | None yet |

**Gate Status:** CLOSED until all P0 blockers (B1, B2) resolved and Phase 03 complete.
Phase 05 may not begin until gate opens.
