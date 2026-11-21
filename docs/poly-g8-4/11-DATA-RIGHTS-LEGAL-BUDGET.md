# POLY-G8.4 — Data Rights, Legal Eligibility & Budget Gates (Gates A–F)

- **Document ID:** `POLY-G8.4-11`
- **Date:** 2026-11-21
- **Governance Posture:** All six activation gates A–F remain **fail-closed (`HOLD`)**. No external correspondence was sent, no counsel was retained, no VPS or R2 bucket was provisioned, and no continuous external data collection was activated.

---

## 1. Gate A — Market Data Rights (`DATA_LICENSE = HOLD`)

- **Requirement:** Written clarification/permission from Polymarket before archiving continuous L2 WAL/Parquet data in cloud storage (VPS/R2) for derived analytics or commercial SaaS use. A public API/WebSocket endpoint is **not** automatic commercial redistribution or archival permission.
- **Prepared Artifact:** Sanitized outbound permission inquiry reviewed in PR `#282` (`docs/poly-g8-2-sanitized`) targeting official Polymarket contacts without fabricated sender/entity details.
- **Status:** **`READY_FOR_FOUNDER_SEND`** (cannot be sent from an unverified automated identity). Until written permission is received, `DATA_LICENSE = HOLD` and `IC_DAY_0 = null`.

---

## 2. Gate B — Vietnam Legal Eligibility (`VIETNAM_G12 = HOLD`, `LEGAL_G12 = HOLD`)

- **Requirement:** Independent qualified Vietnam legal counsel review prior to any real-capital activity or commercial execution.
- **Activity Separation Matrix (one permission does not cover another):**
  1. Read-only research (offline/local)
  2. Historical backtesting
  3. Paper-only SaaS (`USER_001` Paper Beta)
  4. Proprietary trading (founder capital)
  5. Customer execution
  6. Customer custody / deposits / withdrawals (explicitly **NOT AUTHORIZED**)
- **Status:** Preliminary legal brief prepared in PR `#282`; no payment to counsel authorized; `VIETNAM_G12 = HOLD`, `LEGAL_G12 = HOLD`.

---

## 3. Gate C — Operational Integrity (`PARTIAL` — `LINUX_SYSTEMD_RUNTIME = NOT_TESTED`)

- Offline Rust (`poly-book` 58/58, `ghost-guard` 54/54), Python uploader (31/31), and TypeScript Polymarket tests (418/418) pass reproducibly on macOS.
- Real Linux `systemd` unit runtime and live Cloudflare R2 SHA-256 object round-trip verification remain separate future acceptance steps on an authorized Linux host (`LINUX_SYSTEMD_RUNTIME = NOT_TESTED`).

---

## 4. Gate D — Infrastructure & Research Economics (`INFRA_BUDGET = HOLD`)

### Collector-Only Monthly Estimate (Pre-Tax, Pre-Data-Licensing)

| Scenario | Monthly Estimate | Assumptions & Integrity Rule |
|---|---|---|
| **Conservative** | `$31.06 / month` | No silent free-tier subtraction; no market-coverage reduction |
| **Base** | `$33.93 / month` | Standard 150+ market L2 collector + R2 storage/operations |
| **High Load** | `$59.32 / month` | Elevated volatility/event volume + retention overhead |

### IC Research Operating Model Gap

- The PDF's full IC research model assumes **2 engineers + ~$500–$800/month** in infrastructure and API/LLM inference costs.
- Current collector-only estimates (`$31.06–$59.32/mo`) exceed the previously unrevised collector ceiling and do **not** cover full IC research inference/ops or data-licensing fees.
- **Status:** **`INFRA_BUDGET = HOLD`** until Founder approves a revised budget allocation that honestly covers verified collector + storage + inference/licensing costs.

---

## 5. Gate E — Deployment Provenance (`HOLD` for `USER_001_INVITE`)

- Code-level provenance is recorded via exact Git SHAs (`main` `7319b8d0`, PR `#285` `784d6e98`, PR `#288` `156642fd`, PR `#289` `a9463d95`, PR `#290` `7e7faca0`) and `package-lock.json` SHA-256 (`a4bb5c13164be4cbf7115e5a2b81db2ec50b35989c28065a06c68c472ce932ab`).
- Production Cloudflare Worker (`https://api.cashclaw.cc`) deployed build provenance against `pnpm-lock.yaml` vs pre-PR `#288` `package-lock.json` requires Founder confirmation before lifting `USER_001_INVITE = HOLD`.

---

## 6. Gate F — Founder Activation (`VPS_R2_ACTIVATION = HOLD`, `FOUNDER_G13 = HOLD`)

Technical readiness across Gates A–E never triggers automatic provisioning, continuous market-data ingestion, or live trading. Every activation step requires explicit Founder authorization.
