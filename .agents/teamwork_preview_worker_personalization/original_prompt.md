## 2026-05-30T11:27:33Z

You are the teamwork_preview_worker.
Your working directory is: /Users/macbook/algo-trader/.agents/teamwork_preview_worker_personalization

Task:
Please implement the Content Personalization & A/B Testing Framework for the Algo-Trader RaaS Dashboard based on the design specifications and step-by-step strategy from the Explorer handoff:
1. Analysis report: /Users/macbook/algo-trader/.agents/teamwork_preview_explorer_personalization/analysis.md
2. Handoff report: /Users/macbook/algo-trader/.agents/teamwork_preview_explorer_personalization/handoff.md

Steps to execute:
Phase 1: Backend Routes
- Create `src/api/routes/personalization-routes.ts` implementing the GET `/config`, GET `/ab-config`, and POST `/events` endpoints with regex-based tenantId validation and deterministic SHA-256 A/B splitting.
- Register and mount the personalizationRouter in `src/api/server.ts` at `/api/personalization`.
- Create integration tests in `src/api/routes/__tests__/personalization-routes.test.ts` using Supertest to assert correct widget configurations per tier, A/B variant splits, events directory safety checks, and directory traversal LFI attacks rejection.
- Run `pnpm test` (or the specific vitest command) to verify that all tests pass 100%.

Phase 2: Zustand Store
- Create `dashboard/src/stores/ab-test-store.ts` implementing the Zustand store with fetchAbConfig, fetchPersonalizationConfig, trackEvent, flushEvents, reset, and persist middleware.
- Verify it compiles properly.

Phase 3: Bento Grid Layout
- Modify `dashboard/src/pages/dashboard-page.tsx` to read dynamic widgets configuration and feature flags from the Zustand store.
- Map dynamic widgets to components using the colSpan mapping registry.
- Add event tracking on dashboard load, unload, emergency switch, upgrade banner click, and widget click interactions.
- Display the promotional upgrade banner for PRO plan upsell under A/B variant B.
- Apply Cyberpunk style theme when theme is cyberpunk.
- Verify everything builds successfully without compilation errors (`pnpm run dashboard:build`).

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Please write a detailed report of the changes made and tests run to `handoff.md` in your working directory.
Verify code and build/tests conform to all constraints, and notify the Project Orchestrator once done.
