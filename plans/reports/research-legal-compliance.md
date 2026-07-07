# Legal/Governance Research: Regulatory Compliance for Signal-Selling SaaS
**Target:** algo-trader RaaS platform (signals, API, strategy subscriptions)
**Path:** `plans/reports/research-legal-compliance.md`
**Date:** 2026-07-06
**Status:** Research artifact only — NOT legal advice. Requires qualified securities counsel before any go-to-market decision.

---

## BOTTOM-LINE SUMMARY (Read This First)

| Question | Answer |
|---|---|
| Do I need SEC/CFTC registration? | Highly likely if US retail customers are served; depends on how signals are packaged and marketed |
| Will a disclaimer protect me? | Partially — disclaimers are necessary but not sufficient alone |
| What kills signal platforms? | Marketing language that implies guaranteed returns or personalized recommendations |
| Do not-break regions | gating US retail clients until counsel clears the model |
| Must-have before launch | TOS with disclaimer + privacy policy + risk disclosure + securities counsel memo |
| International complexity | EU MiFID II adds compliance burden if EU customers; Vietnam signal reg is nascent |

---

## 1. SIGNAL DATA vs. INVESTMENT ADVICE — THE LEGAL BOUNDARY

### 1a. What Is the Distinction

- **Investment Advice** (regulated): A recommendation tailored to an individual's specific financial situation, portfolio, objectives, or risk tolerance. Per SEC/FINRA guidance, the key test hinges on three factors:
  1. Whether the communication recommends a specific security or action
  2. Whether it is directed to a specific person or narrow group
  3. Whether the person providing it receives compensation

  Key case: *SEC v. W.J. Howey Co.* (1946) — "Howey Test" defines investment contracts; signals on crypto/prediction markets can qualify as investment advice depending on framing.

- **Signal Data / Research** (less regulated but not unregulated): Aggregated, algorithmically-generated market data points presented without individualized context or portfolio recommendations. Think: "Strategy X generated BUY signal at indicator Y" — this is data output, not advice.

### 1b. The Danger Zone — Where Signal Platforms Get Sued

- Phrases that cross the line into regulated advice:
  - "You should buy X"
  - "Guaranteed returns" / "risk-free"
  - "Based on your goals…"
  - Named accounts or personal outreach
- Phrases that stay in data territory:
  - "Strategy X generated a BUY signal at price Y"
  - "Backtested performance was Z% over period P"
  - "Subscribers may use or ignore this data at their discretion"

### 1c. How Existing Platforms Protect Themselves

| Platform | Approach | Evidence of Coverage |
|---|---|---|
| TradingView | License terms + "not financial advice" banners + script disclaimer injection | Public TOS; no licensing as fiduciary |
| TrendSpider | Clear "for educational purposes" framing in signals | Review of their product pages and footer disclaimers |
| Signal providers (Telegram) | Bulk: "past performance ≠ future results" + "at your own risk" | Industry standard boilerplate |
| QuantConnect | Academic/research framing; notebooks carry explicit disclaimer labels | Community research context |
| Numerai | Data science competition framing; ERC20 token shields some securities angle | Marketed as hedge fund/data science experiment |

- **Common tool**: Boost the disclaimer directly in the signal payload (SSE, WebSocket message header) so the user literally sees it at each signal emission.

### 1d. What This Means for algo-trader

Your platform ships:
- `/api/v1/strategies` — strategy catalog
- `/api/v1/signal-feed` — live signal stream (SSE)
- `/api/v1/optimization/run` — backtesting runner
- RaaS API — automated execution sandbox

**Testing gate:** Every signal emission must be inspectable as "data for informational purposes, not a recommendation to trade." Audit the payload content and framing in the signal publishers (see `src/signal/signal-publisher.ts`).

---

## 2. US REGULATORY LANDSCAPE

### 2a. Investment Advisers Act of 1940 / SEC

- **Does selling signals require registration?**
  - **Probably not** if the platform qualifies as a "publisher" (Section 202(a)(11)(C) exemption) or "commodity trading advisor" stays below threshold.
  - **Likely yes** if:
    - Signals are tailored to specific accounts
    - You have discretion over client assets (auto-execution is the borderline case)
    - Marketing or pitch structure creates the impression of advisory relationship
- **The blurry line:** algo-trader has automated execution (`/api/v1/trade/execute`). Discretion vs. automation is the line — if the user configures the strategy but the platform executes without per-trade confirmation, that's leaning toward advisory/fiduciary territory.

### 2b. CFTC / NFA Oversight

- **Commodity Trading Advisor (CTA)** registration: Required if:
  - Providing advice on CFTC-regulated contracts (futures, swaps, many forex, some crypto futures)
  - The advisor exercises trading authority over client accounts OR sends signals directed to specific persons
  - Assets under management exceed threshold (roughly $1.5M+ public, $25M+ private)
- **CPO (Commodity Pool Operator)**: Required if pooling client funds — likely NOT applicable for signal SaaS if customers pay a flat subscription
- **Registration relief for automated trading systems**: CFTC has recognized that fully automated signals sent to a general audience without individualized overlay can qualify for some exemptions — but this is untested case law for SaaS
- **Anti-fraud provisions (CFEA §6b)**: Even without registration, you cannot make false/misleading statements about performance or "guaranteed" outcomes

### 2c. How TradingView / TrendSpider / Similar Operate

Common playbook:
1. Frame as "research tool" / "analytics platform"
2. Script developers publish under their own names as independent parties
3. Platform is neutral venue — not a party to the trade
4. User explicitly agrees: "I am responsible for my own trading decisions"
5. **No auto-execution**: User must click to trade
6. **No portfolio advisory**: No feature recommends sizing or asset allocation per user profile

**algo-trader tension points:**
- Auto-execution feature (`/api/v1/trade/execute`) is a step beyond TradingView's model
- If user initiates execution → platform is a tool (safer)
- If platform auto-executes based on strategy → risk increased

### 2d. FINRA / Broker-Dealer Angle

- **Likely NOT a broker-dealer** if:
  - You don't hold customer funds or securities
  - You only route orders to third-party exchanges
  - Subscribers retain trading authority over their own exchange accounts (BYOK pattern described in docs)
- **Risk flag**: The "AI-generated trade recommendations" litmus test — if the platform makes explicit buy/sell recommendations with a materiality threshold, FINRA has historically examined such activity

### 2e. State "Blue Sky" — California, New York

- California Corporations Code §25110: Unregistered securities offerings (relevant if platform tokenized the signals or offered profit-sharing)
- New York (Martin Act): Broad fraud standard applicable to marketing materials
- **Mitigation**: No US retail marketing until counsel clears; jurisdiction gate

---

## 3. INTERNATIONAL CONSIDERATIONS

### 3a. EU — MiFID II (Markets in Financial Instruments Directive)

- **Applies to**: Firms providing investment services/activities in EU, regardless of where they are based
- **Investment Advice under MiFID II**: Defined as personal recommendation given to a person who decides on a specific investment or portfolio — same framing test as US
- **Key requirement**: If you provide investment advice under MiFID:
  - Need authorization from a home-state regulator (FCA UK, BaFin Germany, AMF France, etc.)
  - Must comply with MiFID-compliant disclosure: clear risk warnings, conflict-of-interest disclosure, product governance
  - Clients must be classified (retail/professional/eligible counterparty)
- **Signal platform safe-harbor**: Pure data/independent research with no personalized recommendation component; but the line is thin
- **GDPR** (applies regardless of MiFID if EU users): Consent, data minimization, right to erasure, DPA requirements for any processor
- **Action**: If targeting EU corporate/professional clients only, MiFID burden is lighter; serving retail EU requires structural authorization changes

### 3b. Vietnam

- **Current regulatory environment (as of 2026)**: Emerging framework for crypto; forex is heavily restricted for retail
- **Forex signal regulation**: No specific regulatory body for forex signals; SSSC (State Securities Commission) covers securities
- **Crypto signals**: Not specifically regulated but grey area — providing signals that facilitate crypto trades may eventually attract scrutiny
- **Capital markets**: Any platform operating "trading platforms" for securities requires SSC license
- **Practical implication**: Vietnamese-speaking client onboarding (`next-intl` locale) implies Vietnam market intent. Two options:
  1. **Territory-gate**: Explicitly exclude Vietnamese users until local regulatory clearance
  2. **Local entity**: Vietnam J/V or licensed entity — heavy lift, not recommended at early stage

### 3c. Cross-border SaaS Signal Selling — General Framework

- **Territorially sovereign**: Each jurisdiction applies its own standards to operations directed at its residents (not just where the server is)
- **Key determinant**: Do you actively market to residents of each jurisdiction? Passive availability (website accessible from everywhere) typically draws fewer regulators than active marketing, localized language/currency/payment
- **Practical pattern**:
  1. Identify top revenue/revenue-potential markets
  2. Check each for signal/advisory regulation
  3. Apply jurisdiction gating (geo-IP or TOS clause) for restricted markets
  4. White-list permitted jurisdictions in TOS

---

## 4. REQUIRED LEGAL DOCUMENTS

### 4a. Terms of Service (TOS) — Minimum Viable for Signal SaaS

**Must include section headers:**
1. Acceptance of Terms (clickwrap ideal)
2. Description of Service (what it IS — data, signals, strategies — and what it is NOT)
3. User Obligations (BYOK keys, third-party exchange account terms)
4. Subscription & Billing (NOWPayments integration, no refunds clause for digital services)
5. Disclaimer of Warranties (AS-IS, no uptime guarantee beyond commercial reasonableness)
6. Limitation of Liability (cap at subscription fees paid, exclude consequential damages)
7. Indemnification (user indemnifies platform for losses from using signals)
8. Intellectual Property (platform owns strategy engine; user owns data; license to use)
9. Termination (platform may terminate for TOS violation)
10. Governing Law & Venue (Delaware per existing legal-checklist.md)
11. Misc (severability, entire agreement, waiver)

### 4b. Disclaimer Language — 5 Required Elements

| # | Element | Example wording |
|---|---|---|
| 1 | **Not financial advice** | "Signals are generated algorithmically for informational purposes only. This is not financial, investment, tax, or legal advice." |
| 2 | **No fiduciary relationship** | "No fiduciary or adviser-client relationship is created by use of this service." |
| 3 | **Past performance ≠ future results** | "Past performance of any strategy does not guarantee or indicate future results." |
| 4 | **User retains sole responsibility** | "All trading decisions are yours alone. You bear full responsibility for any gains or losses." |
| 5 | **Risk of loss warning** | "Trading in financial markets carries substantial risk of loss. You may lose more than your initial investment." |

- Must appear: first 50px of the page (banner), every signal payload header, and in TOS (bold)
- Must appear in Vietnamese translation on localized pages (per bilingual policy in `sophia-handover-rules.md` / project CLAs)

### 4c. Privacy Policy

**Required if:**
- You collect any personal data (email, API keys, IP address, usage logs)
- You use cookies/analytics
- You share data with third parties (payment processors like NOWPayments)

**Minimum requirements:**
- What you collect
- Why you collect it
- Who you share it with
- User rights (access, deletion, portability)
- Retention period
- Contact for privacy questions
- Cross-border transfer disclosure (GDPR Schrems II compliance if EU users)

### 4d. Risk Disclosure

Broader and more specific than the TOS disclaimer:
- Specific instrument risks (cryptocurrency volatility, prediction market resolution risk, detection risk on CEX)
- Technical risks (WebSocket feed failures, latency in decision pipeline)
- Financial risks (maximum loss exposure per strategy per time window)
- "Hosting/runtime risks" (your service outage doesn't absolve user's positions)

---

## 5. REVENUE TRIGGERS — WHEN TO ESCALATE

### 5a. Corporate Entity Formation

**Trigger: NOW — not optional**
- Delaware C-Corp is already planned (`docs/legal-checklist.md` Line 10)
- EIN, bank account (Mercury/Brex), stock ledger
- Reason: You cannot sell subscriptions without a legal entity accepting payment; payment processors (NOWPayments, bank) require EIN/entity verification

### 5b. Securities Counsel Engagement

**Trigger: Before first paying customer or marketing launch, whichever is first**

- Scope of counsel note:
  1. Howey Test memo for signal assets (are they investment contracts?)
  2. CFTC CTA registration analysis (is registration required or exempt?)
  3. Auto-execution risk memo
  4. Jurisdiction gating plan for US retail

**Indicators you must NOT delay counsel (BLOCKER):**
- Active marketing to retail investors
- Auto-execution of live trades without user-initiated trade-by-trade confirmation
- Any profit-sharing or returns-linked pricing model
- Revenue crossing low-six-figures (increases scrutiny from regulators)

### 5c. Jurisdiction Gating

**Trigger: Before accepting any US retail signups**

| Jurisdiction | Status | Action |
|---|---|---|
| **United States — retail** | High regulatory risk | **BAN** until cleared by counsel OR use accredited investor filter (Reg D 506c pathway) |
| **United States — accredited only** | Lower risk | No public marketing; private offering; consent accredited investor attestation |
| **EU retail** | MiFID II risk | Delay retail launch; professional clients need verification |
| **EU professional** | Medium risk | Professional client onboarding flow with MiFID-compliant disclosure |
| **Vietnam retail** | Grey / emerging | Delay retail launch until local legal advice obtained |
| **Rest of world** | Lower direct risk | Publish jurisdiction restrictions in TOS |

**Implementation**: Add `countryCode` to tenant/ad signup; block `/api/v1/subscription/checkout` for restricted codes in TOS gating middleware

### 5d. Licensing

- **SEC** / **state-level**: If signals are deemed investment advice → IA registration + $B or more in regulatory capital
- **CFTC / NFA**: CTA registration required for signal providers; ~$150K+ net capital requirement per CFTC
- **Practical reality**: Most signal SaaS avoids registration by staying in "data/research" territory
- **Trade-off**: Operating without registration is a regulatory bet; counsel memo required to understand the exposure profile

---

## 6. COMPLIANCE PRIORITY MATRIX

| Priority | Action | Timeline | Owner | Blocking |
|---|---|---|---|---|
| P0 | TOS draft with disclaimer + risk disclosure | Before any public signup | Legal counsel | Yes |
| P0 | Privacy Policy | Before any user data collection | Legal counsel | Yes |
| P0 | Securities counsel engagement | Before first paying customer | Founder / Board | Yes |
| P1 | Auto-execution risk memo | Before enabling `/api/v1/trade/execute` in live markets | Legal counsel | Yes |
| P1 | Jurisdiction gating middleware | Before US/EU soft launch | Engineering | Yes |
| P1 | Signal payload disclaimer injection | ASAP (TODAY) | Engineering | No|
| P2 | SSSC / Vietnam local clearance review | Before Vietnam retail launch | Vietnam counsel | No|
| P2 | AML/KYC onNOWPayments settlement | When volume >$50K/month | Compliance | No|
| P2 | D&O insurance | Before first board meeting outside founders | Operations | No|

---

## 7. ARCHITECTURAL RECOMMENDATIONS FOR COMPLIANCE

1. **Disclaimer injection at signal emission layer**: Modify `src/signal/signal-publisher.ts` to prepend a `disclaimer` field to every emitted signal across SSE, REST cache, and Telegram pusher. This becomes a forcing function that associates the legal notice with every data point.

2. **Jurisdiction field on tenant**: Add `jurisdictionCode` (ISO 3166-1 alpha-2) to `Tenant` schema in Prisma; gate checkout and execution routes on a country-allowlist.

3. **Marketing copy freeze**: Before any public launch, audit all landing page copy, pitch decks, and Telegram/Telegram bot responses for advisory language. Have legal coach approve final copy.

4. **Two product modes** (recommended for liability isolation):
   - **Mode A: Signals only** (data feed, signal subscription) — lower regulatory exposure
   - **Mode B: Auto-execution** (RaaS executor, live sandwich) — higher exposure; gate behind accredited investor attestation or separate legal entity

5. **Audit log**: Your existing immutable trade audit (`platform/audit/audit-log-service.ts`) is a strong compliance foundation — keep it tamper-evident and exportable for regulatory inquiries.

---

## 8. UNRESOLVED QUESTIONS

1. **Exact qualifying threshold for CTA registration under CFTC**: What net capital / client / asset level triggers mandatory registration? Counsel memo required.
2. **CFTC position on fully SaaS signal platforms (no PAC)**: No direct no-action letter exists; counsel must assess by analogy.
3. **Vietnam SSSC stance on crypto signal SaaS in practice**: Regulatory guidance is sparse; local counsel recommended.
4. **NOWPayments KYC requirement for operators**: What operator-level documentation does NOWPayments require for US/EU entity accounts?
5. **Data subject access request (DSAR) pipeline**: GDPR requires ability to export/delete user data within 30 days; no DSAR workflow identified in current codebase.

---

*This document is a research artifact intended for internal planning. It constitutes no legal advice and does not create an attorney-client relationship. Engage qualified securities counsel in relevant jurisdictions before any commercial launch.*
