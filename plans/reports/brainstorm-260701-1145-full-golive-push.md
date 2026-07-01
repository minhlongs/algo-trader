# Brainstorm: Full Go-Live Push

**Date:** 2026-07-01 | **Verdict:** GO | **Source:** /brainstorm plan next?

## Problem

PR #216 (marketplace stocking, 2,492 tests) can't merge. GitHub Actions disabled at account level. 7 open PRs, many stale (April–June). 59 plan dirs, ~76 stale. Golive checklist has 3 remaining items. Need one coordinated push to go live.

## Solution: Full Go-Live Push (Path C)

### Workstream 1: Unblock → Merge → Deploy
1. Enable GitHub Actions: `gh api -X PUT repos/longtho638-jpg/algo-trader/actions/permissions -f enabled=true -f allowed_actions=all`
2. Wait for CI to pass on PR #216 (4 gates: Validation, Security, Quality, Dependencies)
3. Merge PR #216: `gh pr merge 216 --squash --delete-branch`
4. Deploy dashboard: `cd dashboard && pnpm run deploy:production`
5. Deploy worker: `cd apps/sophia-ai-factory && npm run deploy:full` (if applicable) or `wrangler deploy`
6. Run seeder: call `seedDeskStrategies()` against production DB

### Workstream 2: Cleanup
1. Delete stale plan dirs (pre-June 29): ~76 dirs
2. Delete empty src dirs: 7 dirs (from architecture separation)
3. Close stale PRs: #215, #214, #213, #211, #106, #91 (comment why, close)
4. Clean git state

### Workstream 3: Golive Checklist
1. Docker stack: verify `docker-compose.prod.yml` status
2. Marketing: Twitter/X profile, Discord server, launch announcement (48hr schedule)

## Dependencies

```
Enable CI → PR #216 passes → Merge → Deploy dashboard + worker → Run seeder
                                                                    ↓
Cleanup stale plans + PRs (parallel) ←──────────────────────────────┘
                                                                    ↓
Golive checklist remaining items (parallel) ←───────────────────────┘
```

## Risk

None. CI enable is a toggle. Cleanup is deletions only. Deploy follows existing scripts. Marketing items are external.
