# Red Team: Failure Mode Analysis -- Plan Review Report

**Plan:** AI Co-pilot + GTM -- Next Wave IV
**Plan path:** /Users/macbook/algo-trader/plans/260704-0023-ai-co-pilot-next-wave/
**Reviewer:** code-reviewer (failure mode analyst + flow tracer)
**Date:** 2026-07-04

---

## Finding 1 (Critical): AlphaEar client modification targets a non-existent path

- **Severity:** Critical
- **Location:** Phase 1, Step 8 (Fallback LLM Chat)
- **Flaw:** The plan says to modify `src/platform/intelligence/alphaear-client.ts` to wire in the DeepSeek R1 fallback, but `src/platform/intelligence/` does not exist. The actual AlphaEar client lives at `src/desk/intelligence/alphaear-client.ts`.
- **Failure scenario:** The implementation step directs the developer to create or modify a file at a path that doesn't exist. Running `pnpm typecheck` will produce an import error when `co-pilot-routes.ts` or `intent-classifier.ts` tries to import from a non-existent path. The LLM fallback will silently fail at compile time, not runtime.
- **Evidence:**
  - Plan Phase 1, line 47: `Modify: ... src/platform/intelligence/alphaear-client.ts -- Expose LLM chat fallback if needed`
  - Codebase: `find /Users/macbook/algo-trader/src/platform/intelligence` returns "No such file or directory"
  - Codebase: `src/desk/intelligence/alphaear-client.ts` exists (confirmed by find)
  - The plan's own "Related Files" lists `src/desk/intelligence/prediction-accuracy-tracker.ts` (correct desk/ path) but lists the alphaear client under `src/platform/` (wrong)
- **Suggested fix:** Change the path in Phase 1 Step 8 to `src/desk/intelligence/alphaear-client.ts`. Add the import to the Phase 1 risk assessment as a cross-layer dependency (platform importing from desk, which is allowed per architecture).

---

## Finding 2 (Critical): Telegram /ask handler has no auth mechanism -- every request will 403

- **Severity:** Critical
- **Location:** Phase 4, Step 1 (Telegram /ask Handler)
- **Flaw:** The `/ask` Telegram handler calls `fetch(${API_URL}/api/v1/co-pilot/ask)` with no authentication headers. The co-pilot endpoint is gated by `requireTier('PRO')` middleware. No Bearer token, no API key, no session cookie is included in the fetch call. Every `/ask` request will be rejected with 401 or 403 before it reaches the co-pilot logic.
- **Failure scenario:** A user sends `/ask what's my risk exposure?` on Telegram. The handler calls the PRO-gated API endpoint without auth. The API returns 401/403. The handler reads `response.json()` from an error body, which doesn't match the expected `CopilotResponse` schema. The Telegram user sees either a confusing error or no response at all (if the error path isn't handled).
- **Evidence:**
  - Phase 4, lines 46-50: `fetch(${API_URL}/api/v1/co-pilot/ask, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({query, context: {source: 'telegram'}})})` -- no auth header
  - Phase 1, line 165: "Tier gating: PRO tier for all intents (FREE can use fallback_chat)"
  - Phase 1, line 143: `router.post('/api/v1/co-pilot/ask', requireTier('PRO'), async (req, res) => {`
  - Codebase: `src/platform/middleware/feature-gate.ts:71` confirms `requireTier` checks `TIER_HIERARCHY` and returns 403 if insufficient
  - Codebase: Telegram `/link` command links license keys but there is no mechanism to pass them as API auth headers
- **Suggested fix:** Either (a) have the Telegram handler call the co-pilot logic directly (import the handler functions instead of using HTTP fetch), which bypasses the Express middleware and requires inline tier checking, or (b) implement auth token propagation from Telegram sessions to the API call. Option (a) is cleaner and avoids the double network hop.

---

## Finding 3 (Critical): Phase 4 imports are dead code with wrong relative paths -- will not compile

- **Severity:** Critical
- **Location:** Phase 4, Step 1 (Telegram /ask Handler code)
- **Flaw:** The Phase 4 plan code shows two imports that are both dead code AND have incorrect relative paths:
  ```
  import { classifyIntent } from '../../intelligence/co-pilot/intent-classifier'
  import * as riskHandler from '../../intelligence/co-pilot/handlers/risk-handler'
  ```
  From `src/platform/telegram/ask-handler.ts`, `../../` resolves to `src/`, so the full path becomes `src/intelligence/co-pilot/intent-classifier` which does not exist. The correct path would be `../api/routes/co-pilot-routes` (or `../../platform/api/routes/co-pilot-routes`). Furthermore, these imports are never used -- the handler calls the API via `fetch()` on line 46. This is dead code that will fail `pnpm typecheck`.
- **Failure scenario:** TypeScript compilation fails on the Phase 4 `ask-handler.ts` because of unresolvable imports. A developer unfamiliar with the architectural intent may either create the wrong file structure or remove the imports and refactor the handler, introducing delay or inconsistency.
- **Evidence:**
  - Phase 4, lines 37-38: Import statements shown above
  - Phase 4, lines 45-55: The handler body uses `fetch(${API_URL}/api/v1/co-pilot/ask)` -- neither `classifyIntent` nor `riskHandler` from the imports are referenced anywhere in the handler
  - Codebase: `ls /Users/macbook/algo-trader/src/intelligence/` returns "No such file or directory"
  - Codebase: `find /Users/macbook/algo-trader/src/platform -name "intelligence" -type d` returns empty (no dir at platform level)
  - Confirm: from `src/platform/telegram/`, `../../` resolves to `src/`, meaning the import target is `src/intelligence/co-pilot/` -- which does not exist
- **Suggested fix:** Remove the dead imports entirely. The handler should either call the API via fetch (which it does) or import the handler logic directly -- not both. If the intent is to call the API via HTTP, the imports are unnecessary. If direct logic calls are desired, fix the import paths and remove the HTTP round-trip.

---

## Finding 4 (High): 5s LLM query timeout silently breaks Telegram responses for complex queries

- **Severity:** High
- **Location:** Phase 1, Steps 7-8 (Route Handler + Fallback LLM) interacting with Phase 4, Risk Assessment
- **Flaw:** The AlphaEar client's `queryLLM` method (used for fallback chat) has a hard-coded `AbortSignal.timeout(5000)` -- a 5-second timeout for LLM queries. The plan's Phase 4 risk assessment says "Telegram has 30s timeout. Mitigation: timeout after 25s, return partial response." But the plan never accounts for the 5s timeout baked into the actual AlphaEar client code. DeepSeek R1 reasoning queries commonly take 8-15 seconds for complex analysis. Any query that requires actual reasoning will be terminated at 5s, returning a timeout error to the user.
- **Failure scenario:** A user asks "generate a comprehensive weekly report including risk metrics, arb opportunities, and strategy performance across all active strategies." The system routes it to the LLM fallback (or it matches weekly_report and gathers data from 5 handlers, then the LLM formats). The LLM takes 12 seconds to reason. The 5s timeout fires. The response is a timeout error or empty string. Telegram gets the error string and shows it to the user. The user retries, same result. No partial response is delivered because the entire fetch is aborted.
- **Evidence:**
  - Codebase: `src/desk/intelligence/alphaear-client.ts:149`: `signal: AbortSignal.timeout(5000)` (the `queryLLM` / LLM-specific method)
  - Codebase: `src/desk/intelligence/alphaear-client.ts:17`: `const TIMEOUT_MS = 30_000` (the general ask method)
  - The plan's route handler uses the LLM path for `fallback_chat` but doesn't specify which AlphaEar method to call
  - Phase 4, line 154: "Mitigation: timeout after 25s" -- this timeout value conflicts with the actual 5s timeout in the LLM code
  - The plan does not mention wrapping or overriding the AlphaEar client's timeout settings
- **Suggested fix:** Phase 1 Step 8 must explicitly override the timeout when wiring the fallback: either increase `AbortSignal.timeout(25000)` for LLM queries, or pass a configurable timeout parameter. The risk mitigation claim of "25s timeout" must be implemented in code, not just documented.

---

## Finding 5 (High): Five parallel data-gathering handlers have no timeout wiring in the plan's implementation

- **Severity:** High
- **Location:** Phase 1, Step 7 (Route Handler) and Risk Assessment
- **Flaw:** The plan's risk assessment says "Mitigation: parallel Promise.all, 5s timeout" but the actual route handler code shown in Step 7 uses a plain `switch` statement with no `Promise.all`, no `Promise.race`, and no per-handler timeout. Each handler is awaited sequentially. If one handler hangs (e.g., `handleRiskQuery` waits on a slow market data provider, or `handleArbQuery` waits on Gamma API), the entire request stalls. There is no `AbortController` or timeout wrapping.
- **Failure scenario:** The `regime-handler` calls `SignalFusionEngine` which depends on `detectRegime` from the regime detector. If the market data provider is failing and the circuit breaker is open, the call could hang for 30+ seconds (the default ALPHAEAR_TIMEOUT_MS). The client-side dashboard chat shows "AI is thinking..." indefinitely. The Telegram 30s bot timeout fires and drops the response. The user sees no error -- just a broken experience.
- **Evidence:**
  - Phase 1, lines 151-157: Sequential switch-case with `await` on each handler
  - Phase 1, line 219: "Mitigation: parallel Promise.all, 5s timeout" (risk section, not reflected in code)
  - Phase 1, lines 82-138: Each handler calls existing services that depend on external APIs (GammaClient on line 108, SignalFusionEngine on line 129, etc.)
  - Codebase: `src/desk/intelligence/alphaear-client.ts:17`: `TIMEOUT_MS = 30_000` -- the underlying client timeout is 30s, not 5s
- **Suggested fix:** Replace the sequential switch-case with parallel execution using `Promise.all` with a per-handler timeout wrapper:
  ```typescript
  async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try { return await p; }
    finally { clearTimeout(timer); }
  }
  ```

---

## Finding 6 (High): No concurrent-request guardrails for the intent classifier / handler pipeline

- **Severity:** High
- **Location:** Phase 1, entire (no request-ID or per-user serialization)
- **Flaw:** The plan describes zero concurrency controls. The intent classifier is stateless (good), but the handler pipeline has:
  - No per-user request queue -- if a user sends 2 queries rapidly, both execute simultaneously
  - No request cancellation -- sending a new query doesn't cancel an in-flight handler for the same user
  - No request ID for log correlation -- if a handler crashes, it's impossible to trace which user/query caused it
  - Trading data read race -- `handleRiskQuery` reads KellyPositionSizer and DrawdownMonitor, which are updated by a background worker. Two concurrent reads could see two different states (the "torn read" problem for composed reads)
- **Failure scenario:** User sends "/ask what's my risk?" while the background KellyPositionSizer recalculates. The first handler reads position sizes before recalculation, the second handler (triggered by a retry tap) reads after. They return different risk scores. The user sees inconsistent results and loses trust. The dashboard chat shows "AI is thinking..." for the first query, then both responses appear at once.
- **Evidence:**
  - Phase 1: No mention of request IDs, per-user queues, cancellation, or trace correlation
  - Phase 1, handlers list: risk-handler reads from `KellyPositionSizer` (a mutable singleton), `DrawdownMonitor` (stateful gauge)
  - Codebase: `src/desk/risk/kelly-position-sizer.ts:36`: confirmed as stateful singleton
  - Codebase: `src/desk/wiring/qwen-drawdown-monitor.ts:177`: `startDrawdownMonitor()` runs in background updating shared state
- **Suggested fix:** Add a request ID to the co-pilot response envelope for traceability. Optionally implement per-user serialization (cancel in-flight request when new one arrives for same user, or queue). At minimum, log a generated request ID at handler entry/exit for debugging.

---

## Finding 7 (Medium): Phase 1 "Related Files" lists wrong path for spread-detector

- **Severity:** Medium
- **Location:** Phase 1, "Related Files" section (line 206)
- **Flaw:** The plan's "Related Files" lists `src/desk/execution/spread-detector.ts` as a file to reference when implementing `arb-handler.ts`. This path does not exist. The actual file is at `src/desk/arbitrage/spread-detector.ts`.
- **Failure scenario:** Developer searches for `SpreadDetector` at the listed path, doesn't find it, wastes time grepping. In a worst case, they create a new SpreadDetector at the wrong path instead of using the existing one.
- **Evidence:**
  - Phase 1, line 206: `- \`src/desk/execution/spread-detector.ts\``
  - Codebase: `ls /Users/macbook/algo-trader/src/desk/execution/spread-detector.ts` returns "No such file or directory"
  - Codebase: `ls /Users/macbook/algo-trader/src/desk/arbitrage/spread-detector.ts` exists
  - Codebase `src/desk/arbitrage/trading-loop.ts:8`: confirms the correct import path is `./spread-detector` from the arbitrage directory
- **Suggested fix:** Change the path to `src/desk/arbitrage/spread-detector.ts` in the Related Files list.

---

## Finding 8 (Medium): Plan does not handle the confidence gap for ambiguous queries

- **Severity:** Medium
- **Location:** Phase 1, Step 1 (Intent Classifier) and Risk Assessment
- **Flaw:** The intent classifier uses keyword-based regex matching. The confidence score is only ever 0 (no match = fallback) or some positive value (match found). The risk assessment says "if < 0.5 then fallback_chat" but the keyword-based design does not actually produce confidence values between 0 and the match threshold. More critically, a query like "how's my P&L on risk-parity strategy?" contains keywords for both `risk_assessment` ("risk") and `strategy_performance` ("p&l", "strategy") -- the classifier has no mechanism to handle ambiguous or multi-intent queries.
- **Failure scenario:** User asks "what's the drawdown on my momentum strategies?" Contains "drawdown" (risk_assessment) and "strategies" (strategy_performance). The classifier matches risk_assessment first (because the pattern array lists "risk" first). The response shows risk data with no strategy performance information. The user has to send a second query to get the data they actually wanted.
- **Evidence:**
  - Phase 1, lines 59-65: Keyword patterns defined as `Record<Exclude<Intent, 'fallback_chat'>, RegExp[]>`
  - Phase 1, lines 67-70: `classifyIntent` returns "highest confidence match" but with keyword matching, confidence is binary (matched/not matched) for each pattern -- there is no partial matching or nearness scoring
  - Phase 1, line 218: "if < 0.5 then fallback_chat" -- mathematically unreachable with binary keyword matching
- **Suggested fix:** Either (a) remove the confidence threshold claim since it's not meaningful for keyword matching, or (b) add TF-IDF or embedding-based semantic similarity for proper confidence scoring. Include a tiebreaker strategy for multi-intent queries (e.g., ask the user to clarify, or execute both and concatenate results).

---

## Finding 9 (Medium): STARTER tier marketing targets users who cannot use the promoted feature

- **Severity:** Medium
- **Location:** Phase 2, Step 1 (STARTER campaign) vs Phase 1, Step 7 (Tier gating)
- **Flaw:** Phase 2 promotes the STARTER tier ($19/mo) with "50 RPM, 5K daily API, 3 strategies" and mentions AI Co-pilot as a highlight. But Phase 1 explicitly gates ALL co-pilot intents at PRO tier. STARTER users who upgrade based on the campaign will find that the AI Co-pilot feature they were sold on returns "upgrade to PRO" errors. This creates a product mismatch and churn risk.
- **Failure scenario:** A FREE user receives the campaign email, sees "AI Co-pilot -- your trading assistant," upgrades to STARTER for $19/mo, then immediately tries "what's my risk exposure?" The response is "This feature requires PRO tier (current: STARTER)." The user feels misled and either downgrades or files a support complaint.
- **Evidence:**
  - Phase 1, line 165: "Tier gating: PRO tier for all intents (FREE can use fallback_chat)"
  - Phase 2, lines 31-36: STARTER tier email includes "AI Co-pilot features" promotion
  - Codebase: `feature-gate.ts:34`: `STARTER: 0.5` in the hierarchy -- STARTER is only slightly above FREE
  - Neither Phase 1 nor Phase 2 specifies co-pilot access for STARTER tier
- **Suggested fix:** Either (a) grant STARTER tier access to a subset of intents (e.g., risk_assessment and market_regime only, as lower-compute queries), or (b) update the GTM campaign to not mention AI Co-pilot as a STARTER benefit, or (c) document the mismatch clearly with a decision for the product owner.

---

## Summary of Findings

| # | Severity | Phase | Category |
|---|----------|-------|----------|
| 1 | Critical | P1 | Wrong file path -- AlphaEar at desk/ not platform/ |
| 2 | Critical | P4 | No auth in Telegram /ask fetch -- every request returns 403 |
| 3 | Critical | P4 | Dead imports with wrong relative paths -- won't compile |
| 4 | High | P1/P4 | 5s LLM timeout conflicts with Telegram 30s limit |
| 5 | High | P1 | No timeout wiring in handler pipeline (sequential, not parallel) |
| 6 | High | P1 | No concurrent-request guardrails |
| 7 | Medium | P1 | Wrong spread-detector path in "Related Files" |
| 8 | Medium | P1 | Confidence threshold claim unreachable for keyword classifier |
| 9 | Medium | P2 | STARTER campaign sells co-pilot, but co-pilot requires PRO |

Findings 1, 2, and 3 are compile-time or auth-fail blockers. The plan will produce non-working code at these points.
