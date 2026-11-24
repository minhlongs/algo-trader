# POLY-G10.5 — 8-Dimension Venue Eligibility & 7-Scope Data Rights Matrix

**Date:** 2026-11-24  
**Verified Against Live Official Sources (Retrieved `2026-11-24`):**
- `https://polymarket.com/tos` — **Adventure One QSS, Inc.** Terms of Use (effective `2026-08-11`; software licensed from **Blockratize Inc.**)
- `https://docs.polymarket.com/api-reference/geoblock` — Official Geoblock endpoint (`GET https://polymarket.com/api/geoblock`) & 3-tier Restricted Jurisdictions table
- `https://institutional.polymarket.com/` — Institutional onboarding & Capital Markets Entity / ICE Data Services consultation rules

---

## 1. Eight-Dimension Venue Eligibility Separation (Phase 2)

Enforced deterministically in `evaluatePolymarketVenueEligibility()` (`src/desk/polymarket/venue-eligibility-evaluator.ts`).

| # | Dimension | Official ToS / Geoblock Basis | Substitution / Evasion Rule | Current Repo State |
|---|---|---|---|---|
| 1 | **Operator Citizenship & Residency** | ToS §1 & §4.1 prohibit access/trading by citizens or residents of Restricted Jurisdictions or sanctioned targets | Must be verified directly; **never** inferred from server IP | `UNKNOWN` (not stored in git) |
| 2 | **Actual Physical Operating Location** | ToS §1 & §4.1 apply to anyone physically located in a Restricted Jurisdiction at time of use | VPN, proxy, or remote desktop into another country is prohibited (§1, §4.1, §4.2) | `UNKNOWN` |
| 3 | **Legal Entity Jurisdiction** | ToS §1 & §4.1 bar entities incorporated, organized, or having a registered office in a Restricted Territory | Offshore wrapper controlled/directed by a Restricted Person is itself a Restricted Person (§1) | `UNKNOWN` (`operatorMode = UNSPECIFIED`) |
| 4 | **Principal Place of Business** | ToS §1 explicitly bars entities whose principal place of business is in a Restricted Territory; `institutional.polymarket.com` requires non-US, non-restricted location | Management/control from a Restricted Territory taints the entity (§1) | `UNKNOWN` |
| 5 | **Customer Eligibility** | `#POLY-G10.5` sets `TARGET_MARKET=INTERNATIONAL`, `TARGET_VIETNAM_CUSTOMERS=false`; Paper Beta blocks `VN` + OFAC + Polymarket restricted territories | Enforced fail-closed at signup via edge country + declaration (`poly-beta-jurisdiction-gate.ts`) | `ENFORCED_FAIL_CLOSED` (`USER_001_INVITE=HOLD`) |
| 6 | **Server Location** | Geoblock docs: primary servers `eu-west-2`; closest non-georestricted region `eu-west-1` (`IE` frontend close-only, API unblocked; co-location in `eu-west-2` requires KYC/KYB own-account approval) | **Server location NEVER substitutes for Dimensions 1–4.** A green `eu-west-1` VPS IP with an `UNKNOWN` or `INELIGIBLE` operator still yields `VENUE_ELIGIBILITY = UNKNOWN / INELIGIBLE` | `UNPROVISIONED` (`VPS_R2_ACTIVATION=HOLD`) |
| 7 | **Platform Authorization** | Binding acceptance of ToS (`2026-08-11`), direct `GET /api/geoblock` `blocked: false` without VPN/proxy, and KYB/institutional onboarding where applicable | Any `usesVpnOrProxy`, `usesLocationSpoofing`, `usesThirdPartyNomineeAccount`, or `usesOffshoreEvasionArrangement` flag forces immediate `INELIGIBLE` | `UNKNOWN` (`LIVE_TRADING_ENABLED=false`) |
| 8 | **Data Usage Rights** | ToS §4.2 (anti-scraping, Capital Market Client & market data distributor restrictions) + §5.1 (personal limited license) + ICE Data Services terms | Public REST/WS reachability does **not** grant commercial, archival, or redistribution rights | `HOLD` for external capture/display; `NOT_REQUIRED` for offline synthetic |

**Fail-Closed Output Today:**
```text
VENUE_ELIGIBILITY=UNKNOWN
LIVE_TRADING_ENABLED=false
```

---

## 2. Official Polymarket Restricted Jurisdictions Encoded in Source

Encoded in `src/desk/polymarket/venue-eligibility-jurisdictions.ts`:
- **Tier 1 — OFAC Complete Block (Frontend + API, no new orders, no close):** `CU, IR, KP, SY` and regions `UA-09` (Luhansk), `UA-14` (Donetsk), `UA-43` (Crimea).
- **Tier 2 — Regulatory Restricted (Close-Only on Frontend + API, + ToS §1 named territories):** `AR, AU, BE, BI, BR, BY, CD, CF, DE, ET, FR, GB, HU, IQ, IT, LB, LY, MM, NI, NZ, PL, RU, SD, SG, SI, SK, SO, SS, TH, TW, UM, US, VE, YE, ZW`, plus Canadian subdivisions `CA-AB, CA-BC, CA-ON, CA-QC`.
- **Tier 3 — Frontend Close-Only / ToS §1 Restricted:** `IE, JP, KR, MT, NL`.
- **Sub-National Disambiguation Rule:** `CA` and `UA` without an explicit ISO-3166-2 subdivision code fail closed (`INVALID_OR_MISSING_CODE`).

---

## 3. Seven Polymarket Data-Rights Classifications (Phase 4)

Evaluated in `evaluatePolymarketDataRightsScope()` (`src/desk/polymarket/research-data-rights.ts`):

| # | Use Case | Contractual Analysis (ToS `2026-08-11` §§ 4.2, 5.1 & Institutional FAQ) | Commercial License Automatically Required? | Current Repo Status |
|---|---|---|---|---|
| 1 | `OFFLINE_SYNTHETIC_RESEARCH` | Clean-room Rust/TS code, unit math, and synthetic episodes consume zero Polymarket API, WS, or on-chain data | **No** (`NOT_REQUIRED`) | **`PERMITTED_WITHOUT_EXTERNAL_FEED`** |
| 2 | `PERMITTED_INTERNAL_RESEARCH` | Manual/non-automated personal interface interaction by an eligible retail individual falls under §5.1 personal license; barred without written agreement if operator is a Capital Market Entity (§4.2) | **No** for verified retail personal interaction; **Yes** if Capital Market Entity | **`HOLD`** until operator retail vs. Capital Market Entity status is confirmed |
| 3 | `AUTOMATED_L2_COLLECTION` | Continuous 150-market automated WS/REST L2 ingestion intersects §4.2 anti-scraping/harvesting and institutional feed rules | Requires written Polymarket / ICE confirmation or license | **`HOLD`** (`DATA_LICENSE=HOLD`) |
| 4 | `HISTORICAL_RETENTION` | 30–90d WAL/Parquet storage on VPS / Cloudflare R2 exceeds transient personal browsing; ICE T&Cs also require an Order Form for archival storage | Requires written retention permission or ICE Order Form | **`HOLD`** (`DATA_LICENSE=HOLD`) |
| 5 | `COMMERCIAL_DATA_DISTRIBUTION` | Selling, sublicensing, or redistributing raw, derived, aggregated, or anonymized data is expressly prohibited without written agreement (§4.2, §5.1) | **Yes** (Polymarket + ICE agreement mandatory) | **`HOLD`** (`DATA_LICENSE=HOLD`) |
| 6 | `CUSTOMER_FACING_ANALYTICS` | Displaying Polymarket market data or derived probabilities to external Paper Beta / SaaS users constitutes external distribution + requires recipient Capital Market Entity screening | Requires explicit written display/redistribution clearance | **`HOLD`** (`MARKET_DATA_ENABLED=false` enforced) |
| 7 | `PROPRIETARY_TRADING` | Non-retail proprietary trading / market-making entities are expressly listed as Capital Market Entities on `institutional.polymarket.com` requiring Polymarket + ICE consultation | **Yes** if non-retail / prop entity; retail status unverified | **`HOLD`** (`LIVE_TRADING_ENABLED=false`) |

---

## 4. Rebaselined Inquiry Identity Guidance (Supersedes Vietnam Hardcoding in `09`)

When the Founder elects to send the licensing inquiry template in `docs/poly-g10/09-DATA-LICENSE-DECISION-PACK.md`, replace the hardcoded `Vietnam` country field with the actual verified operator/entity jurisdiction coordinates (`[ACTUAL_OPERATOR_RESIDENCY_AND_LOCATION]`, `[LEGAL_ENTITY_AND_JURISDICTION_IF_ANY]`)—never send placeholder text and never claim an entity or location that does not match reality.
