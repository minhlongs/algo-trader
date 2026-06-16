# MekongMind Harness — algo-trader Integration

## Overview

Bridge between algo-trader and me-deep-wrapper (MekongMind Solo Company Orchestrator) for goal-driven development workflow.

## Architecture

```
User → Claude Code (algo-trader)
  ├── /mekong goal <text>   → me goal "<text>"
  ├── /mekong status        → me goal show + gates verify + bottlenecks
  ├── /mekong step <N>      → me step N
  ├── /mekong solo <dept>   → me solo run <dept> ready
  ├── /mekong route <cmd>   → me solo route <cmd>
  ├── /mekong gates         → me solo gates verify --strict
  ├── /mekong bottlenecks   → me solo bottlenecks --strict
  ├── /mekong allow <cmd>   → me solo allow <cmd>
  ├── /mekong artifact      → me solo artifact write
  └── /mekong revenue       → me solo revenue
```

## Files Created

```
.claude/
├── commands/
│   └── mekong.sh                    # /mekong command dispatcher
├── skills/
│   └── mekong-harness/
│       ├── SKILL.md                 # Skill documentation
│       ├── HARNESS.md               # Architecture overview
│       └── manifest.json            # Command/department registry
├── hooks/
│   ├── mekong-harness.sh            # Integration functions
│   ├── mekong-gate-check.sh         # Pre-work gate verification
│   ├── mekong-artifact-record.sh    # Post-work artifact recording
│   └── mekong-context-inject.sh     # SessionStart context injection
└── rules/
    └── mekong-harness-workflow.md   # Workflow rules
```

## Integration Points

### Session Start
- `mekong-context-inject.sh` runs on SessionStart
- Injects active goal, gate status, bottleneck into session

### Pre-Implementation
- `mekong-gate-check.sh` verifies gate status before work
- Checks if command is allowed at current gate

### Post-Implementation
- `mekong-artifact-record.sh` records gate evidence
- Updates goal state in me-deep-wrapper

### Settings
- `settings.json` updated with mekong-context-inject hook on SessionStart

## Department Mapping

| Gate | Department | Claude Code Action |
|------|-----------|-------------------|
| idea-intake | ceo-command | `/plan` |
| company-blueprint | ceo-command | Create plan.md |
| offer-validated | market-intelligence | `/research` |
| mvp-live | engineering-factory | `/cook` |
| first-revenue | sales-revenue | Deploy + track |
| repeatable-channel | growth-marketing | Marketing automation |
| fulfillment-stable | customer-success | Onboarding |
| scale-ready | knowledge-memory | Docs + playbooks |

## Usage

```bash
# In algo-trader project, from Claude Code:
/mekong status          # Check goal/gate/bottleneck
/mekong goal "Build X"  # Create new goal
/mekong solo engineering-factory  # Run department
/mekong gates           # Verify all gates
```

## Related

- me-deep-wrapper repo: `/Users/macbook/Documents/me-deep-wrapper/`
- MekongMind SOP: `sops/mekongmind-department-operating-system.md`
- Hermes mapping: `HERMES-MEKONG-MAP.md`
