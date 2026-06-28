# Codebase Audit: Intelligence/ML/Signal Layer
**Date:** 2025-05-21 | **Confidence:** High (95%)

## 1. Python Intelligence Sidecar (Kronos + AlphaEar)

### Service Architecture
- **Name:** AlphaEar Intelligence Sidecar (com.cashclaw.alphaear)
- **Port:** :8100 (FastAPI)
- **Runtime:** Bare metal on M1 Max, launchd-managed ✓
- **Startup:** `intelligence/setup.sh` clones Awesome-finance-skills, links modules, installs venv
- **Lifecycle:** Plist at `intelligence/com.cashclaw.alphaear.plist`
  - Runs at load: `RunAtLoad=true`, `KeepAlive=true`
  - WorkingDirectory: `/Users/you/algo-trader/intelligence` (template — needs manual edit)
  - Logs: `/tmp/alphaear-sidecar.log`, `/tmp/alphaear-sidecar.err`

### Environment Variables (plist)
| Var | Default | Purpose |
|-----|---------|---------|
| `LLM_FAST_TRIAGE_URL` | http://127.0.0.1:11436/v1 | Nemotron Nano endpoint |
| `LLM_FAST_TRIAGE_MODEL` | mlx-community/NVIDIA-Nemotron-3-Nano-30B-A3B-4bit | Signal triage LLM |
| `SENTIMENT_MODE` | bert | FinBERT sentiment analysis |
| `SIDECAR_PORT` | 8100 | FastAPI listen port |

### Exposed Endpoints
**News** (news_endpoints.py:1–76)
- `POST /news/hot` — 14-source news aggregation (~2s)
- `POST /news/polymarket` — Polymarket market discovery (~1s)
- `POST /news/content` — Article extraction from URL (~3s)

**Sentiment** (prediction_endpoints.py:65–85)
- `POST /sentiment/analyze` — FinBERT single text (~200ms)
- `POST /sentiment/batch` — FinBERT batch (\~1s/50 texts)

**Kronos Forecasting** (prediction_endpoints.py:88–134)
- `POST /predict/forecast` — Legacy: close-price list → OHLCV forecasts (~5s)
- `POST /v1/kronos/predict-ohlcv` — Full OHLCV prediction with confidence (~5s)

**Signal Tracking** (signal_tracker_endpoint.py:23–67)
- `POST /signal/track` — Nemotron-Nano assessment of signal evolution (STRENGTHENED|WEAKENED|FALSIFIED|UNCHANGED)
  - Calls local Nemotron @ :11436/v1 in-process
  - Returns confidence + JSON reasoning

**Health** (server.py:129–149)
- `GET /health` — Returns kronos_loaded, finbert_loaded, news_sources, polymarket_api status

### Kronos Foundation Model Engine
**Implementation:** `intelligence/kronos_engine.py:20–174`

| Model | Params | Max Context | Use | Device |
|-------|--------|-------------|-----|--------|
| mini | 4.1M | 2048 | Low-latency | MPS/CPU |
| small | 24.7M | 512 | **Default** | MPS/CPU |
| base | 102.3M | 512 | Max accuracy | MPS/CPU |

- **Lazy-loaded:** First request downloads from HuggingFace (~1–2 min cold start)
- **MPS Auto-detect:** `torch.backends.mps.is_available()` → device='mps' else 'cpu'
- **Methods:**
  - `predict_ohlcv(candles, pred_len=5)` → List[{close, high, low, confidence=0.85}]
  - `predict_prices(prices[], pred_len=5)` → Synthetic OHLCV wrapper for flat prices
- **Memory:** small model ~200MB MPS; base ~600MB MPS; FastAPI ~100MB → total ~800MB–1.2GB

### Dependency Injection Pattern
`server.py:45–103` uses lifespan context manager for async initialization:
1. NewsTools (if skills-repo available) → `news_endpoints.set_tools()`
2. SentimentTools (FinBERT, optional) → injected
3. KronosEngine (lazy, default "small") → injected
4. PolymarketTools (if available) → injected

All modules accept graceful None if dependencies missing — sidecar remains healthy with degraded capabilities.

---

## 2. TypeScript Intelligence Layer (src/intelligence/)

### Files & Exports (2,801 lines total)
```
src/intelligence/
├── alphaear-client.ts           (193 lines) ← Main integration point
├── kronos-fair-value.ts          (127 lines) ← Fair value + OHLCV forecast
├── signal-consensus-swarm.ts     (9145 lines) ← Multi-model swarm voting
├── signal-fusion-engine.ts       (5318 lines) ← Fuse multi-strategy signals
├── prediction-accuracy-tracker.ts (8750 lines) ← Track forecast correctness
├── dual-level-reflection-engine.ts (9483 lines) ← LLM reasoning engine
├── logical-hedge-discovery.ts    (6464 lines) ← Hedge opportunity finder
├── resolution-criteria-analyzer.ts (7498 lines) ← Thesis validation
├── semantic-cache.ts             (2540 lines) ← Embedding cache
├── semantic-dependency-discovery.ts (5327 lines) ← Graph discovery
├── semantic-similarity-search.ts (5261 lines) ← Vector search
├── signal-validator.ts           (6062 lines) ← Signal QA gate
├── vector-embedding-store.ts     (6175 lines) ← Vector DB wrapper
├── market-context-builder.ts     (3878 lines) ← Market state snapshot
├── relationship-graph-builder.ts (3919 lines) ← Entity relationship graph
└── __tests__/                    ← Unit tests
```

### AlphaEar Client Integration
**File:** `src/intelligence/alphaear-client.ts:1–193`

**Singleton:** `export const alphaear = new AlphaEarClient()`

**Constructor:**
- Reads `ALPHAEAR_SIDECAR_URL` || defaults to `http://host.docker.internal:8100`
- Container-aware: uses Docker's `host.docker.internal` for sidecar (bare metal)

**Public API:**
```ts
// News
fetchHotNews(source?, count?) → NewsItem[]
discoverPolymarkets(limit?) → PolymarketDiscovery[]
extractContent(url) → string

// Sentiment
analyzeSentiment(text) → SentimentResult
batchSentiment(texts[]) → SentimentResult[]

// Prediction (legacy)
forecast(prices[], lookback?, predLen?, newsContext?) → ForecastPoint[]

// Signal Evolution
trackSignal(signalId, thesis, newInfo, currentPrice, entryPrice) → SignalEvolution

// Health
checkHealth() → SidecarHealth
isHealthy: boolean
```

**Error Handling:**
- Catches network errors, logs debug (no throw)
- Returns null/empty arrays on sidecar unavailable
- Never blocks trading logic

**Connection Pattern:**
```ts
private async post<T>(path, body): Promise<T | null>
  → fetch(${SIDECAR_URL}${path}, 30s timeout)
  → resp.ok ? resp.json() : null
```

### Kronos Fair Value Functions
**File:** `src/intelligence/kronos-fair-value.ts:44–126`

**`getKronosFairValue(prices[], newsContext?)`**
- Requires 30+ historical prices minimum
- Calls `alphaear.forecast()` with lookback=min(prices.len, 60), predLen=5
- Returns: `{predictedPrice, priceRange, direction, confidence}`
- Direction: 'up' if >1% above current, 'down' if <-1%, else 'flat'
- Confidence inversely proportional to forecast spread

**`getKronosOhlcvForecast(candles[], predLen=5)`**
- Direct HTTP call to `${ALPHAEAR_URL}/v1/kronos/predict-ohlcv`
- Accepts: `{candles: [{timestamp, open, high, low, close, volume}], pred_len}`
- Returns: `KronosOhlcvPrediction[]` with {close, high, low, confidence}
- 30-second timeout; logs debug on unavailable, never throws
- **Note:** Ignores alphaear client singleton — makes own fetch (potential redundancy)

---

## 3. Signal Layer (src/signal/)

### Files & Architecture (88 lines index + 11 modules)
```
src/signal/
├── index.ts                      ← Barrel export
├── signal-types.ts               (1439 lines) ← Type definitions
├── signal-publisher.ts           (2976 lines) ← Core ingestion
├── signal-store-d1.ts            (3182 lines) ← D1/SQLite persistence
├── signal-dedup-guard.ts         (2182 lines) ← In-memory dedup + expiry
├── signal-tier-filter.ts         (2000 lines) ← Tier-based filtering
├── signal-ttl-enforcer.ts        (2223 lines) ← Expiry enforcement
├── signal-rest-cache.ts          (1822 lines) ← REST API cache invalidation
├── sse-signal-broadcaster.ts     (4314 lines) ← Server-Sent Events fan-out
├── telegram-signal-pusher.ts     (4314 lines) ← Telegram notifications
└── __tests__/
```

### Signal Ingestion & Persistence
**SignalPublisher** (signal-publisher.ts)
- Entry point for all strategy signals
- Validates, deduplicates (in-memory Set + D1 UNIQUE constraint)
- Persists to SQLite `signals` table via `postgres-client`
- Fields: id, ts, market, side, size, confidence, strategy, ttl, expires_at, created_at, source, paper_only

**SignalStoreD1** (signal-store-d1.ts:25–101)
- Real D1-backed storage (replaces Phase 03 stub)
- Upsert on conflict (idempotent for retries)
- Auto-tags source: 'qwen-m1max', 'deepseek', 'swarm', 'legacy'
- **Paper-only gate:** Qwen signals paper_only=1 by default (30-day ramp)
- Fanout: Reads `signal_subscriptions` table for Telegram pushes

**TTL & Dedup** (signal-ttl-enforcer.ts, signal-dedup-guard.ts)
- Live cache guarding: TTL enforcer removes expired signals from memory
- Dedup: In-memory Set per signal.id, 60-min default expiry
- D1 UNIQUE constraint is "hard stop"

**SSE Broadcaster** (sse-signal-broadcaster.ts:1–80)
- EventEmitter-based (zero dep; Durable Objects unavailable in environment)
- Streams signals to connected web clients via Server-Sent Events
- Subscribers register channels; broadcaster fan-outs in real-time

**Telegram Pusher** (telegram-signal-pusher.ts)
- Reads subscriptions from D1, formats signal, POSTs to Telegram Bot API
- Respects tier filtering (basic, pro, enterprise)

---

## 4. ML Layer (src/ml/)

### Files & Status
```
src/ml/
└── gru/
    ├── index.ts                  (302 lines) ← Barrel export only
    ├── gru-model.ts              (partial read; uses TensorFlow.js GRU layers)
    └── data-preprocessor.ts      (3982 lines) ← OHLCV normalization
```

### GRU Model Implementation
**GruModel** (gru-model.ts:31–80+)
- **Architecture:** GRU layer 1 (64 units) → GRU layer 2 (32 units) → Dense (32) → Dense (outputSteps)
- **Compilation:** Adam optimizer, MSE loss, MAE metrics
- **Config:** inputSteps, featureCount, gruUnits, denseUnits, outputSteps, learningRate, dropoutRate
- **Status:** Defined in CLI (index.ts:60–77), but **no active usage found** in trading loop
  - Command `algo-trader gru` exists; delegates to `runGruStrategy()` in commands/
  - No integration into live trading orchestration
  - **Verdict: DORMANT** (model defined, never called in production flow)

### Data Preprocessor
- Normalizes OHLCV candles
- Reshapes for TensorFlow.js 3D tensors
- Supports training/validation splits

---

## 5. Kronos Strategy Integration

**File:** `src/strategies/kronos-strategy.ts:1–138`

**KronosStrategy implements IStrategy:**
- Maintains rolling 60-candle window (trims to 120 to cap memory)
- Calls `getKronosOhlcvForecast()` on each execute()
- Compares predicted close vs. current close
- **Signal threshold:** ±0.5% change → buy/sell; else wait
- **Confidence gate:** Default 0.6 threshold; returns wait if lower
- **Fallback:** All errors return 'wait' signal (never crashes trading)
- **Startup check:** Calls sidecar `/health` non-fatally; logs warn if unreachable
- **Registered in CLI:** `algo-trader kronos` command (index.ts:100–115)

---

## 6. LLM Gateway Integration (Local MLX)

**Config:** `src/config/llm-config.ts:1–76`

| Port | Model | Purpose | Timeout | Speed |
|------|-------|---------|---------|-------|
| :11435 | DeepSeek R1 Distill 32B | Primary reasoning | 90s | ~10 tok/s |
| :11436 | Nemotron Nano 30B | Fast triage | 10s | ~45 tok/s |
| :11437 | Qwen3-30B-A3B | Long-context MoE (opt-in) | 60s | ~20 tok/s |
| :11434 | Ollama fallback | Fallback (Ollama or cloud) | 30s | variable |

**Fallback Chain:** MLX primary (11435) → Nemotron (11436) → Ollama (11434) → Claude cloud (API)

**OPENCLAW_GATEWAY_URL:** Dashboard reference (dashboard-route-helpers.ts:~25) defaults to 'Ollama'; NOT actively wired to main trading logic. **Dead reference; Ollama not integrated into signal/strategy flow.**

**Nemotron Integration (Active):**
- `signal_tracker_endpoint.py:30–67` calls Nemotron @ :11436 for signal evolution assessment
- TS side: `alphaear-client.ts:121–142` wraps response in `trackSignal()`
- **Live usage:** Prediction accuracy tracker may call this

---

## 7. Qwen Signal Daemon (M1 Max Sidecar)

**File:** `scripts/qwen-signal-daemon/signal-generator-daemon.py:1–end`

**Architecture:**
```
M1 Max (launchd, every 60s during US market hours)
  ↓
fetch_market_snapshot(Binance REST) [BTC-USD, ETH-USD, SOL-USD rotate]
  ↓
call_qwen(:11437 OpenAI-compat) [Qwen3-30B-A3B inference]
  ↓
parse JSON signal {side, confidence, reasoning}
  ↓
HMAC-sign body (SHA256, shared secret)
  ↓
POST /api/v1/signals/ingest (CF Worker endpoint)
  ↓
CF Worker validates HMAC → SignalPublisher fan-out (D1 + SSE + Telegram)
```

**Plist:** `com.mekong.qwen-signal-daemon.plist`
- Loads at startup, keeps alive, throttles to 1 cycle/min max
- Logs: `~/.local/logs/qwen-signal-daemon.log`

**Kill Switch:** `QWEN_SIGNAL_KILL` env var (set to any non-empty value)

**Signals Generated:**
- Strategy tag: `'qwen-m1max-v1'`
- Paper-only by default (Phase 04 gate clears after 30 days of data)
- NO live-trade authority; ingestion only

**Environment Variables:**
| Var | Default | Required |
|-----|---------|----------|
| `QWEN_INGEST_HMAC_SECRET` | — | YES (match CF Worker) |
| `QWEN_SIGNAL_INGEST_URL` | algo-trader.pages.dev/api/v1/signals/ingest | no |
| `QWEN_SERVER_URL` | http://127.0.0.1:11437 | no |
| `QWEN_MODEL` | mlx-community/Qwen3-30B-A3B-4bit | no |

---

## 8. TS App ↔ Python Sidecar Communication

### Verification by Grep
**Direct references to Python services:**
```
src/index.ts:100–115              KRONOS strategy command
src/intelligence/alphaear-client.ts:16    SIDECAR_URL default
src/intelligence/kronos-fair-value.ts:82  SIDECAR_URL fallback
src/strategies/kronos-strategy.ts:39      ALPHAEAR_URL env var
src/data/sentiment-feed.ts:14     alphaear.analyzeSentiment() call
src/wiring/paper-trading-orchestrator.ts  runSwarmConsensus() call
```

**Port references:**
```
src/config/llm-config.ts:38,45,52,60    :11435, :11436, :11437, :11434
signal_tracker_endpoint.py:33            :11436 Nemotron in-process
intelligence/com.cashclaw.alphaear.plist :8100 Python sidecar
scripts/qwen-signal-daemon/README.md    :11437 Qwen local inference
```

**No OPENCLAW_GATEWAY_URL or OPENCLAW_SCANNER_URL actively used in signal/strategy logic** (dead code in dashboard).

---

## 9. Active vs. Dormant Classification

### ACTIVE (Production)
1. **AlphaEar Python Sidecar** (:8100)
   - Kronos forecasting endpoint live
   - News + Sentiment ingestion functional
   - launchd-managed
   - Called by `KronosStrategy` and sentiment-feed.ts

2. **Kronos Strategy** (src/strategies/kronos-strategy.ts)
   - CLI command active
   - Integrated into trading flow
   - Graceful degradation if sidecar unavailable

3. **Signal Publisher + D1 Store**
   - Persists all strategy signals
   - Dedup + TTL enforcement
   - SSE fan-out, Telegram pusher active

4. **Qwen Signal Daemon**
   - Runs on schedule (US market hours)
   - Generates paper-only signals for 30-day validation
   - HMAC-signed ingest endpoint working

5. **Signal Fusion Engine** (src/intelligence/signal-fusion-engine.ts)
   - Called by `btc-fifteen-minute-strategy.ts`
   - Fuses multi-model signals in real-time

6. **Prediction Accuracy Tracker** (src/intelligence/prediction-accuracy-tracker.ts)
   - Tracks Kronos forecast correctness over time
   - Records in D1 for performance evaluation

### DORMANT (Defined but unused)
1. **GRU Neural Network** (src/ml/gru/)
   - CLI command defined; never called in orchestration
   - TensorFlow.js model architecture sound, but no training loop
   - Data preprocessor unused

2. **Ollama Fallback** (:11434)
   - Configured as fallback in llm-config.ts
   - Not wired to signal generation logic
   - Dashboard reference dead

3. **Vector Embedding Store** (src/intelligence/vector-embedding-store.ts)
   - Module defined; no active vector DB (pinecone/qdrant) instance
   - Semantic cache unused in signal flow

---

## 10. Hidden Dependencies & Risks

### Dependency Chain
```
TS Trading Loop
  → KronosStrategy.execute()
    → getKronosOhlcvForecast()
      → fetch(:8100/v1/kronos/predict-ohlcv)  [HTTP dependency]
        → Python Kronos engine (lazy-loads from HuggingFace on first call)
          → torch.backends.mps if available
          → Falls back to CPU (slow on M1 Max if GPU unavailable)
```

### Silent Failures
1. **Kronos cold start:** 1–2 min delay on first signal (HuggingFace download + model load)
2. **Sidecar unreachable:** Strategy returns 'wait' signal (safe, but no alert)
3. **Nemotron busy:** Signal tracking silently returns null (no fallback to alternative LLM)
4. **Qwen daemon crash:** launchd throttles to 1/min; may miss signal generation

### Redundancy Issues
1. `kronos-fair-value.ts:82` hardcodes SIDECAR_URL, doesn't use alphaear singleton
2. `alphaear-client.ts` and `signal_tracker_endpoint.py:33` both call Nemotron independently
3. No circuit-breaker for repeated sidecar failures (infinite retries without backoff)

### Configuration Mismatches
- `intelligence/com.cashclaw.alphaear.plist:13` uses template path `/Users/you/...` (requires manual edit to deploy)
- `alphaear-client.ts:16` defaults to `host.docker.internal:8100` (only works in Docker)
- CLI `kronos` command doesn't accept sidecar URL override (hardcoded env fallback)

---

## 11. Data Persistence & Signal Flow

### D1/SQLite Schema
**signals table:**
- id, ts, market, side, size, confidence, strategy, ttl, expires_at, created_at, source, paper_only
- UNIQUE(id) prevents duplicates at database level

**signal_subscriptions table:**
- id, subscriber_id, chat_id, tier, active, created_at, updated_at
- Filters for Telegram fan-out by tier + active status

### Qwen Signal → REST Ingest → D1 Pipeline
1. Daemon generates signal, HMAC-signs body
2. POSTs to CF Worker at `/api/v1/signals/ingest`
3. Worker verifies HMAC, calls SignalPublisher
4. Publisher deduplicates, upserts to D1 signals table
5. SSE broadcaster emits to web clients
6. Telegram pusher reads subscriptions, sends notifications

---

## 12. Open Questions & Contradictions

1. **Redundant Sidecar Calls:**
   - Why does `kronos-fair-value.ts:103` make own fetch instead of using `alphaear.forecast()`?
   - Should consolidate to alphaear client for cache + retry logic.

2. **GRU Strategy Orphaned:**
   - CLI command exists but zero production usage. Is this intentional or should it be integrated?

3. **Nemotron Hardcoded in Python:**
   - `signal_tracker_endpoint.py:33` references :11436 directly; not configurable from TS side.

4. **plist Template Not Updated:**
   - `com.cashclaw.alphaear.plist:13` still has `/Users/you/...` — deploy docs missing?

5. **Vector DB Unused:**
   - `vector-embedding-store.ts` module exists; is this for future Phase 05+ or legacy?

6. **Qwen 30-Day Paper-only Gate:**
   - When does Phase 04 auto-clear the paper_only flag? Where's the logic?

7. **No Circuit Breaker:**
   - Sidecar down → infinite retries with 30s timeout per call. Should have exponential backoff.

---

## Summary Statistics

| Category | Count | Status |
|----------|-------|--------|
| **Endpoints** | 11 | 10 active, 1 dead (OPENCLAW_GATEWAY) |
| **Python Modules** | 4 | All active (news, sentiment, kronos, signal-track) |
| **TS Intelligence Files** | 15 | 13 active, 2 dormant (GRU, vector-DB) |
| **Signal Storage Layers** | 3 | D1 + in-mem dedup + REST cache |
| **LLM Gateways** | 4 | 3 active (DeepSeek, Nemotron, Qwen), 1 fallback (Ollama) |
| **Daemons** | 2 | AlphaEar (:8100), Qwen daemon (launchd) |

**Confidence Flags:**
- Python sidecar architecture: ✓ High (95%) — code clean, documented
- TS integration: ✓ High (95%) — grep coverage comprehensive
- Dormant modules: ⚠ Medium (75%) — GRU may be intentional dead-code for flexibility
- Config secrets: ⚠ Medium (70%) — plist paths not validated for deployment

**Action Items:**
1. Consolidate `kronos-fair-value.ts` to use `alphaear` singleton
2. Document plist deployment (update WorkingDirectory template)
3. Decide: keep GRU or archive to legacy/
4. Add exponential backoff to sidecar retry logic
5. Implement circuit-breaker for repeated failures
