# MekongMind Harness — Workflow Rules for algo-trader

## Purpose

These rules govern how Claude Code interacts with me-deep-wrapper (MekongMind Solo Company Orchestrator) during algo-trader development.

## Pre-Work Protocol

Before starting any implementation work:

1. **Check goal state:** `/mekong status` — shows active goal, gate status, bottleneck
2. **Verify gate:** `/mekong gates` — ensure current gate has evidence
3. **Check command allowed:** `/mekong allow <command>` — verify command is allowed at current gate
4. **Read department SOP:** `me solo sop <department>` if needed

## Post-Work Protocol

After completing implementation:

1. **Record artifact:** `/mekong artifact <gate> <dept> "<note>"`
2. **Verify gate passes:** `/mekong gates`
3. **Update goal state:** `me goal show` to confirm progress

## Department Routing

| Task Type | Department | Claude Code Action |
|-----------|-----------|-------------------|
| Build feature | engineering-factory | `/cook` with fullstack-developer |
| Code review | quality-compliance | `/review` with code-reviewer |
| Deploy | platform-operations | `/ship` with devops-expert |
| Research | market-intelligence | `/research` with researcher agents |
| Revenue | sales-revenue | `/mekong revenue` |

## Gate Progression

```
idea-intake → company-blueprint → offer-validated → mvp-live → first-revenue → repeatable-channel → fulfillment-stable → scale-ready → first-1m-mrr
```

Each gate requires evidence artifacts in `state/evidence/`.

## Error Recovery

- If gate blocked → write missing evidence, don't skip gate
- If command not allowed → check `me solo allow <cmd>`, find correct department
- If goal missing → `me goal "<description>"` to create new goal

## Integration with algo-trader SDLC

The MekongMind harness integrates with algo-trader's 4-phase SDLC:

1. **Specification** → CEO Command gate (idea-intake)
2. **Design** → CEO Command gate (company-blueprint)
3. **Code** → Engineering Factory gate (mvp-live)
4. **Deploy** → Platform Operations gate (mvp-live)
