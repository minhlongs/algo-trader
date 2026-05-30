# Subsystem — Intelligence (LLM + Forecasting + Signals)

**Overview.** Multi-model intelligence stack: Python FastAPI sidecar (AlphaEar :8100) for Kronos time-series forecasts + FinBERT sentiment + news, plus three local MLX/Ollama LLM servers on M1 Max for triage / reasoning / long-context. Signals reach the backend via HMAC-signed HTTP POST.

**Entry points.**
- `intelligence/server.py` — FastAPI :8100 (started by launchd `com.cashclaw.alphaear.plist`, RunAtLoad)
- `src/intelligence/` — TS client to AlphaEar + semantic dependency graph
- `src/signals/` — Signal publisher with TTL, dedup, SSE broadcast, Telegram fan-out
- `src/paper-trading-orchestrator.ts` — Receives Qwen signals; gates by paper-only string match (L39-44)
- `src/kronos-fair-value.ts` — **Separate** Kronos client (bypasses AlphaEar singleton)

**Dependencies.**
- AlphaEar Python: Kronos (mini 4.1M / small 24.7M / base 102.3M params; MPS or CPU), FinBERT for sentiment, news feed parsers
- LLM servers:
  - `:11435` DeepSeek R1 (reasoning)
  - `:11436` Nemotron-3 Nano (fast triage)
  - `:11437` Qwen3-30B (long-context)
  - `:11434` Ollama fallback
- `QWEN_INGEST_HMAC_SECRET` — shared between M1 daemon and backend
- `src/ml/` — Frank-Wolfe optimizer, hyperparameter search

**Runtime flow.**
```
Kronos foundation model (MPS) ──► forecast(horizon) ──► AlphaEar HTTP API
                                                              │
TS strategies / arb modules ──► fetch(AlphaEar :8100) ────────┘
                                                              │
M1 Qwen daemon (offline strategy hunting) ──HMAC-SHA256──► POST /api/signals/ingest
                                                              │
                              signals/publisher ──► dedup + TTL ──► SSE + Telegram fan-out
                                                              │
                              paper-trading-orchestrator ──► string-match "paper-only" gate
                                                              │
                              QWEN kill switches: QWEN_KILL, QWEN_SIGNAL_KILL,
                              QWEN_DRAWDOWN_MAX_PCT=5, QWEN_AUTO_APPROVE_MAX_USD=500
```

**Important files.**
- `intelligence/server.py` — Python sidecar entry
- `intelligence/README.md` (if present) — sidecar setup
- `src/intelligence/semantic-dependency-graph.ts` — code-aware retrieval
- `src/paper-trading-orchestrator.ts:39-44` — fragile string-match gate
- `src/kronos-fair-value.ts` — orphan Kronos consumer (architectural smell)
- `~/Library/LaunchAgents/com.cashclaw.alphaear.plist` — broken template path `/Users/you/`

**Risks.**
1. **Paper-only gate uses string match, not type.** A renamed signal source could bypass the safety net. HIGH.
2. **`com.cashclaw.alphaear.plist` has `/Users/you/` placeholder** — sidecar won't start if unfixed. MEDIUM.
3. **Single M1 Max for LLM stack** — SPOF for all signal generation. MEDIUM.
4. **`kronos-fair-value.ts` bypasses AlphaEar singleton** — two Kronos client paths drift apart. MEDIUM.
5. **GRU TensorFlow.js model is dormant** — code present but not in registry. LOW.
6. **HMAC secret only — no replay/nonce protection on signal ingest.** MEDIUM.

**Missing docs.**
- No matrix mapping LLM port → model → use case.
- No spec for Kronos retraining cadence or model selection logic.
- No documented kill-switch ladder (which env var disables what).

**Confidence: HIGH.**
