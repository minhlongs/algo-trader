# Phase 2: Autonomous GTM & Marketing Engine

## Context
Automates lead attribution across multi-network touchpoints (TikTok, Shopee, Telegram, Web, Twitter), calculates behavioral lead scores, and validates tier onboarding events for paying subscribers.

## Key Insights
- Multi-network attribution maps UTM parameters and referral codes to verified lead records.
- Lead scoring ranks leads into tiers (`COLD`, `WARM`, `HOT`, `QUALIFIED`) based on signals.
- Tier onboarding validates paid subscriptions (`BASIC`, `PREMIUM`, `ENTERPRISE`, `MASTER`) and activates automated onboarding campaigns.

## Related Code Files
- `src/agentic/gtm/lead-attribution-types.ts`
- `src/agentic/gtm/lead-attribution-service.ts`
- `src/agentic/gtm/lead-scoring-engine.ts`
- `tests/unit/agentic/gtm/lead-attribution-service.test.ts`
- `tests/unit/agentic/gtm/lead-scoring-engine.test.ts`

## Success Criteria
- Strict modularization (<= 200 LOC per file).
- 0 TypeScript errors.
- 100% test coverage on lead attribution, scoring, and tier transitions.
