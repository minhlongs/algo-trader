# POLY-G10.3B — Polymarket Data Rights & Licensing Decision Pack

> **HISTORICAL AUDIT RECORD — STRATEGICALLY REBASELINED BY `#POLY-G10.5` (`2026-11-24`):** Preserved intact without erasure as historical evidence. Vietnam customer targeting (`TARGET_VIETNAM_CUSTOMERS=false`) and universal Vietnam-assumed operator defaults are superseded by the global-first, jurisdiction-aware framework in [`docs/poly-g10/13-GLOBAL-FIRST-STRATEGIC-REBASELINE.md`](./13-GLOBAL-FIRST-STRATEGIC-REBASELINE.md) and [`docs/poly-g10/14-JURISDICTION-AND-RESEARCH-RIGHTS-MATRIX.md`](./14-JURISDICTION-AND-RESEARCH-RIGHTS-MATRIX.md). `DATA_LICENSE = HOLD` remains strictly enforced for all unresolved permissions.

**Date:** 2026-11-24  
**Baseline:** `main` @ `68469cfeff09c82416778b1c09816d7005673c6c` (`G10_ENGINEERING_BASELINE = FROZEN`)  
**Builds On:** [`docs/poly-g8-6/01-DATA-LICENSE-INQUIRY.md`](../poly-g8-6/01-DATA-LICENSE-INQUIRY.md) & [`docs/poly-g10/07-LICENSE-UPSTREAM-AND-PROVENANCE.md`](./07-LICENSE-UPSTREAM-AND-PROVENANCE.md)  
**Status:** `DATA_LICENSE = HOLD` | `LICENSE_INQUIRY = READY_FOR_FOUNDER_IDENTITY_AND_SEND_APPROVAL` | `EMAIL_SENT = false` | `GMAIL_DRAFT_CREATED = false`

---

## 1. Live-Verified Platform Terms, Technical Docs & Contacts (Retrieved `2026-11-24T13:07:00Z`)

Technical API reachability is **not** legal permission. Hosting infrastructure outside Vietnam does **not** alter the operator's contractual or domestic legal obligations.

| Source URL | Effective / Pub Date | Retrieved (UTC) | Verified Clause / Technical Fact | Operational Impact | Unresolved Interpretation |
|---|---|---|---|---|---|
| `https://polymarket.com/tos` | Effective `2026-08-11` | `2026-11-24T13:07:00Z` | Contracting entity: **Adventure One QSS, Inc.** (licenses software from **Blockratize Inc.**). Distinguishes **Content Features** (news/info) vs. **Technology Features** (Protocol/trading). Personal license (§ Ownership & License) is personal, limited, revocable, non-exclusive, non-sublicensable, non-transferable solely to access/use/interact with Interfaces/Features. | Blocks treating public REST/WS access as an implied commercial or archival redistribution license. | Whether a solo operator running automated 30-day WAL/Parquet capture for quantitative strategy evaluation is treated as retail personal use or requires written permission. |
| `https://polymarket.com/tos` (§4.2 / Commercial Data Restrictions) | Effective `2026-08-11` | `2026-11-24T13:07:00Z` | Prohibits accessing or using any Data (Site, Interface, API, or **on-chain**, in raw, derived, aggregated, or anonymized form) if you are (i) a **Capital Market Client** (non-retail professional entity engaging in brokerage, market making, prop trading, index calculation, ETF issuance, RIAs, hedge funds, fintech companies, etc.) or (ii) a **market data distributor**, unless agreed in writing. Prohibits selling, reselling, sublicensing, redistributing, or commercially exploiting Data to any Capital Market Client or distributor without written agreement. | **Hard blocker** for unauthorized proprietary/commercial research, Paper Beta display, or SaaS analytics redistribution. Covers both API and on-chain data, raw and derived. | Whether a solo Vietnamese founder / future Vietnamese LLC building analytics or proprietary trading software falls under "fintech company" / "proprietary trading" Capital Market Client classification. |
| `https://institutional.polymarket.com/` | Current (no pub date listed) | `2026-11-24T13:07:00Z` | All Capital Markets Entities consuming or redistributing Polymarket data (API or on-chain; raw, derived, aggregated, or anonymized) must do so in consultation with Polymarket and **ICE**. Official verified contacts: `data-licensing@polymarket.com`, `sales-icedataservices-usinsidesales@theice.com`, `institutional@polymarket.com`. | Confirms exact licensing and institutional escalation channels; confirms redistribution responsibility sits with the distributor to verify end-user status. | Pricing, minimum seat/feed commitments, and whether an evaluation/research tier exists for a solo operator. |
| `https://developer.ice.com/fixed-income-data-services/catalog/polymarket` & `https://www.ice.com/publicdocs/ICE_Data_Services_General_Terms_And_Conditions_Ex_US_Canada.pdf` | Current (no pub date listed) | `2026-11-24T13:07:00Z` | ICE distributes Polymarket Data via ICE Connect, ICE Consolidated Feed, and ICE Consolidated History (Real-Time, Delayed, EOD, Historical). ICE General T&Cs (§7 Use, Exhibit A §3) forbid storing, redistributing, creating indices, or building archival/derivative works except as expressly granted in an Order Form. | Clarifies that ICE historical/real-time feeds are a governed alternative to self-hosted collection, but require an explicit Order Form for storage, derived analytics, or redistribution. | Fee schedule and eligibility for solo non-US researchers. |
| `https://docs.polymarket.com/api-reference/geoblock` | Current (no pub date listed) | `2026-11-24T13:07:00Z` | `GET https://polymarket.com/api/geoblock`. Vietnam (`VN`) is **not** on Polymarket's OFAC or regulatory-restricted trading list. Primary servers: `eu-west-2`; closest non-georestricted region: `eu-west-1`. VPN circumvention strictly prohibited (§1 ToS). | VPS must be hosted in a contractually permitted non-restricted region (never for geo-circumvention). | Vietnam's absence from Polymarket's geoblock list does **not** establish legality under Vietnamese domestic law (deferred to G12 counsel). |
| `https://docs.polymarket.com/api-reference/rate-limits` & `https://docs.polymarket.com/api-reference/wss/market` | Current (no pub date listed) | `2026-11-24T13:07:00Z` | Cloudflare IP-based sliding-window limits: General `15,000 req/10s`; Gamma `/markets` `300 req/10s`, `/events` `500 req/10s`; CLOB `/book` `1,500 req/10s`, `/books` `500 req/10s`, `/prices-history` `1,000 req/10s`; Data API `/v2/trades` `300 req/10s`. Public WS: `wss://ws-subscriptions-clob.polymarket.com/ws/market` (L2 snapshots/deltas/trades/lifecycle). | Technical limits easily accommodate 150-market read-only capture (low single-digit req/s + 1 WS channel), **provided** written contractual permission is granted first. | Whether continuous automated WS archival over 30+ days triggers anti-scraping or commercial-use enforcement without written clearance. |

---

## 2. Four Distinct Rights Scopes (Do Not Conflate)

Written permission for one scope does **not** grant permission for any other scope. Approval to display derived analytics does **not** authorize live trading.

| Scope | Operational Parameters | External Visibility | What Written Permission Must Explicitly Cover |
|---|---|---|---|
| **Use Case 1 — Internal Quant Research** | 1-person operation; read-only market data; up to 150 selected markets initially; L2 snapshots, L2 deltas, trades, event metadata, exchange & receive timestamps; ≥30 consecutive days historical capture; local WAL/Parquet processing; reproducible offline simulation & validation. | None (internal Founder only) | Automated WS/REST capture, local archival/WAL/Parquet storage, derived statistical/backtest research, and operator classification (solo researcher vs. Capital Market Client). |
| **Use Case 2 — Cloud Processing** | Single isolated Linux VPS collector (permitted non-restricted region, e.g., `eu-west-1` or Singapore if permitted); private Cloudflare R2 retention; encrypted backups; restricted research access; SHA-256 data-integrity validation; internal derived metrics; proposed 30-day rolling / 90-day research retention + deletion upon termination. | None (private bucket, zero public access) | Cloud VPS ingestion, third-party object storage (R2) retention, encrypted backup copies, retention window, and post-research deletion obligations. |
| **Use Case 3 — Customer-Facing Paper Beta** | Virtual `$100` simulated balances only; zero real deposits, custody, or executable external trades; 1 invited external research user (`USER_001`); potential delayed or permitted market-data visualization and derived analytics. | 1 invited external user (non-public, behind auth) | Explicit permission (or explicit prohibition) to display raw, delayed, or derived Polymarket market data/analytics to an external paper-beta user, plus required attribution/disclaimers and end-user screening obligations. |
| **Use Case 4 — Future Commercial Operation** | Potential future commercial analytics / SaaS subscription access; possible Capital Market Client classification; potential derived works or redistribution. | External paying subscribers (if ever launched) | Applicable licensing track (Polymarket direct vs. ICE Data Services Order Form), fee schedule, Capital Market Client screening requirements, and redistribution/derived-work boundaries. |

---

## 3. Mandatory Pre-Send Identity Fields (Founder Must Fill Truthfully Before Sending)

Do **not** send with placeholders intact. Do **not** fabricate entity registration.

| Placeholder | Founder Input Required |
|---|---|
| `[FOUNDER_FULL_LEGAL_NAME]` | True legal name of the operator |
| `[OPERATOR_LEGAL_STATUS]` | Exact current status: `Individual sole researcher` **or** `[Registered Entity Name, Jurisdiction, Registration No.]` |
| `[SENDER_EMAIL_AND_DOMAIN]` | Real verified email address under Founder control |
| `[COUNTRY_OF_OPERATION]` | `Vietnam` (confirm city/province if requested by Polymarket/ICE) |

---

## 4. Send-Ready Licensing Inquiry Email (UNSENT — Requires Explicit Founder Send Approval)

- **To:** `data-licensing@polymarket.com`
- **Cc:** `sales-icedataservices-usinsidesales@theice.com`
- **Subject:** `Data Licensing & Permitted-Use Inquiry — Solo Quant Research (4 Scopes, Vietnam Operator)`
- **Send Status:** `UNSENT` (no email transmitted; no Gmail draft created)

```text
Subject: Data Licensing & Permitted-Use Inquiry — Solo Quant Research (4 Scopes, Vietnam Operator)

Hello Polymarket Data Licensing Team and ICE Data Services Team,

I am writing to request written clarification and, where required, a formal data license or fee schedule regarding read-only Polymarket market data under the Polymarket Terms of Use (effective August 11, 2026) and the Polymarket / ICE Data Services licensing framework.

Operator & Background
- Name: [FOUNDER_FULL_LEGAL_NAME]
- Legal Status: [OPERATOR_LEGAL_STATUS — e.g., Independent individual researcher / Registered entity]
- Country of Operation: Vietnam (no VPN or geo-circumvention; read-only data use only; no live trading or real-money order execution is being requested at this stage)
- Project Summary: Early-stage solo quantitative research and paper-simulation tooling evaluating prediction-market microstructure and forecasting accuracy.

To avoid conflating distinct rights, I am requesting written guidance and licensing terms separately for four scopes:

1. Use Case 1 — Internal Quant Research (Primary Immediate Request)
- Scope: Read-only access to public Gamma, CLOB, Data API, and Market WebSocket streams for up to 150 selected markets initially.
- Data fields: L2 orderbook snapshots and deltas, trade prints, market/event metadata, and exchange/receive timestamps.
- Capture & processing: Continuous historical capture over at least 30 days (with an optional 90-day research extension) stored in local WAL/Parquet format strictly for internal reproducible simulation and statistical validation.
- External visibility: Zero external users; internal solo research only.

2. Use Case 2 — Private Cloud Processing & Retention
- Scope: Running the read-only collector on one isolated Linux VPS in a contractually permitted region, storing private encrypted WAL/Parquet archives and integrity manifests in a private Cloudflare R2 bucket (zero public access), plus encrypted configuration backups.
- Retention & deletion: Proposed 30-day rolling retention (up to 90 days for research reproducibility), with full deletion upon license expiration or request.

3. Use Case 3 — Closed Customer-Facing Paper Beta (Separate Permission)
- Scope: A private paper-trading simulation with virtual $100 balances only (zero real deposits, zero custody, zero executable external trades) for one invited external beta user.
- Question: Would displaying delayed market data or derived analytics (probabilities, spreads, simulated paper PnL) to an invited external user require a redistribution license, specific delay/attribution terms, or end-user Capital Market Client screening?

4. Use Case 4 — Future Commercial Analytics / Subscription (Exploratory)
- Scope: If research validates a viable analytics product in the future, potential paid SaaS analytics subscriptions or commercial use.
- Question: Which agreement and fee schedule apply (Polymarket direct vs. ICE Consolidated Feed / ICE Consolidated History), and how would a solo developer or future small software entity be classified under the "Capital Market Client" and "market data distributor" definitions?

Specific Requests
1. Please confirm in writing whether Use Cases 1 and 2 are permitted under the current Terms of Use for a Vietnam-based solo operator, or require a written research/evaluation license or ICE Order Form.
2. Please provide any applicable fee schedule, evaluation/research tier, or historical dataset option (including ICE Consolidated History if appropriate).
3. Please confirm any geographic, cloud-hosting region, retention, or deletion requirements applicable to a Vietnam-based operator.
4. Please confirm separate written authorization requirements before any external user display (Use Case 3) or commercial offering (Use Case 4).

No automated production collection or external data display will be enabled until written confirmation or a formal license agreement is in place.

Thank you for your time and guidance.

Best regards,
[FOUNDER_FULL_LEGAL_NAME]
[OPERATOR_LEGAL_STATUS]
[SENDER_EMAIL_AND_DOMAIN]
Vietnam
```

---

## 5. Readiness Verdict

```text
DATA_LICENSE=HOLD
LICENSE_INQUIRY=READY_FOR_FOUNDER_IDENTITY_AND_SEND_APPROVAL
```

All mandatory verification facts and recipient addresses are complete; only Founder identity completion and explicit send approval remain.
