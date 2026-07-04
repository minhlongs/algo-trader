# Red Team Plan Review: AI Co-pilot + GTM Next Wave IV

**Reviewer:** code-reviewer (security adversary / fact checker)
**Plan:** plans/260704-0023-ai-co-pilot-next-wave/
**Date:** 2026-07-04
**Findings:** 10 (5 Critical, 3 High, 2 Medium)

---

## Finding 1: Co-pilot files placed in non-existent `src/platform/intelligence/` directory
- **Severity:** Critical
- **Location:** Phase 1, "Files" section
- **Flaw:** The plan creates all co-pilot files under `src/platform/intelligence/co-pilot/`, but `src/platform/intelligence/` does not exist in the codebase. The existing intelligence module lives at `src/desk/intelligence/` (alphaear-client, signal-fusion-engine, prediction-accuracy-tracker). There is no `src/platform/intelligence/` directory at all — only `src/platform/` contains api/, auth/, billing/, telegram/, notifications/, etc.
- **Failure scenario:** All files created at `src/platform/intelligence/co-pilot/` will be orphaned from the existing import pattern. The handlers reference desk services (KellyPositionSizer, DetectionAccuracyTracker, SpreadDetector, etc.) which are in `src/desk/`. Importing from `src/platform/intelligence/` into `src/desk/` is FORBIDDEN by the architecture rules (`desk/` must never import `platform/`), and importing from `src/desk/` into `src/platform/intelligence/` works but misaligns with where all other intelligence code lives. If any handler file at `src/platform/intelligence/` tries to import a desk module that transitively imports from `shared/types/`, it works — but the developer will expect this to be in `src/desk/intelligence/` following the existing pattern.
- **Evidence:**
  - `ls src/platform` — shows `api`, `audit`, `auth`, `billing`, `dashboard`, `db`, `landing`, `marketplace`, `metering`, `middleware`, `notifications`, `raas`, `referral`, `telegram`, `workers` — NO `intelligence/`
  - `ls src/desk/` — shows `intelligence/`, `risk/`, `arbitrage/`, `strategies/`, `execution/`, etc.
  - `src/desk/intelligence/` contains alphaear-client.ts, signal-fusion-engine.ts, etc.
- **Suggested fix:** Either place co-pilot at `src/platform/api/co-pilot/` (as a platform route module) or `src/desk/intelligence/co-pilot/` (following desk intelligence pattern). The plan's placement does not match either convention.

---

## Finding 2: Email service has no campaign/batch support — 2-day estimate is implausible
- **Severity:** Critical
- **Location:** Phase 2, Steps 1-3
- **Flaw:** Phase 2 claims to "Add campaign template support" to `EmailService` and send targeted email campaigns to all FREE tier users. The existing `EmailService` class (`src/platform/notifications/email-service.ts`) has exactly TWO public methods: `send()` (single email) and `sendThresholdAlert()`. There is NO `sendCampaign()`, `sendBulk()`, `sendBatch()`, template rendering, user segmentation, bilingual template storage, click tracking, or unsubscribe handling. The 2-day effort estimate ("S") is grossly inadequate for building campaign management with bilingual templates, SendGrid template integration, user query segmentation ("all FREE tier users"), click tracking setup, and CAN-SPAM compliance (unsubscribe handling).
- **Failure scenario:** The implementation will either hand-roll a loop over `send()` hitting SendGrid rate limits (no batching), or skip campaign features entirely, delivering a broken experience. The plan's assumption that "existing email service" can handle campaigns without significant rework is false.
- **Evidence:**
  ```typescript
  // src/platform/notifications/email-service.ts — only these public methods exist:
  export class EmailService {
    async send(notification: EmailNotification): Promise<boolean>
    async sendThresholdAlert(...)
  }
  ```
  No `sendBatch`, no `sendCampaign`, no template support, no segment query.
- **Suggested fix:** Either (a) scope Phase 2 to a single test email via existing `send()` and defer campaign infrastructure, or (b) increase effort estimate to at least 5-7 days and specify SendGrid Marketing Campaigns API integration, template IDs, segment queries, and unsubscribe tracking.

---

## Finding 3: `pnpm deploy:full` does not exist in package.json
- **Severity:** Critical
- **Location:** Phase 5, Steps 4 and 7
- **Flaw:** Phase 5's success criteria references `pnpm deploy:full` for deployment verification. This script does not exist in the root `package.json` or any package.json in the project. The closest scripts are `deploy:cf` (bash scripts/deploy-cf-worker-with-sha-verification.sh) and `deploy:worker` (wrangler deploy). The plan's post-deploy verification cannot be executed as written.
- **Failure scenario:** Developer reaches Phase 5 and cannot run `pnpm deploy:full`. Either they waste time searching for it, or skip the deployment verification entirely.
- **Evidence:**
  ```bash
  # package.json scripts — no deploy:full
  "deploy:cf": "bash scripts/deploy-cf-worker-with-sha-verification.sh",
  "deploy:worker": "wrangler deploy --config wrangler.toml",
  ```
  No `deploy:full` string exists anywhere in `package.json` or `scripts/`.
- **Suggested fix:** Use the existing `deploy:cf` script, or define `deploy:full` as an alias for the deploy pipeline. Update Phase 5 to reference a real script.

---

## Finding 4: Currently 4 failing tests — plan assumes 0 regressions without addressing them
- **Severity:** High
- **Location:** Phase 5, Step 1 + plan.md "Success Criteria"
- **Flaw:** The plan states "2,855+ tests passing, 0 regressions" as a success criterion, but the current test suite has 4 failing tests (`4 failed | 246 passed`). The plan provides no strategy for fixing these failures. The failing tests exist BEFORE any co-pilot changes are made. Starting Phase 1 without addressing these failures means the project may never reach the stated success criterion, and regressions from the co-pilot work will be conflated with pre-existing failures.
- **Failure scenario:** At Phase 5, the developer discovers the 4 pre-existing failures plus new failures from the co-pilot work, cannot distinguish between them, and either skips verification or spends unbudgeted time debugging.
- **Evidence:**
  ```bash
  $ pnpm test --run 2>&1 | grep -E "Tests|Test Files"
  Test Files  4 failed | 246 passed (250)
  Tests       2855 passed (2855)
  ```
  4 test files are currently failing.
- **Suggested fix:** Add a Phase 0 (or prepend to Phase 1) that fixes the 4 failing tests before any new code is added. Document which tests fail and the expected fix approach.

---

## Finding 5: Telegram `/ask` handler import paths are inconsistent with plan's own file structure
- **Severity:** High
- **Location:** Phase 4, Step 1 — `ask-handler.ts` imports
- **Flaw:** Phase 4 shows imports like `../../intelligence/co-pilot/intent-classifier` from `src/platform/telegram/ask-handler.ts`. But the plan's own Phase 1 creates the co-pilot files at `src/platform/intelligence/co-pilot/intent-classifier.ts`. The relative path from `src/platform/telegram/ask-handler.ts` to `src/platform/intelligence/co-pilot/intent-classifier.ts` is `../intelligence/co-pilot/intent-classifier`, not `../../intelligence/co-pilot/intent-classifier`. The wrong import depth indicates the plan author was confused about the actual directory structure. If followed literally, this import will fail at runtime with a module-not-found error.
- **Failure scenario:** The `/ask` Telegram command fails to load at startup because the import path is one directory level off. Debugging this wastes developer time.
- **Evidence:**
  - Phase 4 code block: `import { classifyIntent } from '../../intelligence/co-pilot/intent-classifier'`
  - Path resolution: `src/platform/telegram/ask-handler.ts` → `../../` → `src/platform/` → then `intelligence/co-pilot/...` = `src/platform/intelligence/co-pilot/...`
  - Phase 1 creates files at: `src/platform/intelligence/co-pilot/...`
  - Correct relative path: `../intelligence/co-pilot/intent-classifier`
- **Suggested fix:** Fix the import paths in Phase 4 to `'../intelligence/co-pilot/intent-classifier'`. Better yet, if co-pilot is a platform API concern, it should live at `src/platform/api/co-pilot/` and imports would be `'../api/co-pilot/intent-classifier'`.

---

## Finding 6: Dashboard `App.tsx` mounting pattern is incompatible with how the plan mounts CoPilotChat
- **Severity:** High
- **Location:** Phase 3, Step 7
- **Flaw:** The plan shows mounting code:
  ```tsx
  <Layout>
    <Router />
    <CoPilotChat />
  </Layout>
  ```
  The actual `dashboard/src/App.tsx` has NO `Layout` component. It uses an `<ErrorBoundary>` wrapping `<Routes>` (React Router). The sidebar layout (`<LayoutShell>`) is inside `<AuthGuard>` within individual `<Route>` elements, not globally wrapping the router. The plan's proposed mount pattern is incompatible and would either break the app or render CoPilotChat outside the routing context.
- **Failure scenario:** The CoPilotChat component mounts at the app root but has no access to routing context or auth state. Navigation via action buttons (``navigate`` actions) fails. The FAB renders on landing pages where it shouldn't.
- **Evidence:**
  ```tsx
  // dashboard/src/App.tsx — actual structure:
  export function App() {
    return (
      <ErrorBoundary onError={handleGlobalError}>
        <Routes>
          <Route path="/" element={<LandingSoloQuant />} />
          <Route path="/app" element={<AuthGuard><LayoutShell><DashboardPage /></LayoutShell></AuthGuard>} />
          {/* ... more routes, no Layout wrapper */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ErrorBoundary>
    );
  }
  ```
- **Suggested fix:** CoPilotChat should mount inside `<LayoutShell>` (on relevant dashboard pages only) or inside the `<Routes>` block but outside the `<ErrorBoundary>`. The plan should show the actual integration point, not a fictional `<Layout>`.

---

## Finding 7: No rate limiting on LLM-backed endpoint — cost-amplification attack vector
- **Severity:** Critical
- **Location:** Phase 1, Step 7 — `POST /api/v1/co-pilot/ask`
- **Flaw:** The `POST /api/v1/co-pilot/ask` endpoint has tier gating (`requireTier('PRO')`) but NO rate limiting. The existing server.ts applies rate limiting at `/api` level: `this.app.use('/api', limiter)` and `this.app.use('/api', distributedRateLimiter)`. However, the plan creates a new route at `/api/v1/co-pilot/ask` without ensuring it inherits the rate limiter. The LLM fallback (`fallback_chat`) calls DeepSeek R1 via AlphaEar sidecar, which has real per-query cost. Without endpoint-specific rate limiting on the LLM path, an authenticated PRO user can issue unlimited queries, amplifying LLM inference costs unboundedly.
- **Failure scenario:** A PRO-tier user (or attacker with compromised PRO credentials) hammers `/ask` with thousands of fallback queries per minute. DeepSeek R1 costs accrue with no upper bound. The AlphaEar sidecar is overwhelmed. There is no middleware check like the existing routes have (e.g. `distributedRateLimiter`).
- **Evidence:**
  - Plan's route code uses only `requireTier('PRO')` — no rate limiter
  - Server.ts line 139-140: `this.app.use('/api', limiter)` and `this.app.use('/api', distributedRateLimiter)` — global rate limiter exists but endpoint-specific limits are not specified
  - Existing routes in the same area use tier gating WITHOUT additional rate limiting, but those don't call expensive LLM inference
  - Phase 4 note about Telegram 30s timeout: "Mitigation: timeout after 25s, return partial response" — mentions timeout but not rate limiting on the API itself
- **Suggested fix:** Add a stricter endpoint-specific rate limiter to the co-pilot route (e.g. 10 requests/minute for PRO, 2/minute for fallback LLM queries). Or ensure the existing distributed rate limiter covers the new route path.

---

## Finding 8: Missing XSS sanitization for LLM-generated markdown content in dashboard
- **Severity:** High
- **Location:** Phase 3, Step 4 — message bubble markdown rendering
- **Flaw:** Phase 3 mentions "Markdown rendering for bot responses" and "sanitize bot responses, no raw HTML" in Risk Assessment, but provides NO implementation detail or library selection for sanitization. The `fallback_chat` intent passes user-supplied queries to DeepSeek R1 and returns the LLM's response verbatim. An attacker can craft a prompt that causes DeepSeek to output HTML/JavaScript in its response. If the markdown renderer doesn't sanitize (e.g. `rehype-sanitize`, `DOMPurify`), this enables stored XSS in the dashboard chat widget.
- **Failure scenario:** User sends `/ask write a poem about JavaScript with <img src=x onerror=alert(1)>` — DeepSeek may echo or include the payload. If the dashboard renders without sanitization, the injected script executes in the user's browser session. Since the dashboard has access to auth tokens and trading data, this is account takeover territory.
- **Evidence:**
  - Phase 3 Risk Assessment: "Markdown rendering security — Mitigation: sanitize bot responses, no raw HTML" — only a TODO, no library or approach specified
  - Phase 1 Step 8: LLM fallback "Return raw LLM response" — the word "raw" is concerning
  - No react-markdown, rehype-sanitize, or DOMPurify dependency mentioned
- **Suggested fix:** Specify `react-markdown` with `rehype-sanitize` or `DOMPurify`. Document that ALL LLM output MUST pass through an HTML sanitizer before rendering. Add a test confirming XSS payloads are neutralized.

---

## Finding 9: Email campaign segmentation by "last login" — field does not exist
- **Severity:** Medium
- **Location:** Phase 2, Risk Assessment
- **Flaw:** The plan states "segment by last login date, send to active+recent first" as a mitigation for low engagement. However, the `License` type in `src/shared/types/license.ts` has no `lastLogin`, `lastActive`, or `lastSeen` field. There is no user activity tracking in the license model. Implementing "last login date" segmentation requires either (a) adding a new DB column and tracking login events, or (b) querying a different data source that doesn't exist.
- **Failure scenario:** The developer wastes time trying to query "last_login" on a license/user table that has no such column. Or they skip segmentation entirely and blast all FREE users including 3-year-old inactive accounts.
- **Evidence:**
  ```typescript
  // src/shared/types/license.ts — License interface has no date-of-last-activity:
  export interface License {
    id, name, key, tier, status, createdAt, expiresAt, usageCount, maxUsage,
    userId, updatedAt, domain, overageUnits, overageAllowed, tenantId,
    dailyUsage, lastUsageDate, thresholdAlertsSent, subscriptionId,
    dunningStatus, suspensionDate
    // NOTE: lastUsageDate exists but is about LAST API USAGE, not login
  }
  ```
- **Suggested fix:** Either use `lastUsageDate` (which tracks last API usage, close to "last active") or remove the "last login" segmentation claim. Document which field to query for user activity.

---

## Finding 10: `detectRegime()` reference is ambiguous — two incompatible implementations exist
- **Severity:** Medium
- **Location:** Phase 1, Step 5 — regime handler
- **Flaw:** The plan references `detectRegime()` from `regime-detector.ts`, but there are TWO different `detectRegime` implementations in the codebase with incompatible signatures:
  1. `src/desk/arbitrage/regime-detector.ts`: `async detectRegime(symbol: string, exchanges: string[])` — class method, async, requires symbol + exchange params
  2. `src/desk/strategies/dna/regime-detector.ts`: exported function `detectRegime(timeframeIndicators, now)` — synchronous, requires TimeframeIndicators map + timestamp
  The SignalFusionEngine at `src/desk/intelligence/signal-fusion-engine.ts` imports from `../strategies/dna/regime-detector` (the second one), but the plan mentions the arb module's `detectRegime` at the same time. The plan doesn't specify which implementation to use, leading to integration failures.
- **Failure scenario:** Developer picks the wrong `detectRegime` import, passes wrong arguments, and the handler either crashes or returns incorrect regime data silently.
- **Evidence:**
  - `src/desk/arbitrage/regime-detector.ts:111`: `async detectRegime(symbol: string, exchanges: string[])` — class method on RegimeDetector
  - `src/desk/strategies/dna/regime-detector.ts`: exported `function detectRegime(timeframeIndicators: Map<TfId, TimeframeIndicators>, now: number)` — pure function
  - `src/desk/intelligence/signal-fusion-engine.ts` line 179: `const snapshot = detectRegime(timeframeIndicators, now)` — uses the second signature
- **Suggested fix:** Specify which `detectRegime` to use (preferably the SignalFusionEngine-compatible one from `src/desk/strategies/dna/regime-detector.ts` since the handler will be working with fused signals). Include the exact import path and argument shape.

---

## Summary

| # | Finding | Severity | Phase |
|---|---------|----------|-------|
| 1 | Co-pilot files placed in non-existent `src/platform/intelligence/` dir | Critical | Phase 1 |
| 2 | Email service has no campaign/batch support — 2-day estimate implausible | Critical | Phase 2 |
| 3 | `pnpm deploy:full` does not exist | Critical | Phase 5 |
| 4 | Currently 4 failing tests — plan assumes 0 regressions without addressing | High | Phase 5 |
| 5 | Telegram import paths inconsistent with own file structure | High | Phase 4 |
| 6 | Dashboard mounting pattern incompatible with existing App.tsx | High | Phase 3 |
| 7 | No rate limiting on LLM-backed endpoint — cost-amplification attack vector | Critical | Phase 1 |
| 8 | Missing XSS sanitization for LLM markdown output | High | Phase 3 |
| 9 | Email "last login" segmentation — field does not exist | Medium | Phase 2 |
| 10 | `detectRegime()` reference ambiguous between two incompatible implementations | Medium | Phase 1 |

## Recommended Blocking Items (must fix before execution)

1. Move co-pilot files to a valid directory matching project conventions (Finding 1)
2. Add rate limiting to `POST /api/v1/co-pilot/ask` — especially the LLM fallback path (Finding 7)
3. Fix `deploy:full` reference or replace with `deploy:cf` (Finding 3)
4. Fix Telegram import paths in Phase 4 code (Finding 5)
5. Respec Phase 2 effort to account for campaign infrastructure gap, or scope down to single-email send (Finding 2)
