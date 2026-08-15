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

## MekongMind Harness Integration

See `.claude/skills/mekong-harness/SKILL.md` for full documentation (commands, pre-work/post-work protocol, department routing, me-deep-wrapper paths).

**Trigger:** Harness operations → use `mekong-harness` skill. Goal status → direct `me` CLI.

## Production Deployment

**DO NOT** deploy without: scaling phases 1-11 complete, integration tests passing, load test 12k RPS validated, ME IDEA PSF gate approved (`/mekong gates`), on-call engineer notified.

See `scripts/` for deploy commands: `deploy-region.sh`, `final-integration-check.js`, `verify-multi-region.sh`, `apply-migrations.sh`.

### Rollback (L1 Kill Switch)

```bash
# Disable multi-region routing
curl -X POST https://algo-trader.workers.dev/api/admin/rollback/kill/MULTI_REGION \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Disable sharding
curl -X POST https://algo-trader.workers.dev/api/admin/rollback/kill/SHARDING \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```