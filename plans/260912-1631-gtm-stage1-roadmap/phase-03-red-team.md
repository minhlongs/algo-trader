# Phase 03: Red Team Security Analysis / Phân tích An ninh Đội Đối lập
> **Require / Yêu cầu:** Every flow attacked from 3 attacker perspectives. Each finding has severity, likelihood, and remediation. / Mỗi luồng bị tấn công từ 3 góc nhìn attacker. Mỗi finding có mức độ, xác suất, và khắc phục.

---

## Attacker Perspective 1: Payment Fraud / Lừa đảo Thanh toán

### Finding R1: IPN Replay Attack
- **Attack:** Replay a captured NOWPayments IPN payload with manipulated status field. If idempotency is not enforced, second replay could re-activate tier or credit duplicate balance.
- **Severity:** HIGH
- **Likelihood:** MEDIUM (requires captured payload, but IPN endpoints are public)
- **Evidence needed:** Review `/api/webhooks/nowpayments` handler for idempotency key check on `payment_id`.
- **Remediation:** Store processed `payment_id` in D1 `processed_ipns` table. Reject duplicate with HTTP 200 (acknowledge) but no-op.

### Finding R2: Amount Tampering
- **Attack:** Intercept checkout redirect, modify `amount` query param before redirect back. If server trusts client amount, user could pay $0.01 for BASIC tier.
- **Severity:** HIGH
- **Likelihood:** LOW (requires MITM or browser extension; NOWPayments validates amount server-side too)
- **Evidence needed:** Check that tier activation reads amount from NOWPayments API, not redirect query string.
- **Remediation:** Activate tier only after confirming `payment.pay_amount` from NOWPayments API matches expected amount.

### Finding R3: Tier Bypass via URL Manipulation
- **Attack:** Change `/pricing?tier=PREMIUM` param or modify client-side state to access PREMIUM features without payment.
- **Severity:** HIGH
- **Likelihood:** LOW (if server-side tier gate is enforced)
- **Evidence needed:** Audit all tier checks — they must query DB `users.tier` on every request, not read from client state.
- **Remediation:** Every PAID-route handler must call `getUserTier(userId)` from `@/seed/db/get-user-tier`. No client-side tier flag is trusted.

### Finding R4: Chargeback Velocity Abuse
- **Attack:** Place $1 test order, immediately chargeback via NOWPayments, repeat. Refund loop could drain platform.
- **Severity:** MEDIUM
- **Likelihood:** LOW (NOWPayments handles chargeback risk; $1 limits exposure)
- **Evidence needed:** Check if chargeback creates a negative balance or refunds without deactivating tier.
- **Remediation:** On chargeback IPN (`status=refunded`), immediately downgrade tier to FREE. Flag account for manual review.

---

## Attacker Perspective 2: Data Exfiltration / Trích xuất Dữ liệu

### Finding R5: API Key Leak in Client Bundle
- **Attack:** BYOK keys (OpenRouter, ElevenLabs, D-ID) stored client-side could be extracted from browser DevTools or bundle.
- **Severity:** CRITICAL
- **Likelihood:** LOW (keys should never reach client; BYOK stores encrypted server-side)
- **Evidence needed:** Grep built `dist/` for any env vars matching `OPENROUTER|ELEVENLABS|D_ID|API_KEY` patterns.
- **Remediation:** Confirm all AI service calls route through server-side worker. Zero API keys in client JS bundle.

### Finding R6: SQL Injection in Order/Webhook Paths
- **Attack:** Inject SQL via webhook input fields (email, order_id) if D1 queries use string concatenation.
- **Severity:** HIGH
- **Likelihood:** LOW (D1 prepared statements are standard in this codebase)
- **Evidence needed:** Audit all D1 queries in webhook handler and order paths for `db.prepare(...).bind(userInput)` vs string interpolation.
- **Remediation:** Force parameterized queries only. No `WHERE id = '${input}'` patterns.

### Finding R7: PII in Worker Logs
- **Attack:** Worker logs user email, invoice data, or payment details to Cloudflare logs. Logs are visible to CF account admin.
- **Severity:** MEDIUM
- **Likelihood:** MEDIUM (common oversight during debugging)
- **Evidence needed:** Grep source for `console.log|console.warn|console.error` that include user data. Check logger utility redacts PII.
- **Remediation:** Use structured logger that auto-redacts email, phone, payment IDs. Prohibit `console.*` in production (ESLint rule).

### Finding R8: SSRF via Webhook Callback
- **Attack:** If webhook handler fetches external URLs based on user input (e.g., delivery callback URL), attacker could make worker SSRF to internal services.
- **Severity:** MEDIUM
- **Likelihood:** LOW (Energy 9 delivery is internal; no user-controlled URLs)
- **Evidence needed:** Check `/api/delivery/energy-9` and any callback endpoints for user-controlled URL parameters.
- **Remediation:** Blocklist private IP ranges (10.x, 172.16.x, 192.168.x, 127.x). Allowlist only known CDN/internal origins.

---

## Attacker Perspective 3: Supply Chain / Chuỗi Cung ứng

### Finding R9: Dependency CVEs
- **Attack:** Known vulnerabilities in `npm` dependencies used by the project.
- **Severity:** MEDIUM
- **Likelihood:** MEDIUM (dependencies update frequently)
- **Evidence needed:** Run `npm audit --audit-level=moderate` and list findings.
- **Remediation:** `npm audit fix`. For unfixable, add `overrides` in package.json. Dependabot enabled.

### Finding R10: Cloudflare API Token Scope
- **Attack:** CF API token used in CI or scripts has broader scope than needed (e.g., account:write when only account:read needed).
- **Severity:** MEDIUM
- **Likelihood:** LOW (token created by operator, scope reviewed)
- **Evidence needed:** Check CF token permissions in `.env` or secrets manager.
- **Remediation:** Minimize token to specific resources (D1:admin for target DB only).

### Finding R11: D1 Migration Not Versioned in Git
- **Attack:** If migrations are not checked into git, a compromised deploy could alter schema without detection.
- **Severity:** HIGH
- **Likelihood:** LOW (migrations are in `migrations/` folder, presumably versioned)
- **Evidence needed:** Verify `migrations/` is tracked in git and each migration has sequential hash naming (Wrangler convention).
- **Remediation:** All migrations in git. Pre-deploy CI runs `wrangler d1 migrations list` to verify no pending drift.

---

## Risk Matrix / Ma trận Rủi ro

| Finding | Severity | Likelihood | Remediation Status |
|---------|----------|------------|-------------------|
| R1 IPN replay | HIGH | MEDIUM | Must fix before prod |
| R2 Amount tampering | HIGH | LOW | Fix before prod |
| R3 Tier bypass | HIGH | LOW | Must fix (already server-side) |
| R4 Chargeback | MEDIUM | LOW | Accept with owner |
| R5 API key leak | CRITICAL | LOW | Must pass before Phase 01 |
| R6 SQL injection | HIGH | LOW | Auditable, likely clean |
| R7 PII in logs | MEDIUM | MEDIUM | Fix before prod |
| R8 SSRF | MEDIUM | LOW | Verify no user URL params |
| R9 Dependency CVEs | MEDIUM | MEDIUM | Fix before deploy |
| R10 Token scope | MEDIUM | LOW | Review before deploy |
| R11 Migration versioning | HIGH | LOW | Verify in git |

---

## GOM Opposition Findings / Kết quả Phản biện GOM

| # | Challenge | Target | Severity | Resolution |
|---|-----------|--------|----------|-----------|
| O1 | $1 test order may not trigger real NOWPayments IPN in sandbox — verify test mode | GOV (Phase 01) | P0 | Use NOWPayments sandbox mode, verify IPN endpoint receives sandbox IPNs |
| O2 | `cashclaw.cc` DNS CNAME migration may break existing traffic for 48h | OPS | P0 | Zero-downtime: add CNAME, verify both hosts serve, then decommission old |
| O3 | No SLA defined for Alpha Vang page uptime | GOV | P1 | Draft SLA (99.5% uptime, <2s p95 response) during Phase 04 |
| O4 | Energy 9 delivery pipeline has no refund/fallback path | GOV | P1 | Define A/B: success → onboarding, failure → retry queue + alert |
| O5 | Phase 01 checklist has no explicit evidence submission timeline | GOV | P1 | Each checklist item must produce evidence artifact within T+X hours |

**Moderator Decision:**
- O1 → P0, must resolve before T5 (IPN test)
- O2 → P0, must resolve before U1 (DNS check)
- O3 → P1, resolves before Phase 05
- O4 → P1, resolves before Phase 04
- O5 → P1, resolves within Phase 01

GO with conditions. Phase 03 begins after all P0 security findings (R1, R3, R5, R6, R11) confirmed addressed.

---

## Sign-off / Phê duyệt

- **GOM Opposition Gate:** All HIGH/CRITICAL findings addressed or accepted as residual risk with named owner.
- **GOM Government Response:** Each finding above has remediation plan.
- **GOM Moderator:** GO → Phase 04 once P0 findings confirmed.
