---
name: me-deep-wrapper-harness
description: Harness integration between algo-trader and me-deep-wrapper (MekongMind Solo Company Orchestrator). Routes commands, manages goal state, and bridges Claude Code with MekongMind departments.
metadata:
  type: project
---

# MEKONG Harness — algo-trader Integration

## Purpose

Bridge algo-trader with me-deep-wrapper (MekongMind Solo Company Orchestrator) for goal-driven development workflow.

## Architecture

```
User → Claude Code (this session)
  ├── /mekong <cmd> → me-deep-wrapper CLI
  ├── /mekong goal <text> → create goal in me-deep-wrapper state
  ├── /mekong solo <dept> → run department via me-deep-wrapper
  ├── /mekong status → show current goal/gate status
  └── /mekong route <cmd> → route command to correct department
```

## me-deep-wrapper Location

- **Repo:** `/Users/macbook/Documents/me-deep-wrapper/`
- **CLI:** `me` (shell function → `/Users/macbook/Documents/me-deep-wrapper/bin/me`)
- **State:** `/Users/macbook/Documents/me-deep-wrapper/state/`
- **Registry:** `/Users/macbook/Documents/me-deep-wrapper/agents/registry.json`
- **SOPs:** `/Users/macbook/Documents/me-deep-wrapper/sops/`

## Department Mapping (algo-trader context)

| Gate | Department | Claude Code Action |
|------|-----------|-------------------|
| idea-intake | ceo-command | `/plan` with planner agent |
| company-blueprint | ceo-command | Create plan.md, phase files |
| offer-validated | market-intelligence | Research with researcher agents |
| mvp-live | engineering-factory | `/cook` with fullstack-developer |
| first-revenue | sales-revenue | Deploy + revenue tracking |
| repeatable-channel | growth-marketing | Marketing automation |
| fulfillment-stable | customer-success | Onboarding + support |
| scale-ready | knowledge-memory | Docs + playbook extraction |

## Command Routing

```
/mekong cook → engineering-factory → fullstack-developer agent
/mekong audit-plan → quality-compliance → code-reviewer agent
/mekong revenue → sales-revenue → business-analyst agent
/mekong bridge → engineering-factory → fullstack-developer agent
/mekong lint → quality-compliance → linting-expert agent
/mekong deploy → platform-operations → devops-expert agent
/mekong research → market-intelligence → researcher agents
/mekong plan → ceo-command → planner agent
```

## Goal State Protocol

Goals stored in me-deep-wrapper `state/goal-*.md`:
- Read via: `me goal show`
- Create via: `me goal "<text>"`
- Step execute: `me step N`
- Gate verify: `me solo gates verify`

## Evidence Contracts

Each gate requires evidence artifacts:
- `state/evidence/company-blueprint.json`
- `state/evidence/offer-validated.json`
- `state/evidence/mvp-live.json`
- `state/evidence/first-revenue.json`

## Integration Points

1. **Pre-implementation:** Check `me solo bottlenecks --strict` before starting work
2. **Post-implementation:** Record gate evidence via `me solo artifact write`
3. **Deploy:** Verify via `me solo gates verify --strict`
4. **Revenue:** Sync via `me solo revenue sync polar`

## Related

- [[mekong-harness-skill]] — Skill implementation
- [[mekong-harness-commands]] — Slash commands
- [[mekong-harness-hooks]] — Git hooks integration
