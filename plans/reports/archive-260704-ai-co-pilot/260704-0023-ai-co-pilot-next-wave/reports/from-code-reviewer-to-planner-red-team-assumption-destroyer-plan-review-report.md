# Red-Team Assumption Destroyer: Plan Review Report

## Review Metadata

- **Plan:** AI Co-pilot + GTM - Next Wave IV
- **Plan dir:** `/Users/macbook/algo-trader/plans/260704-0023-ai-co-pilot-next-wave/`
- **Reviewer:** code-reviewer (assumption destroyer + scope auditor)
- **Date:** 2026-07-04

## Methodology

All 5 phase files read. Every referenced service, file path, and behavioral claim verified against actual codebase via grep and file reads. Evidence cited with file:line references.

---

## Finding 1 (CRITICAL): Fallback LLM chat depends on non-existent AlphaEar capability

- **Location:** Phase 1, Step 8 "Fallback LLM Chat"
- **Plan claim:** "Wire into existing `AlphaEar` client - Send query to DeepSeek R1 via AlphaEar"
- **Flaw:** The `AlphaEarClient` class has NO method for free-text chat, LLM query, or generic OpenAI-compatible completion. The plan assumes a capability that doesn't exist.
- **Evidence:** `src/desk/intelligence/alphaear-client.ts` exports exactly these methods:
  - `fetchHotNews()` - news aggregation
  - `discoverPolymarkets()` - market discovery
  - `extractContent()` - URL content extraction
  - `analyzeSentiment()` / `batchSentiment()` - FinBERT analysis
  - `forecast()` - Kronos time-series
  - `trackSignal()` - signal evolution
  - `checkHealth()` - sidecar health
  - `explainPrediction()` / `getFeatureImportance()` / `generateCounterfactuals()` - XAI
  - `extractStrategyRules()` - rule extraction
  - None of these accept a free-text query and return an LLM chat response.
- **Failure scenario:** Developer wires `fallback_chat` to `AlphaEarClient.someChatMethod()` which doesn't exist. Either they must write a new method (scope creep not in plan) or discover the existing pattern used elsewhere: `loadLlmConfig()` + direct `fetch()` to `/chat/completions` (as done in `src/desk/intelligence/dual-level-reflection-engine.ts` lines 115-116). Neither path is planned or budgeted.
- **Actual existing pattern** (from `dual-level-reflection-engine.ts:115-116`): `const { primary } = loadLlmConfig(); const resp = await fetch(\`${primary.url}/chat/completions\`, ...)` -- completely bypasses AlphaEar client.
- **Suggested fix:** Either (a) plan to add a `chat()` method to AlphaEarClient (new sidecar endpoint needed) OR (b) use existing `loadLlmConfig()` + direct fetch pattern. If (b), remove all references to "via AlphaEar" and budget time for wiring.

---

## Finding 2 (CRITICAL): Referenced file paths don't match actual codebase structure

- **Location:** Phase 1, "Files" section, modify list
- **Plan claims:**
  - File to modify: `src/platform/intelligence/alphaear-client.ts` (line 46)
  - New directory: `src/platform/intelligence/co-pilot/` (lines 32-41)
- **Evidence:**
  - Actual path: `src/desk/intelligence/alphaear-client.ts` -- NOT under `src/platform/`
  - `src/platform/intelligence/` directory does not exist and has no files
  - All intelligence services live under `src/desk/intelligence/`:
    - `src/desk/intelligence/alphaear-client.ts`
    - `src/desk/intelligence/signal-fusion-engine.ts`
    - `src/desk/intelligence/prediction-accuracy-tracker.ts`
    - `src/desk/intelligence/logical-hedge-discovery.ts`
- **Failure scenario:** Developer following the literal plan creates `src/platform/intelligence/` and puts co-pilot handlers there, while the existing services they import from are in `src/desk/intelligence/`. The platform -> desk import direction is valid per architecture rules, but finding the right imports becomes a scavenger hunt. The plan's "Related Files" section at lines 203-207 correctly lists desk paths for some services but contradicts its own "Files" section.
- **Severity note:** CRITICAL because this breaks every import chain. If a developer blindly follows the create-listed-pattern, every import path will be wrong.
- **Suggested fix:** Move all `src/platform/intelligence/co-pilot/` paths to `src/desk/intelligence/co-pilot/` (consistent with where all other intelligence lives), OR explicitly document the cross-context import. Update the alphaear-client reference to `src/desk/intelligence/alphaear-client.ts`.

---

## Finding 3 (HIGH): Telegram bot registration pattern incompatible with class-based architecture

- **Location:** Phase 4, Step 2 "Register Command"
- **Plan claims:** (lines 61-73)
  ```typescript
  import { handleAsk } from './ask-handler'
  bot.command('ask', async (ctx) => { ... })
  ```
  This implies adding these lines directly in `bot.ts` as top-level code.
- **Evidence:** `src/platform/telegram/bot.ts` wraps the `Bot` instance inside the `TelegramBotService` class:
  - `private bot: Bot<Context> | null = null` (line ~30)
  - Commands registered via `this.bot.command(...)` inside `private setupCommands(): void` method (lines 119-140)
  - `bot` is NOT accessible at module scope
- **Failure scenario:** Developer adds the plan's code verbatim -- it fails to compile because `bot` is not defined at module scope. Correct approach requires modifying `setupCommands()` to add `this.bot.command('ask', ...)` and importing `handleAsk` at the top of `bot.ts`. The plan's code snippet is misleading and wastes time for anyone who trusts it.
- **Suggested fix:** Replace the code snippet with instructions to add a `this.bot.command('ask', ...)` call inside `setupCommands()` and import `handleAsk` in the existing import block.

---

## Finding 4 (HIGH): Email campaign infrastructure for bulk/segmentation does not exist

- **Location:** Phase 2, Step 3 "Send Campaign"
- **Plan claims:**
  - "Use existing email service (`SendGrid` via `EmailService`)" (line 49)
  - "Segment: all users with tier=FREE" (line 50)
  - "Schedule: Day 4-5" (line 53)
- **Evidence:** `src/platform/notifications/email-service.ts` contains a singleton `EmailService` with a single method `send(notification: EmailNotification): Promise<boolean>` that sends ONE email at a time. There is:
  - No `sendBulk()` or `sendCampaign()` method
  - No template management
  - No user segmentation querying
  - No batch processing
  - No scheduling capability
  - No SendGrid list/template API integration
- **Failure scenario:** To send a campaign to all FREE tier users, the developer must build from scratch: (a) a query to select users by tier (no existing user repository pattern shown in codebase), (b) batch processing logic, (c) SendGrid template API integration if personalization is needed, (d) rate-limit aware sending that respects the existing 1-second delay. This is a full sub-project, not a "2-day" phase. The plan budgets 2 days total for the entire Phase 2 (email content + sending + testing).
- **Suggested fix:** Either (a) add a new `sendBulk()` method to EmailService and budget 1-2 additional days for email infrastructure, or (b) document that this requires a SendGrid template/personalization integration and significantly expand the timeline, or (c) scope the campaign to manually sending individual test emails and acknowledge that full FREE-tier segmentation is out of scope.

---

## Finding 5 (HIGH): Intent classifier will produce ambiguous results for real user queries

- **Location:** Phase 1, Step 1 "Intent Classifier"
- **Plan claims:** 5 distinct intents with keyword patterns will reliably classify queries (lines 59-70)
- **Evidence:** The regex patterns are overlapping and underspecified:
  - `risk_assessment`: `/risk/i`, `/exposure/i`, `/drawdown/i`, `/overexposed/i`, `/circuit.?breaker/i`
  - `arb_scan`: `/arb/i`, `/opportunit/i`, `/mispric/i`, `/spread/i`, `/hedge/i`
  - `strategy_performance`: `/strategy/i`, `/performance/i`, `/win.?rate/i`, `/sharpe/i`, `/p&l/i`, `/profit/i`
  - `market_regime`: `/regime/i`, `/market (doing|trend|state)/i`, `/trending/i`, `/ranging/i`, `/bull/i`, `/bear/i`
  - `weekly_report`: `/report/i`, `/summary/i`, `/weekly/i`, `/overview/i`, `/digest/i`
  
  Real contradictory queries:
  - "Show me the weekly risk report" -> matches risk_assessment AND weekly_report
  - "What's my strategy performance summary?" -> matches strategy_performance AND weekly_report
  - "Give me a report on trending market opportunities" -> matches arb_scan AND weekly_report AND market_regime
  - "How is my drawdown on my arb strategies?" -> matches risk_assessment AND arb_scan
  - "I want to hedge my exposure" -> matches risk_assessment AND arb_scan
- **Failure scenario:** No confidence scoring algorithm is defined (the plan shows `return { intent, confidence }` but no implementation). No tie-breaking logic. No disambiguation for queries matching multiple intents. The "confidence threshold < 0.5 -> fallback" mitigation is meaningless without defining how confidence is calculated. Every query containing words like "report", "risk", "market" produces wrong or unpredictable intent classification.
- **Suggested fix:** Define confidence scoring (e.g., ratio of matched patterns to total patterns for each intent), add tie-breaking rules, and specify a disambiguation strategy (e.g., return the intent with the most matches, or prompt user to clarify). Add test cases for the ambiguous queries listed above.

---

## Finding 6 (HIGH): Dashboard mount pattern is structurally incompatible with existing code

- **Location:** Phase 3, Step 7 "Mount in App" (lines 137-151)
- **Plan claims:**
  ```typescript
  function App() {
    return (
      <Layout>
        <Router />
        <CoPilotChat />
      </Layout>
    )
  }
  ```
- **Evidence:** `dashboard/src/App.tsx` (verified at lines 36-110) does NOT have this structure. The actual App component:
  ```typescript
  export function App() {
    return (
      <ErrorBoundary onError={handleGlobalError}>
        <Routes>
          <Route path="/" element={<LandingSoloQuant />} />
          ...30+ routes...
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ErrorBoundary>
    )
  }
  ```
  There is NO `<Layout>`, NO `<Router>` component (it's already upstream), and the entire rendering is routes inside an error boundary.
- **Failure scenario:** Developer drops the plan's snippet into App.tsx -- it breaks because `<Routes>` and `<Route>` must be direct children of a `<Router>` (already upstream), and `<Layout>` doesn't exist as an import. The correct mount requires adding `<CoPilotChat />` as a sibling to `<Routes>` inside `<ErrorBoundary>`, not wrapping everything in non-existent components.
- **Suggested fix:** Update the code snippet to match actual App.tsx structure:
  ```typescript
  <ErrorBoundary onError={handleGlobalError}>
    <Routes>...</Routes>
    <CoPilotChat />
  </ErrorBoundary>
  ```

---

## Finding 7 (MEDIUM): Test count baseline is unverified and likely wrong

- **Location:** Plan.md "Success Criteria" (line 56) and Phase 5 Step 1
- **Plan claims:** "2,855+ tests passing, 0 regressions" and "All 2,855+ tests" across multiple locations
- **Evidence:**
  - CLAUDE.md at project root explicitly states: "190 files, 2806 tests" (under `## Commands` section `pnpm test`)
  - The plan uses 2,855 which is 49 MORE than the documented baseline -- this discrepancy is never explained
  - Running `pnpm test` failed with `ENOENT: coverage/.tmp/coverage-205.json` -- the current test count cannot be verified
  - There is no mention of adding 49 tests in any phase plan (Phase 1 mentions 1 test file with "each intent" tests, but doesn't quantify to 49)
- **Failure scenario:** If the actual baseline is 2,806, then "2,855+ passing" means 49 new tests must be added AND all existing 2,806 must pass. But the plan only creates 3 test files (co-pilot routes, email campaign, ask handler) which collectively would cover 30-50 tests max. If any existing tests regress, the "2,855+" criterion is met before writing any new tests, masking regressions. The success criterion is self-contradictory.
- **Suggested fix:** Verify the actual test count, document the verified baseline in the plan, and clearly separate "existing tests pass" from "new tests complete" in success criteria. Remove the unverified 2,855+ claim and use the documented 2,806.

---

## Finding 8 (MEDIUM): 11-day interleaved timeline is unrealistic for one developer

- **Location:** Plan.md "Execution order" (lines 39-46): Day 1-11 interleaved schedule
- **Scope to deliver in 11 days:**
  - Phase 1: 12+ new source files, 5 intent handlers with 10 implementation steps
  - Phase 2: Email campaign infrastructure (infra doesn't exist per Finding 4), bilingual content, test
  - Phase 3: 5 React components, Zustand store, tests (3-4 day estimate in plan)
  - Phase 4: Telegram command, 4 launch content pieces, tests
  - Phase 5: Full verification, 3 protected flow checks, deploy
- **Evidence from plan's own risk section (Phase 1 lines 217-221):**
  - "Performance handler slow -- gathering data from multiple services. Mitigation: parallel Promise.all, 5s timeout"
  - "LLM fallback depends on DeepSeek R1 -- if LLM down, return graceful error"
  - "AlphaEar sidecar dependency -- fallback_chat needs running sidecar"
  Each of these is a real implementation risk that can add days of debugging.
- **Failure scenario:** The plan assumes everything works on first attempt. Finding 1 (AlphaEar chat doesn't exist) alone adds 1-2 days of unplanned work. Finding 4 (email campaign infra) adds 2-3 days. Finding 5 (intent classifier ambiguity) causes rework after testing. Timeline assumes zero debugging, zero merge conflicts, zero feedback loops.
- **Additionally:** The plan's "interleaved" execution (Phase 1 -> Phase 2 -> Phase 3 -> Phase 4 -> Phase 5) is actually purely sequential, not interleaved. Realt interleaved work would mean overlapping Phase 2 (email) with Phase 1 (backend) on Day 4-5, but the plan shows Phase 1 occupying Days 1-3 exclusively. Calling this "interleaved" is misleading.
- **Suggested fix:** At minimum double the timeline estimate. Budget 1-2 extra days per phase for debugging integration issues. Remove the word "interleaved" as it does not describe the actual schedule.

---

## Finding 9 (LOW): logical-hedge-discovery.ts exports a function, not a class

- **Location:** Phase 1, Step 3 "Arb Handler" (line 108)
- **Plan claims:** "`LogicalHedgeDiscovery` -- hedge discovery" as an existing service
- **Evidence:** `src/desk/intelligence/logical-hedge-discovery.ts` exports:
  - Types: `HedgeTier`, `MarketInput`, `LogicalHedge`
  - Function: `export async function discoverLogicalHedges(markets: MarketInput[]): Promise<LogicalHedge[]>`
  - There is NO `LogicalHedgeDiscovery` class, constructor, or named export anywhere in the file
- **Failure scenario:** Minor -- a developer will find the file and see the function export. But if they search for `LogicalHedgeDiscovery` by name in imports/exports they'll find nothing. This indicates the plan author didn't verify the actual API shape. The handler will need to call `discoverLogicalHedges()` directly rather than instantiate a class.
- **Suggested fix:** Correct the reference to `discoverLogicalHedges()` or import the module's actual exports.

---

## Summary

| # | Severity | Phase | Issue |
|---|----------|-------|-------|
| 1 | CRITICAL | 1 | Fallback LLM chat can't use AlphaEar -- no chat method exists |
| 2 | CRITICAL | 1 | File paths wrong: `src/platform/intelligence/` doesn't exist |
| 3 | HIGH | 4 | Telegram bot registration incompatible with class-based `TelegramBotService` |
| 4 | HIGH | 2 | Email campaign needs bulk/segmentation infra that doesn't exist |
| 5 | HIGH | 1 | Intent classifier has fatal ambiguity with overlapping patterns |
| 6 | HIGH | 3 | Dashboard mount code incompatible with actual App.tsx structure |
| 7 | MEDIUM | 1,5 | Test count 2,855+ is unverified; baseline is 2,806 per CLAUDE.md |
| 8 | MEDIUM | All | 11-day timeline unrealistic given missing preconditions |
| 9 | LOW | 1 | `LogicalHedgeDiscovery` is a function, not a class |

**Verdict:** This plan cannot execute as written. It has 2 critical defects (assumed capabilities that don't exist), 4 high-severity mismatches with actual codebase architecture, and a timeline that doesn't account for the discovered gaps. Recommend rescoping with verified service interfaces before any implementation begins.

## Unresolved Questions

1. The plan claims the deploy pipeline uses `pnpm deploy:full` and `pnpm deploy:verify`. Root package.json has no such scripts -- what deployment pipeline does this project actually use?
2. The "AutoMarketingDaemon" is referenced (Phase 4 success criteria) as publishing blog posts, but the actual daemon (`src/desk/jobs/auto-marketing-daemon.ts`) generates content from trading signals. Does it also publish pre-written blog posts from docs/marketing/ or does that require new integration work?
3. Phase 2 requires querying users by tier -- what is the data access pattern for this? The codebase has no obvious user repository or Prisma schema visible.
