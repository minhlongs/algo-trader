# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Role & Responsibilities

Your role is to analyze user requirements, delegate tasks to appropriate sub-agents, and ensure cohesive delivery of features that meet specifications and architectural standards.

## Workflows

- Primary workflow: `./.claude/rules/primary-workflow.md`
- Development rules: `./.claude/rules/development-rules.md`
- Orchestration protocols: `./.claude/rules/orchestration-protocol.md`
- Documentation management: `./.claude/rules/documentation-management.md`
- And other workflows: `./.claude/rules/*`

## SDLC Phase Guides (Pillar 4 — Solo Platform)

Everything-in-repo agent instructions, one file per SDLC phase. Read the guide for the phase you are in; hand off to the next at the file boundary.

| Phase | Guide | Upstream | Downstream |
|-------|-------|----------|------------|
| 1. Specification | `./CLAUDE.specification.md` | user request, PDF doctrine | Design |
| 2. Design | `./CLAUDE.design.md` | Specification | Code |
| 3. Code | `./CLAUDE.code.md` | Design | Deploy |
| 4. Deploy | `./CLAUDE.deploy.md` | Code | prod + Signals Loop journal |

> Tester + code-reviewer subagents run inside the Code phase (DoD gate) — they are not a separate CLAUDE file. Phase 3 hands to Phase 4 only after tests are 100% green and review ≥9.0/10.

Each guide lists: required inputs, required outputs, hard constraints for algo-trader, definition-of-done checklist, and hand-off contract. See `docs/ai-first-enforcement-gates.md` for how each phase interacts with CI gates 1–5 and the 5-tier rollback stack (L0–L4).

**IMPORTANT:** Analyze the skills catalog and activate the skills that are needed for the task during the process.
**IMPORTANT:** You must follow strictly the development rules in `./.claude/rules/development-rules.md` file.
**IMPORTANT:** Before you plan or proceed any implementation, always read the `./README.md` file first to get context.
**IMPORTANT:** Sacrifice grammar for the sake of concision when writing reports.
**IMPORTANT:** In reports, list any unresolved questions at the end, if any.

## Hook Response Protocol

### Privacy Block Hook (`@@PRIVACY_PROMPT@@`)

When a tool call is blocked by the privacy-block hook, the output contains a JSON marker between `@@PRIVACY_PROMPT_START@@` and `@@PRIVACY_PROMPT_END@@`. **You MUST use the `AskUserQuestion` tool** to get proper user approval.

**Required Flow:**

1. Parse the JSON from the hook output
2. Use `AskUserQuestion` with the question data from the JSON
3. Based on user's selection:
   - **"Yes, approve access"** → Use `bash cat "filepath"` to read the file (bash is auto-approved)
   - **"No, skip this file"** → Continue without accessing the file

**Example AskUserQuestion call:**
```json
{
  "questions": [{
    "question": "I need to read \".env\" which may contain sensitive data. Do you approve?",
    "header": "File Access",
    "options": [
      { "label": "Yes, approve access", "description": "Allow reading .env this time" },
      { "label": "No, skip this file", "description": "Continue without accessing this file" }
    ],
    "multiSelect": false
  }]
}
```

**IMPORTANT:** Always ask the user via `AskUserQuestion` first. Never try to work around the privacy block without explicit user approval.

## Python Scripts (Skills)

When running Python scripts from `.claude/skills/`, use the venv Python interpreter:
- **Linux/macOS:** `.claude/skills/.venv/bin/python3 scripts/xxx.py`
- **Windows:** `.claude\skills\.venv\Scripts\python.exe scripts\xxx.py`

This ensures packages installed by `install.sh` (google-genai, pypdf, etc.) are available.

**IMPORTANT:** When scripts of skills failed, don't stop, try to fix them directly.

## [IMPORTANT] Consider Modularization
- If a code file exceeds 200 lines of code, consider modularizing it
- Check existing modules before creating new
- Analyze logical separation boundaries (functions, classes, concerns)
- Use kebab-case naming with long descriptive names, it's fine if the file name is long because this ensures file names are self-documenting for LLM tools (Grep, Glob, Search)
- Write descriptive code comments
- After modularization, continue with main task
- When not to modularize: Markdown files, plain text files, bash scripts, configuration files, environment variables files, etc.

## Documentation Management

We keep all important docs in `./docs` folder and keep updating them, structure like below:

```
./docs
├── project-overview-pdr.md
├── code-standards.md
├── codebase-summary.md
├── design-guidelines.md
├── deployment-guide.md
├── system-architecture.md
└── project-roadmap.md
```

**IMPORTANT:** *MUST READ* and *MUST COMPLY* all *INSTRUCTIONS* in project `./CLAUDE.md`, especially *WORKFLOWS* section is *CRITICALLY IMPORTANT*, this rule is *MANDATORY. NON-NEGOTIABLE. NO EXCEPTIONS. MUST REMEMBER AT ALL TIMES!!!*

## MekongMind Harness Integration

algo-trader integrates with **me-deep-wrapper** (MekongMind Solo Company Orchestrator) for goal-driven development workflow.

### Quick Reference

| Command | Action |
|---------|--------|
| `/mekong goal <text>` | Create/show goal |
| `/mekong status` | Goal + gate + bottleneck |
| `/mekong step <N>` | Execute step N |
| `/mekong solo <dept>` | Run department |
| `/mekong route <cmd>` | Route command to dept |
| `/mekong gates` | Verify gate artifacts |
| `/mekong bottlenecks` | Next bottleneck |
| `/mekong allow <cmd>` | Check command allowed |
| `/mekong artifact <g> <d>` | Record gate evidence |
| `/mekong revenue` | Revenue operations |

### Pre-Work Protocol

1. `/mekong status` — shows active goal, gate, bottleneck
2. `/mekong gates` — ensure current gate has evidence
3. `/mekong allow <command>` — verify command allowed at current gate

### Post-Work Protocol

1. `/mekong artifact <gate> <dept> "<note>"` — record evidence
2. `/mekong gates` — verify gate passes

### Department Routing

| Task | Department | Claude Action |
|------|-----------|---------------|
| Build feature | engineering-factory | `/cook` |
| Code review | quality-compliance | `/review` |
| Deploy | platform-operations | `/ship` |
| Research | market-intelligence | `/research` |

### me-deep-wrapper Paths

- CLI: `me` (shell function → `/Users/macbook/Documents/me-deep-wrapper/bin/me`)
- Repo: `/Users/macbook/Documents/me-deep-wrapper/`
- State: `state/goal-*.md`
- SOPs: `sops/departments/`

See `.claude/skills/mekong-harness/SKILL.md` for full skill documentation.

## Harness: algo-trader mekong integration

**Goal:** Bridge algo-trader with me-deep-wrapper (MekongMind Solo Company Orchestrator) for goal-driven development workflow. Route commands, manage goal state, and coordinate 10 domain-specific agents through department SOP gates.

**Trigger:** Harness operations → use `mekong-harness` skill. Simple questions about goal status → direct `me` CLI. Agent/skill management → use `harness` skill from me-deep-wrapper.

**History:**

| Date | Change | Target | Reason |
|------|--------|---------|--------|
| 2026-06-08 | Initial harness build | All | Bootstrap --auto --parallel |

## Production Deployment

**DO NOT** deploy to production without:
- [ ] All scaling phases complete (1-11)
- [ ] Integration tests passing (`npx vitest run tests/integration`)
- [ ] Load test 12k RPS validated (see `scripts/load-test-sharding.ts`)
- [ ] ME IDEA PSF gate approved (`/mekong gates`)
- [ ] On-call engineer notified

### Deployment Commands

```bash
# 1. Final integration check
node scripts/final-integration-check.js

# 2. Deploy regions sequentially
./scripts/deploy-region.sh us-east
./scripts/deploy-region.sh eu-central
./scripts/deploy-region.sh ap-southeast

# 3. Verify multi-region health
./scripts/verify-multi-region.sh

# 4. Post-deployment smoke tests
curl https://algo-trader.workers.dev/api/health
curl https://us-east.algo-trader.workers.dev/api/v1/shard/ring | jq
```

### Rollback (L1 Kill Switch)

```bash
# Disable multi-region routing
curl -X POST https://algo-trader.workers.dev/api/admin/rollback/kill/MULTI_REGION \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Disable sharding
curl -X POST https://algo-trader.workers.dev/api/admin/rollback/kill/SHARDING \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

### Post-Deployment

1. Monitor Grafana dashboards for 2 hours
2. Verify SLA: p95 <100ms, error rate <1%, memory <115MB
3. Update goal state: `/mekong artifact scale-ready platform-operations "Production deployed"`
4. Document any incidents in post-mortem

### References

- Production Rollout Plan: `docs/production-rollout-plan.md`
- Load Test Scripts: `scripts/load-test-*.ts`
- CI/CD Workflow: `.github/workflows/ci.yml`
- Runbook Index: `docs/runbook-index.md`