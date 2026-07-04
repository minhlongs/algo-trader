---
name: ai-ml-pipeline
description: "AI/ML pipeline for algo-trader. Covers dual-model architecture (Nemotron-3 Nano + DeepSeek R1), consensus voting, signal quality scoring, model warmup, inference pipeline. Triggers: AI, ML, DeepSeek, Nemotron, Qwen, model inference, signal validation, consensus voting, LLM, model warmup, signal quality, prediction accuracy, reflection engine, semantic cache"
---

# AI/ML Pipeline Skill

## Purpose

Guide AI/ML pipeline operations: dual-model inference, consensus voting, signal validation, quality scoring, model warmup, and self-learning for algo-trader.

## Codebase Layout

```
src/intelligence/
  signal-consensus-swarm.ts    # 3-4 persona debate for signal validation
  signal-validator.ts          # DeepSeek-based signal validation
  signal-fusion-engine.ts      # Pure mathematical signal fusion
  dual-level-reflection-engine.ts  # Post-trade reflection (micro + macro)
  prediction-accuracy-tracker.ts   # Track prediction accuracy over time
  semantic-cache.ts            # Redis-backed LLM response cache
  semantic-similarity-search.ts   # Semantic similarity for cache lookup
  vector-embedding-store.ts    # Vector store for embeddings
  relationship-graph-builder.ts   # Knowledge graph from trade history
  market-context-builder.ts    # Market context for LLM prompts
  kronos-fair-value.ts         # Fair value estimation
  alphaear-client.ts           # Alphaear integration
src/config/
  llm-config.ts                # LLM provider configuration
src/lib/
  llm-router.ts                # Multi-model LLM routing (Qwen, DeepSeek, etc.)
src/wiring/
  qwen-signals-loop.ts         # Qwen signal generation loop
  augmented-signal-pipeline.ts # Augmented signal pipeline
src/ml/gru/
  gru-model.ts                 # GRU neural network model
  data-preprocessor.ts         # Data preprocessing for ML
  index.ts                     # Barrel export
```

## Dual-Model Architecture

### DeepSeek R1 (Primary Validator)
- **Role**: Signal validation via reasoning model
- **Integration**: `src/intelligence/signal-validator.ts`
- **Prompt**: Sends `SignalCandidate` to DeepSeek (OpenAI-compatible API)
- **Output**: `ValidationResult { valid, confidence, reasoning, risks }`

### Qwen (Secondary / Optional)
- **Role**: 4th persona in consensus swarm (quantitative-analyst)
- **Integration**: `src/wiring/qwen-signals-loop.ts`
- **Env**: `SWARM_QWEN_ENABLED` (default false)
- **Kill switch**: `src/wiring/qwen-drawdown-monitor.ts` — disables Qwen live trading on drawdown breach

## Consensus Voting (Signal Swarm)

**3-persona default + optional 4th (Qwen):**

| Persona | Role | Focus |
|---------|------|-------|
| risk-analyst | Risk assessment | Drawdown, exposure, tail risk |
| momentum-trader | Momentum validation | Trend strength, entry timing |
| contrarian | Devil's advocate | False positive detection |
| quantitative-analyst (Qwen) | Quant analysis | Statistical edge, model confidence |

**Decision rule:**
- 3-persona: 2/3 majority
- 4-persona: 3/4 majority
- Fail-closed: ≥2 failed LLM calls → reject signal
- Threshold: `SWARM_MIN_CONFIDENCE` (default 0.6)

**Output:** `SwarmConsensus { approved, votes[], consensusConfidence, dissent }`

## Signal Fusion Engine (src/intelligence/signal-fusion-engine.ts)

Pure mathematical fusion (no LLM, high-frequency):
```typescript
fuseSignals(signals: SignalInput[]): FusionResult
// Weighted average → direction (UP/DOWN/NEUTRAL) + confidence
```

**Self-learning weights:**
```
newWeight = 0.9 * oldWeight + 0.1 * (correct ? 1.2 : 0.8)
```
- `EMA_DECAY = 0.9`, `CORRECT_BOOST = 1.2`, `INCORRECT_DECAY = 0.8`
- Bounds: `MIN_WEIGHT = 0.05`, `MAX_WEIGHT = 2.0`

## LLM Router (src/lib/llm-router.ts)

Multi-model routing:
- Routes requests to appropriate LLM provider
- Supports Qwen, DeepSeek, and other OpenAI-compatible APIs
- Config: `src/config/llm-config.ts`

## Semantic Cache (src/intelligence/semantic-cache.ts)

LLM response caching to reduce API calls:
- Redis-backed with local memory fallback
- Semantic similarity search for cache hits
- Reduces LLM costs for repeated signal patterns

## Reflection Engine (src/intelligence/dual-level-reflection-engine.ts)

Post-trade learning:
- **Micro reflection**: Per-trade analysis (entry quality, timing, sizing)
- **Macro reflection**: Strategy-level analysis (win rate, edge decay, regime fit)

## Prediction Accuracy Tracker (src/intelligence/prediction-accuracy-tracker.ts)

- `recordPrediction()`: Log prediction with confidence
- `startResolutionChecker()`: Monitor prediction outcomes
- Tracks calibration: predicted vs actual probability

## GRU Model (src/ml/gru/)

Neural network for price prediction:
- `gru-model.ts`: GRU architecture implementation
- `data-preprocessor.ts`: Feature engineering, normalization
- Used as additional signal input to fusion engine

## Signal Quality Scoring

**Multi-factor quality score:**
1. **Consensus confidence**: swarm agreement level
2. **AI validation**: DeepSeek reasoning quality
3. **Historical accuracy**: past similar signals' win rate
4. **Regime alignment**: signal matches current market regime
5. **Model agreement**: GRU prediction aligns with rule-based signals

## Model Warmup

**On startup:**
1. Load LLM config (`src/config/llm-config.ts`)
2. Initialize semantic cache (`src/intelligence/semantic-cache.ts`)
3. Warm GRU model with recent data (`src/ml/gru/`)
4. Start Qwen signals loop if enabled (`src/wiring/qwen-signals-loop.ts`)

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `SWARM_CONSENSUS_ENABLED` | true | Enable/disable swarm voting |
| `SWARM_MIN_CONFIDENCE` | 0.6 | Minimum confidence threshold |
| `SWARM_QWEN_ENABLED` | false | Enable Qwen 4th persona |
| `DEEPSEEK_API_KEY` | — | DeepSeek API key |
| `QWEN_API_KEY` | — | Qwen API key |

## References

- `references/deepseek-integration.md` — DeepSeek API setup and prompt templates
- `references/qwen-setup.md` — Qwen model configuration and kill switch
- `references/signal-quality-metrics.md` — Quality scoring methodology
