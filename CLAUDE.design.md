# CLAUDE.design.md — SDLC Phase 2: Design

> **Role:** agent instructions for the *Design* phase.
> **Upstream:** `CLAUDE.specification.md`. **Downstream:** `CLAUDE.code.md`.

---

## Purpose

Translate an approved spec into an architecture the Developer agent can implement without re-deciding shape. No code yet.

## Required inputs

- Approved plan file from Phase 1 (acceptance criteria + risk surface).
- `docs/system-architecture.md` — authoritative layer diagram + current boundaries.
- `docs/code-standards.md` — naming, file-size, modularization rules.
- `docs/database-schema.md` + `migrations/` — current schema.
- Existing modules under `src/` that touch the same layer.

## Required outputs

A phase file (`phase-XX-*.md`) containing:

| Section | Content |
|---------|---------|
| **Overview** | One-paragraph what + why. |
| **Architecture** | Mermaid diagram OR ASCII. Show where new code lives vs existing. |
| **Data flow** | Request → auth → logic → store → response. Include failure paths. |
| **Files to create** | Absolute paths. Each ≤200 LOC target, ≤400 LOC hard (Gate 3). |
| **Files to modify** | Absolute paths. Minimal diff. |
| **Files to delete** | Justify each (backwards-compat audit). |
| **Migration** | New `.sql` file under `migrations/NNN_*.sql`. Idempotent (`IF NOT EXISTS`). |
| **Interfaces** | TS types / function signatures. No bodies. |
| **Prometheus metrics** | Name, type (counter/gauge/histogram), labels, increment conditions. |
| **Admin endpoints** | `X-Admin-Key` auth. Rate limited. List methods + paths. |
| **Rollback posture** | Which tier catches which failure? Kill-switch wiring? |

## Hard constraints for algo-trader

- **Layer boundaries** — respect `src/api/`, `src/strategies/`, `src/wiring/`, `src/signal/`, `src/intelligence/` separation from `system-architecture.md`.
- **File size** — aim ≤200 LOC, ≤400 LOC soft warning from Gate 3. Decompose by concern, not by line count.
- **Naming** — kebab-case filenames, descriptive-long-is-fine (per `.claude/rules/development-rules.md`).
- **Migrations** — forward-only, idempotent, UTC-aware (learned from 017 `date_trunc` STABLE incident).
- **Auth** — every admin mutation endpoint behind `X-Admin-Key` middleware. No cookies.
- **Secrets** — environment vars only, never source. Gate 2 secret-scan will block leaks.
- **Dependencies** — prefer std lib + existing deps. New dep requires: (a) justification in phase file, (b) `pnpm audit` clean under `--audit-level=critical`.
- **No new LLM providers** — use existing `src/lib/llm-router.ts` entry points:
  - `chat()` — default deep-reasoning path (DeepSeek R1 → Ollama → Claude).
  - `fastChat()` — fast scanner path (Nemotron Nano → DeepSeek → Ollama → Claude).
  - `qwenChat()` — M1 Max Qwen path (Qwen3-30B-A3B → DeepSeek → Ollama → Claude).
  Pick by latency/cost profile; do not add a fourth route without spec amendment.

## Diagrams

- Mermaid v11 syntax. Use `/preview --diagram` skill when complexity > 3 components.
- ASCII acceptable for ≤3 components.
- Save under `{plan_dir}/visuals/` not in-source.

## Definition of done

- [ ] Architecture diagram present.
- [ ] Every file path absolute.
- [ ] Every interface has a type signature.
- [ ] Rollback tier assigned to each failure mode.
- [ ] At least one Prometheus metric spec'd.
- [ ] Migration SQL drafted (not yet applied).
- [ ] Security considerations section (auth + input validation).

## Hand-off

Developer agent reads phase file → implements under `CLAUDE.code.md` rules. If design has a gap, come back here; do not patch in code.

## Unresolved questions

At end of each phase file.
