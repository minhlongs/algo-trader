# POLY-G8.6 Track A — Polymarket Data Licensing Verification & Inquiry

**Date:** 2026-11-22  
**Tracking Issue:** `#278`  
**Status:** `DATA_LICENSE_OUTREACH = READY_FOR_FOUNDER_SEND` | `DATA_LICENSE_PERMISSION = HOLD`  
**Canonical Prior Record:** [`docs/poly-g8/01-POLYMARKET-DATA-RIGHTS-ASSESSMENT.md`](../poly-g8/01-POLYMARKET-DATA-RIGHTS-ASSESSMENT.md)

---

## A1. Official Terms & Contact Verification (Live-Checked 2026-11-22)

1. **`https://polymarket.com/tos`**
   - **Effective Date:** August 11, 2026.
   - **Contracting Entity:** **Adventure One QSS, Inc.** ("the Company" / "A1"), which licenses software from **Blockratize Inc.**
   - **Geographic Restrictions (§1, §4.1):** Access from restricted jurisdictions is prohibited; circumvention via VPN, proxy, or similar technical means is explicitly prohibited.
   - **Data Rights & Capital Market Client (§4.2):** Defines **Capital Market Client** to include proprietary trading firms and financial technology companies. Prohibits accessing, collecting, or using Polymarket Data ("directly or through an API, or any other means, including on-chain, whether in raw, derived, aggregated, or anonymized form") without an express written agreement. Prohibits unauthorized automated extraction/scraping and commercial redistribution.
   - **General Contact:** `hello@polymarket.com`.
2. **`https://institutional.polymarket.com/`**
   - Confirms Polymarket's institutional market-data partnership with **ICE Data Services**.
   - **Verified Official Data-Licensing Contacts:**
     - `data-licensing@polymarket.com`
     - `sales-icedataservices-usinsidesales@theice.com`
   - **Verified Institutional Onboarding Contact:**
     - `institutional@polymarket.com`

---

## A2. Operator Identity Verification

Audited from authorized local repository records without guessing or inventing corporate registrations:

| Field | Verified Status | Notes |
|---|---|---|
| Country of operation | Vietnam | Confirmed in `docs/poly-g8/` and `docs/poly-g8-4/` |
| Operating model | Solo Founder / Quant Research / Paper SaaS | Confirmed in Founder directive |
| Individual vs. registered legal entity | `UNKNOWN` | No company registration or legal entity document is stored in repo (intentionally excluded from GitHub). Founder must insert truthful legal status before dispatch. |
| Capital Market Client classification | `UNKNOWN` (treat as potentially in-scope) | §4.2 covers prop trading & fintech; written clarification requested in Question 1 below. |
| Research commercial intent | Mixed (immediate private research; potential later commercial SaaS) | Explicitly separated in the inquiry below. |
| Prospective users as professional capital-market users | `UNKNOWN` | Paper Beta is currently restricted to isolated $100 virtual capital evaluation (`USER_001` on `HOLD`). |

No identity documents are published in GitHub.

---

## A3 & A4. Ready-to-Send English Permission Inquiry (UNSENT)

> **Governance:** **DO NOT SEND AUTOMATICALLY.** `DATA_LICENSE_OUTREACH = READY_FOR_FOUNDER_SEND`. Founder must complete the bracketed truthful identity fields, send from a verified personal/business email account, attach no files, and retain the sent headers + reply provenance. Sending this email does **not** grant permission.

```text
To: data-licensing@polymarket.com
Cc: sales-icedataservices-usinsidesales@theice.com
Subject: Written Market-Data Licensing Inquiry — Vietnam Quantitative Research Pilot (Up to 150 Markets, 30-Day L2 Archive)

Dear Polymarket Data Licensing and ICE Data Services Teams,

I am [Founder Full Legal Name], writing as [an individual solo founder / authorized representative of <Registered Entity Name>, if applicable], operating from Vietnam. Before activating any automated market-data collection, I am requesting written clarification of the applicable terms, classification, and licensing requirements for the two distinct scopes described below.

1. Immediate Research Scope (Private Quantitative Research Only)
- Purpose: Private quantitative research, conservative queue-aware execution simulation, maker and NegRisk backtesting, and market-blind prospective probability evaluation.
- Data Requested: Public market-data API and WebSocket access (if permitted) for point-in-time L2 order-book snapshots, deltas, and trades across up to 150 eligible markets.
- Storage & Processing: Thirty-day (30-day) rolling WAL and Parquet retention processed on an isolated Linux VPS and archived in a private Cloudflare R2 bucket. Regions will be selected strictly within permitted territories; we will not circumvent any geographic restrictions.
- Restrictions Observed: Zero redistribution or resale of raw market data; zero live order submission; zero wallet signing; zero custody or management of customer funds.

2. Potential Future Use (Strictly Separate — Not Assumed Licensed)
- Research-driven commercial analytics software and derived statistics/metrics.
- Limited external paper-trading SaaS (virtual capital only, zero real-money execution or customer deposits).
- Separate future evaluation of permitted proprietary real-money trading, subject to independent legal clearance and any required venue agreements.
- We are NOT requesting authorization to manage customer funds or provide custody.

Please provide written answers identifying the permitted data feeds, territory, purpose, retention, and pricing for the following 12 questions:

1. Capital Market Client Classification: Based on the operator profile above, does this solo Vietnam-based quantitative research and potential fintech SaaS operator fall under the professional "Capital Market Client" definition in Section 4.2 of the Polymarket Terms of Use (effective August 11, 2026)?
2. 150-Market Automated L2 Research Collection: Is the proposed automated collection of L2 snapshots, deltas, and trades for up to 150 eligible markets permitted for private quantitative research?
3. Written Agreement Requirement: Is a written market-data agreement with Adventure One QSS, Inc., ICE Data Services, or both required prior to starting collection?
4. 30-Day Private Retention: May collected L2 market data be retained privately for a rolling 30-day period for offline replay and backtesting?
5. WAL, Parquet, Replay & Derived Analytics: Are transformation into WAL/Parquet format, historical replay, and private derived analytics within the permitted scope?
6. Cloudflare R2 Storage: Is private, non-public Cloudflare R2 object storage (in a compliant region) permitted as a cloud storage processor?
7. Commercial SaaS Incorporation: Can derived research outputs or model parameters be incorporated into a future commercial SaaS product, and what separate license would apply?
8. Publishing Aggregated Metrics: Are there restrictions on publishing aggregated, anonymized research metrics or system performance statistics?
9. Private Paper-Trading Evaluations: Are isolated private paper-trading evaluations (virtual capital only, no real orders) permitted under the same market-data terms, or do they require a separate license?
10. Evaluation Licenses / Research Trials: Are non-commercial evaluation licenses or bounded research-only trials available, and what conditions and expiry apply?
11. Fees, Licensing Tiers & Usage Ceilings: What are the applicable fees, licensing tiers, market-count limits, and API/WebSocket rate ceilings? (Pricing is requested for evaluation only; this email does not accept any contract or financial obligation.)
12. Binding Licensing Entity: Which legal entity is authorized to issue binding written permission for the immediate research scope and any future commercial scope?

Automated collection will remain completely disabled until binding written permission is received for the exact intended use, alongside independent local legal review. This inquiry requests information and licensing terms only and does not constitute acceptance of any agreement.

Sincerely,
[Founder Full Legal Name — complete before sending]
[Truthful Individual / Business Status — complete before sending]
[Contact Email / Country: Vietnam]
```

---

## A5. Gate A Closure Evidence Required

Gate A transitions from `HOLD` to `PERMISSION_GRANTED_FOR_DEFINED_SCOPE` **only** when all of the following are archived:
- Copy of effective Terms of Use version and retrieval date.
- Archived sent inquiry with verified sender provenance.
- Written reply from an authorized representative of Adventure One QSS, Inc. and/or ICE Data Services specifying permitted feeds, territory (Vietnam + VPS/R2 region), purpose, 30-day retention, cloud storage, derived analytics, and pricing/tier terms.
