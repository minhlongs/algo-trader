---
name: algo-trader-alpha-mission-dod
description: Original Alpha Discovery mission Definition-of-Done has 12 questions (not 13); full mission text lives in session jsonl 7a2df158
metadata:
  type: project
---

Original mission "Transform Algo-Trader into Alpha Discovery Engine" (~2026-08-16) has **12 Definition-of-Done questions**, not 13 as later task.md copies claim. Verified from the original orchestrate task write in session `/Users/macbook/.claude/projects/-Users-macbook-algo-trader/7a2df158-675c-4168-b40a-abd7de884c6f.jsonl` (tool_use Write to `.orchestrate/latest/task.md`, content embedded).

**Why:** task.md continuations repeated "13 questions" without a source; audits citing "13" will miscount.

**How to apply:** When auditing DoD coverage, map the 12 questions: regime / hypothesis / entry-time info / entry-exit rule / fees+slippage / in-sample / out-of-sample / regime survival / cost-stress survival / feature contribution / win-lose why / PAPER readiness. Mission optimization doctrine: ROBUSTNESS > COMPLEXITY, OUT-OF-SAMPLE EDGE > BACKTEST PERFORMANCE. Related: [[project-algo-trader-ship-pipeline]].
