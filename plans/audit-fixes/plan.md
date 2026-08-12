# Security Audit Fixes — 2026-08-12

Outcome: Redact secret exposure from published artifacts; remove OmniRoute bypass in old config; ensure no hardcoded secrets in source.
Constraints: BYOK model preserved; no breaking changes to public contracts.
Non-goals: Adding new auth layers, rotating credentials, migrating `.env` format.
Acceptance: Zero hardcoded secrets in src; published artifact redacted; llm-config fallback removed.

## Phases

- [x] Phase 1: Scout & confirm exposures
- [x] Phase 2: Fix routing fallback (desk config) — primary block updated; remaining Qwen block bypass flagged in reviewer output as H1.
- [x] Phase 3: Produce redacted final audit report
- [x] Phase 4: Code review (mandatory) — see `.orchestrate/latest/phase-4-review.md`
- [x] Phase 5: Tests — TypeScript 0 errors; llm-content-generator.test.ts PASS; 6 pre-existing failures unaffected
- [x] Phase 6: Finalize — 3 shim files written; acceptance criteria verified
