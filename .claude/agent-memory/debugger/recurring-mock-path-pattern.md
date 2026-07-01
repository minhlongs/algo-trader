---
name: recurring-mock-path-pattern
description: Tests in this project frequently use vi.mock() paths that don't match the actual import specifiers used by production code — always check for index.ts existence first.
metadata:
  type: project
---

Many directories (billing, notifications, audit, middleware, db) have no `index.ts` barrel file. Tests that mock these directories (`vi.mock('../../billing')`) create virtual modules that never intercept real imports from specific files (`../../billing/license-service`).

**Why:** After a src/ consolidation/split, barrel files were not added to all directories. Tests written against the old barrel structure silently produce useless mocks.

**How to apply:** When investigating a test that mocks a path resolving to a directory, always check if that directory has an `index.ts`. If not, change the mock to match the actual import specifier from the production code (use `grep` on the production file to find the exact path).
