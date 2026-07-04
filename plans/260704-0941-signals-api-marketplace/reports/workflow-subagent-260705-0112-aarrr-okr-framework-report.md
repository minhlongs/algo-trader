# AARRR + OKR Framework: 1-Page Brief

**Date:** 2026-07-05
**Context:** Signals API Marketplace GTM — metrics framework across Business, Agentic, Governance layers
**Based on:** BMC report, PRD, Market Intelligence report

---

## [Business] Layer — Human-Facing SaaS Metrics

| AARRR Stage | Metric | Target (M6) | Instrumentation |
|---|---|---|---|
| **Acquisition** | Signups/week | >50 | Developer portal signup event + email verify |
| | Portal landing-to-signup conversion | >5% | Page view -> signup event funnel |
| | Organic signups vs invite | >30% organic | UTM params, referral code |
| **Activation** | Time-to-first-signal | <2 min median | Timestamp of API key create -> first GET /feed 200 |
| | Quickstart completion rate | >60% | Guided steps: key gen -> subscribe -> curl -> webhook |
| | First curl success rate | >90% | API logging 200 on first request within 24h |
| **Retention** | Weekly Active API Keys (WAK) | >60% of signups | Unique API keys with successful call in trailing 7d |
| | Monthly paid churn | <8% | Subscriptions cancelled / beginning-of-month active |
| | Days-to-first-dormant (p50) | >14 days | Last API call date trailing; alert at 14d idle |
| **Revenue** | MRR | $5K+ | Sum of all active subscription payments |
| | Blended ARPU | $75-100/mo | MRR / paying subscribers |
| | Free-to-paid conversion (14d) | >8% | Paid subscriber created within 14d of signup |
| **Referral** | Invite signups / total signups | >15% | Referral code or invite link usage |
| | NPS (developer survey, M3) | >30 | Survey at 30d post-signup |

### [Business] OKRs

| Objective | Key Results |
|---|---|
| **O1: Prove PMF for signals API marketplace** | KR1.1: 500 signups in 90d post-launch |
| | KR1.2: 20+ paid subscribers by M6 |
| | KR1.3: Active developer retention >60% WAK at M6 |
| **O2: Build sticky developer platform** | KR2.1: Monthly churn <8% by M6 |
| | KR2.2: 60% of paid users active in trailing 30d |
| | KR2.3: Time-to-first-signal <2 min (p50) across all signups |
| **O3: Reach $15K MRR by M12** | KR3.1: 150-200 paying subscribers |
| | KR3.2: Blended ARPU >$75/mo |
| | KR3.3: PRO tier >50% of paid subscribers |

---

## [Agentic] Layer — AI/Native Autonomous Consumption

| AARRR Stage | Metric | Target (M6) | Instrumentation |
|---|---|---|---|
| **Acquisition** | MCP discovery requests / week | >1,000 | MCP server `listTools` invocation count |
| | Agent schema registry queries | >500/wk | `/agent/catalog` GET count |
| | Agent auto-subscribe rate | >50% of discovery | Agent subscribes after reading schema |
| **Activation** | First autonomous signal call | <1 min from MCP init | MCP tool call -> 200 response latency |
| | x402 first payment success | >90% | Wallet signature -> payment confirmation |
| | Agent session: first-to-second call | >80% within 24h | Agent makes 2nd call after 1st |
| **Retention** | Agent daily active queries | >5 calls/day/agent key | API call count per unique agent key, trailing 7d |
| | Agent subscription renewal rate | >70% monthly | Programmatic tier persist (auto-renew) |
| | Agent lifecycle: days active/total | >50% | Agent active days / subscription days |
| **Revenue** | x402 pay-per-signal volume | >$500/mo | USDC/Balance settlement |
| | Agent subscription pool signups | >10 pools | Shared quota accounts |
| | Fusion engine add-on adoption | >15% of paid agent subs | Premium add-on enabled |
| **Referral** | MCP ecosystem listing | Listed on 2+ registries | Anthropic, community MCP directories |
| | Agent-to-agent discovery | Tracked via MCP referral metadata | Referral agent key in MCP header |

### [Agentic] OKRs

| Objective | Key Results |
|---|---|
| **O4: Validate agent-native revenue model** | KR4.1: x402 revenue >$500/mo by M9 |
| | KR4.2: 10+ agent-only subscribers by M6 |
| | KR4.3: MCP discovery >1,000 requests/wk by M6 |
| **O5: Build autonomous agent lifecycle** | KR5.1: Agent auto-subscribe rate >50% of MCP discovers |
| | KR5.2: Agent daily ret >5 calls/day at M6 |
| | KR5.3: Agent subscription renewal >70% monthly |

---

## [Governance] Layer — Trust, Provider & Oversight

| AARRR Stage | Metric | Target (M6) | Instrumentation |
|---|---|---|---|
| **Acquisition** | Provider signups (supply side) | >5 active | Provider onboarding completion |
| | Provider bond posts | >3 bonded | Smart contract bond deposits |
| | Auditor / verification partners | >1 engaged | Signed audit partner agreement |
| **Activation** | First signal published | 3-5 internal + 3 provider signals | Signal: first publication to marketplace |
| | Provider verification badge earned | >50% of providers | Badge assignment post-audit |
| | Track record ledger: first commitment | 100% of published signals | Hash commit on-chain within 60s of publish |
| **Retention** | Provider active rate (signals/wk) | >10 signals/wk per provider | Rolling 7d signal publication count |
| | Provider churn | <20% over 6 months | Provider deactivation or bond withdrawal |
| | Signal quality (verified accuracy) | >60% avg | Rolling 30d accuracy from audit trail |
| **Revenue** | Provider bond interest income | Minimal (M6) | Yield on bond collateral, platform take |
| | Verification badge subscription | >2 subscribers | $9.99/mo badge holders |
| | Audit report purchases | >2 reports | $50-200/report |
| **Referral** | Provider-to-provider referrals | Track via referral code | Provider friend onboarding |
| | Verified track record as marketing | Transparency dashboard views | Unique page views / share events |

### [Governance] OKRs

| Objective | Key Results |
|---|---|
| **O6: Establish trust infrastructure as competitive moat** | KR6.1: 100% signals hash-committed on-chain at publish |
| | KR6.2: Transparency dashboard live with verified accuracy scores by M6 |
| | KR6.3: Provider verification badge program active (>2 badge holders) |
| **O7: Seed marketplace supply side** | KR7.1: 3-5 internal signals live at Phase 1 launch |
| | KR7.2: 5+ third-party providers onboarded by M6 |
| | KR7.3: Provider bond system live by M9 |
| **O8: Maintain trust operations health** | KR8.1: Zero signal fraud incidents (provider misrepresentation) |
| | KR8.2: Signal quality score >60% verified accuracy |
| | KR8.3: API abuse rate <1% of all requests flagged anomalous |

---

## Cross-Layer Alignment

| AARRR Stage | [Business] Owns | [Agentic] Enables | [Governance] De-risks |
|---|---|---|---|
| **Acquisition** | Developer portal, docs | MCP registry, agent discovery | Provider onboarding, bond system |
| **Activation** | Quickstart, curl examples | x402 first payment | First signal hash-commit |
| **Retention** | Usage dashboard, tier upgrades | Agent auto-renew, fusion engine | Provider quality scoring, transparency dashboard |
| **Revenue** | Subscription billing (NOWPayments) | x402 micropayments, pool accounts | Bond interest, badge subs |
| **Referral** | Affiliate program, community | Agent-to-agent discovery | Verified track record as marketing |

**Key insight:** The three layers are not independent. Agentic acquisition feeds Business retention (agents convert to subscription). Governance revenue is trivial alone but enables Business trust which drives higher conversion and ARPU. The investment order must reflect this: Business (foundation) -> Governance (trust differentiator) -> Agentic (next-wave distribution).

---

## Instrumentation Priority

| Priority | What | Why | Cost |
|---|---|---|---|
| P0 | API key -> event logging pipeline (call count, latency, error rate, tier) | Every metric downstream depends on this | Build (1 sprint) |
| P0 | Signup -> activation funnel (page view, key gen, first call, first paid) | Validates conversion hypothesis | Build (integration) |
| P1 | Agent call attribution (agent key, MCP session ID) | Agentic OKRs depend on agent vs human disambiguation | Build (MCP middleware) |
| P1 | Provider signal quality scoring pipeline | Governance OKRs; requires trade data for verification | Build (data pipeline) |
| P2 | Transparency dashboard (public) | Trust marketing; nice-to-have at launch, required by M6 | Build (frontend) |

---

## North Star

**Monthly Active Signal Consumers (MASC)** — count of unique API keys (human + agent) with successful signal requests trailing 30d. Single metric that captures value exchange at all three layers.

| Layer | MASC Component | Weight |
|---|---|---|
| Business | Human developer API keys active >0 calls in 30d | Primary |
| Agentic | Agent keys with MCP-originated calls | Secondary (growing) |
| Governance | Provider keys publishing signals | Supply-side indicator |

---

**Top Unresolved Questions:**

1. Agent vs. human attribution — Can we reliably distinguish API calls from an AI agent vs. a human developer? Agent key registration at signup helps but agent keys can be used by humans too. Is heuristic detection (call patterns, payload structure, latency distribution) needed?

2. x402 tracking — Do we track revenue at call time (when HTTP 402 is returned with settlement info) or at settlement time (when USDC actually lands)? Call-time inflates, settlement-time lags. Recommend settlement-time but flag the lag.

3. Provider quality scoring input — To verify signal accuracy, we need ground truth (actual market outcome). For prediction market signals this is sourced from the market resolution itself. For price-prediction signals (BTC will go up), what defines "correct"? Need a resolution framework for each signal type before scoring pipeline works.

4. OKR refresh cadence — Should OKRs be reviewed monthly (agile) or quarterly (traditional)? Recommend quarterly for O1-O8 with monthly pulse on leading indicators.
