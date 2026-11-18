# POLY-G5 Security & Multi-Tenant Threat Model

- **Date:** 2026-11-15
- **Scope:** `poly-beta-api` Worker, `poly-beta-dashboard` Pages, `poly-beta-db` D1, `TenantPaperEngine` DO, and Disabled Release B Signer Surface

---

## 1. Assets Protected & Trust Boundaries

1. **Tenant Identity & Session Integrity:** User credentials, session tokens, CSRF tokens, and per-user portfolio/order/ledger data in `poly-beta-db`.
2. **Zero-Custody Boundary:** Public Beta holds **$0 customer funds**, **zero wallet private keys**, **zero seed phrases**, and **zero token approvals**. Any API field containing `privateKey`, `seedPhrase`, `mnemonic`, `walletAddress`, or `tenantId` override is rejected with `403 CALLER_SCOPE_FORBIDDEN`.
3. **Production CashClaw Isolation:** `cashclaw.cc`, `quant.cashclaw.cc`, `api.cashclaw.cc/*`, `algo-trader` Worker, and `algo-trader-db` share zero routes, zero D1 databases, zero KV namespaces, and zero Durable Object classes with `poly-beta-*`.

---

## 2. STRIDE / OWASP Threat Matrix & Verified Controls

| Threat | Attack Vector | Implemented Mitigation | Automated Verification |
|---|---|---|---|
| **IDOR / Cross-Tenant Data Leakage** | User B queries/cancels User A's orders or passes `?tenantId=tn_alice` / body `{"tenantId":"tn_alice"}` | `tenant_id` is resolved **exclusively** from D1 `beta_sessions` join via SHA-256 hashed cookie; every SQL query binds `WHERE tenant_id = ?`; `detectForbiddenCallerAuthorityOverride` rejects any caller-supplied `tenantId`/`userId`/`walletAddress` with `403` | `tests/poly-beta/poly-beta-security-and-ledger.test.ts` (User A vs User B suite) |
| **CSRF (Cross-Site Request Forgery)** | Malicious site triggers `POST /api/beta/orders` or `DELETE /api/beta/account` using ambient `SameSite=None` cookie | Dual defense: (1) strict `Origin` allowlist (`isOriginPermitted`), and (2) per-session 192-bit `X-CSRF-Token` verified via constant-time `timingSafeHexEqual` on all non-`GET` routes | `poly-beta-security-and-ledger.test.ts` (`evil-attacker.example` & mismatched CSRF → `403`) |
| **XSS & Session Token Theft** | Injected script attempts to read session token from `localStorage` or `document.cookie` | Session token is stored only in `HttpOnly; Secure; SameSite=None` (`__Host_poly_beta_sid`) cookie, hashed with SHA-256 in D1 (`beta_sessions.session_hash`); API responses enforce `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'` and React escapes all dynamic text | Verified in `Set-Cookie` & security headers assertions |
| **Order Replay / Double-Spend Race** | Concurrent duplicate `POST /api/beta/orders` requests race to spend `$100` cash twice | All mutations for a tenant route through single-threaded `TenantPaperEngine` DO (`idFromName(tenantId)`) + `UNIQUE(tenant_id, idempotency_key)` constraint | Verified idempotent replay in `poly-beta-security-and-ledger.test.ts` |
| **Credential Stuffing / Brute Force** | High-rate password guessing on `/api/beta/auth/login` or `/signup` | PBKDF2-HMAC-SHA256 (`100,000` iterations, 16-byte random salt) + KV sliding-slot rate limiter (`12/min` login, `10/min` signup, `30/min` tenant mutations → `429`) | Verified `429 RATE_LIMITED` on 13th attempt |
| **Accidental Live Execution / Real-Money Exposure** | UI action, env drift, or API call triggers live order, deposit, or NOWPayments billing | (1) `LIVE_TRADING_ENABLED="false"` in `wrangler.poly-beta.toml`; (2) if flipped to `"true"`, Worker halts entirely with `503`; (3) all `/live`, `/deposit`, `/withdraw`, `/approve`, `/wallet`, `/webhooks/nowpayments` paths return `403 REAL_MONEY_OPERATIONS_DISABLED` | Verified `403` & `503` fail-closed tests |
| **Master Key Leakage in Future Live Runtime** | Operator accidentally passes Deposit Wallet owner key into trading process | `Poly1271SessionSigner` throws `MASTER_KEY_FORBIDDEN_IN_RUNTIME` and enforces session expiry (`SESSION_EXPIRED`) + EIP-712 `CLOB_V2_ORDER_FIELD_TYPES` recovery check | `tests/polymarket/clob-v2-order-signing-sdk-parity.test.ts` |
| **Account & Data Retention Risk** | Beta tester wants immediate erasure of email and trading history | Self-service `DELETE /api/beta/account` cancels DO alarms, wipes DO storage, deletes all rows across all 8 `beta_*` tables for `ctx.tenantId`, and clears session cookie | Verified `200` purge → subsequent `401` |

## Unresolved Questions
- None for Release A. If delegated session signing is ever proposed for Release B, independent smart-contract / key-custody security audit is required before G13.
