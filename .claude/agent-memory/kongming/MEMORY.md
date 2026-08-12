# Memory Index

- [algo-trader ship pipeline toolchain gap](project_algo_trader_ship_pipeline.md) — `/mk-bootstrap`/`/ak-ship` don't exist; native PR pipeline only; check for accidental commits on local `main`; `CLAUDE.deploy.md` is canonical (not root CLAUDE.md)
- [algo-trader LLM strategy prod gotchas](project_algo_trader_llm_strategy_prod_gotchas.md) — OmniRoute LAN-only; OMNIROUTE_URL not wired into loadLlmConfig() (crashes on custom values); deriveSource()/Gate 6/staging-D1 gaps; 5x duplicate llm-config.ts
- [algo-trader public repo tracked secret](project_algo_trader_public_repo_tracked_secret.md) — `.claude/settings.json` has AUTH_TOKEN, still git-tracked in PUBLIC repo despite prior audit; gitignore-only fix was incomplete
