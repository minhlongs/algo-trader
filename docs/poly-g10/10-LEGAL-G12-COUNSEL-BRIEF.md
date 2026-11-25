# POLY-G10.3B — Vietnamese Legal Counsel Engagement Brief (G12)

> **HISTORICAL AUDIT RECORD — STRATEGICALLY REBASELINED BY `#POLY-G10.5` (`2026-11-24`):** Preserved intact without erasure as historical evidence. Under `#POLY-G10.5` (`TARGET_MARKET=INTERNATIONAL`, `TARGET_VIETNAM_CUSTOMERS=false`, `LEGAL_FRAMEWORK=JURISDICTION_AWARE`), a Vietnam-specific counsel engagement is **not** a universal prerequisite for offline clean-room engineering or non-Vietnam jurisdictions; it applies if and only if the actual operator, entity, or physical operating location is subject to Vietnamese jurisdiction. See [`docs/poly-g10/13-GLOBAL-FIRST-STRATEGIC-REBASELINE.md`](./13-GLOBAL-FIRST-STRATEGIC-REBASELINE.md) for the 5 activity-scoped gates.

**Date:** 2026-11-24  
**Baseline:** `main` @ `68469cfeff09c82416778b1c09816d7005673c6c` (`G10_ENGINEERING_BASELINE = FROZEN`)  
**Builds On:** [`docs/poly-g8-6/03-VIETNAM-LEGAL-COUNSEL-REQUEST.md`](../poly-g8-6/03-VIETNAM-LEGAL-COUNSEL-REQUEST.md)  
**Status:** `LEGAL_G12 = HOLD` | `COUNSEL_ENGAGED = false` | `FEES_AUTHORIZED = false`

---

## 1. Purpose & Engagement Guardrails

This brief scopes an independent written legal opinion from licensed Vietnamese counsel (Vietnam Bar Federation / licensed Vietnamese law firm) to determine whether a `LEGAL_G12 = PASS` or `LEGAL_G12 = NO-GO` determination can be supported for each operational phase.

- **Neutral fact-finding only:** Counsel is **not** asked to bless a predetermined trading strategy or rubber-stamp launch.
- **No engagement or fee commitment:** This document is a scoping brief for fixed-fee quotation only; hiring counsel and approving fees require separate Founder authorization.
- **Privilege:** Private personal/entity identifying facts are transmitted directly to selected counsel under attorney-client privilege, never stored in this repository.

---

## 2. Factual Baseline Provided to Counsel

1. **Operator:** Vietnam-resident solo founder (confirming individually vs. prospective Vietnamese enterprise entity under privilege).
2. **Underlying Platform:** Polymarket (event-based prediction-market contracts on Polygon PoS; Terms of Use effective `2026-08-11`, Adventure One QSS, Inc.).
3. **Current Technical State:** Offline codebase only (`LIVE_TRADING_ENABLED = false`, `REAL_MONEY_TRADING = DISABLED`, zero live market-data collection, zero external users invited, zero wallets funded or signing live orders).
4. **Phased Activities Under Review (Strictly Separated):**
   - **Phase 1 (Internal Read-Only Research):** Automated read-only market-data collection (subject to written Polymarket/ICE license), offline backtesting, statistical forecasting validation. Zero real-money orders, zero external users.
   - **Phase 2 (Closed Paper-Only Beta / Research Software):** Virtual `$100` simulated balances, zero deposits, zero custody, zero cash-out, zero executable external trades; initially 1 invited user, potentially paid software subscriptions later.
   - **Phase 3 (Hypothetical Future Real-Money Participation):** Personal or corporate real-money trading on Polymarket (currently `DISABLED` and blocked; evaluated solely to establish whether it is legally prohibited or conditionally permissible).
5. **Statutory Context Flagged for Counsel Verification:**
   - Verified in force prior to this brief: Law on Digital Technology Industry (`Luật Công nghiệp công nghệ số 71/2025/QH15`, effective `2026-01-01`) and Government Resolution `05/2025/NQ-CP` (effective `2025-09-09`, crypto-asset market pilot).
   - Additional statutes requiring counsel's current effective-text verification: Penal Code `100/2015/QH13` (Arts. 321–322 gambling / organizing gambling), Decree `06/2017/NĐ-CP` (betting), Decree `144/2021/NĐ-CP`, Personal Data Protection Law `91/2025/QH15` / Decree `13/2023/NĐ-CP`, Securities Law `54/2019/QH14` (as amended), Cybersecurity Law `24/2018/QH14` & Decree `53/2022/NĐ-CP`, E-Commerce Decree `52/2013/NĐ-CP` (as amended), Advertising Law, and Foreign Exchange / cross-border payment regulations.

---

## 3. Ten Required Legal Questions for Written Opinion

Counsel is requested to answer each numbered question in writing with citations to currently effective Vietnamese statutory provisions and enforcement practice:

1. **Legal Classification of Read-Only Data Research Service:** How is operating an internal, read-only quantitative market-data research system ingesting public/licensed event-probability data from an offshore prediction-market platform classified under Vietnamese law (software R&D, financial information service, prohibited gambling facilitation, or digital-asset service under Law `71/2025/QH15` / Resolution `05/2025/NQ-CP`)?
2. **Automated Market-Data Collection Permissibility & Obligations:** Under Vietnamese law (cybersecurity, IP, unfair competition, data law), what legal obligations or restrictions govern automated collection, local archival (WAL/Parquet), and statistical analysis of licensed third-party API/WebSocket market data?
3. **Offshore Hosting & Cross-Border Data Processing:** Does hosting the collector VPS and private Cloudflare R2 storage outside Vietnam alter the operator's Vietnamese legal obligations, trigger cross-border data transfer impact assessment filings (under PDPD/PDPL), or trigger data-localization rules (Decree `53/2022/NĐ-CP`) if only market data (zero Vietnamese personal data) is stored vs. if external beta user accounts are stored?
4. **Customer-Facing Paper-Only Research Product:** Can a Vietnam-based operator lawfully offer a paper-only simulation/analytics dashboard (`$100` virtual balance, `$0` real deposits, `$0` withdrawals, no trade routing, no real-money execution) to external users (domestic or international), or does it risk reclassification as unlicensed securities/derivatives advisory, gambling promotion, or unlicensed digital-asset service?
5. **Advertising, Investment-Advice & Performance-Claim Restrictions:** What mandatory disclaimers, marketing prohibitions, and licensing triggers apply under Vietnamese Securities Law, Advertising Law, and Consumer Protection Law when describing simulated/backtested metrics, probability analytics, or forecasting models?
6. **Data Protection & Customer Privacy:** What exact compliance obligations (consent, privacy notice, DPIA/TIA filings, breach notification, retention/deletion) apply to collecting email/auth identifiers for a private 1-user paper beta (`USER_001`) versus a broader SaaS product?
7. **Payments & Subscriptions for Research Software:** If the operator later charges subscription fees for research/analytics software (domestic VND or cross-border USD/card), what entity registration, tax/VAT, foreign-exchange, e-commerce notification, and payment-gateway rules apply?
8. **Interaction with Platform Geographic Restrictions:** Polymarket's public geoblock documentation (`docs.polymarket.com/api-reference/geoblock`) does not list Vietnam (`VN`) as a blocked trading jurisdiction, while Polymarket's Terms of Use prohibit VPN circumvention and require compliance with local law. Please confirm explicitly whether platform non-geoblocking creates any safe harbor under Vietnamese law (expected answer: none) and what domestic Vietnamese prohibitions still govern.
9. **Future Personal or Corporate Real-Money Participation:** Under current Vietnamese law (including Law `71/2025/QH15`, Resolution `05/2025/NQ-CP`, Penal Code Arts. 321–322, Decree `06/2017/NĐ-CP`, and FX controls), is personal or corporate real-money trading on an offshore blockchain prediction market (Polymarket) legally permitted, conditionally permitted, or prohibited/high-criminal-risk for a Vietnam resident or Vietnamese company?
10. **Written G12 `PASS` vs. `NO-GO` Evidence Standard:** What concrete legal prerequisites, corporate structure, licenses/filings, contractual terms, and operational red lines must be documented to support an objective written `G12 = PASS` for (a) Phase 1 Internal Research, (b) Phase 2 Closed Paper Beta, and (c) Phase 3 Real-Money Participation — and what findings mandate an immediate `G12 = NO-GO`?

---

## 4. Explicit G12 Decision Rubric (Required in Counsel's Written Opinion)

| Phase | Conditions for Written `G12 = PASS` | Automatic `G12 = NO-GO` Trigger |
|---|---|---|
| **Phase 1: Internal Read-Only Research** | Dated written opinion confirms read-only licensed data collection + offline statistical research violates no Vietnamese gambling, securities, digital-asset, or cybersecurity prohibition, and lists exact compliance controls. | Counsel identifies material criminal/administrative illegality for ingesting or analyzing offshore prediction-market data from Vietnam. |
| **Phase 2: Closed Paper Beta (`USER_001`)** | Written opinion confirms virtual-only paper simulation is lawful with specified disclaimers, privacy/PDPD compliance, and zero trade-routing/gambling-promotion exposure. | Counsel concludes paper-beta UI or analytics constitutes unlicensed financial advice, gambling facilitation, or prohibited digital-asset solicitation. |
| **Phase 3: Real-Money Participation** | Unambiguous written legal clearance covering entity/personal eligibility, FX/tax compliance, and non-violation of Arts. 321–322 / Decree `06/2017` / Resolution `05/2025`. | Any material criminal, administrative, or FX/gambling illegality risk (default remains `REAL_MONEY_TRADING = DISABLED`). |

---

## 5. Gate Status

```text
LEGAL_G12=HOLD
COUNSEL_BRIEF=READY_FOR_FOUNDER_QUOTE_DISPATCH
```
