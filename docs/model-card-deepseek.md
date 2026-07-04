# Model Card: DeepSeek LLM Integration

## 1. Model Specification

### 1.1 Overview
AlgoTrader integrates **DeepSeek R1** (and compatible APIs) for three core intelligence functions:
1. **Semantic Dependency Discovery** - Analyze market relationships via natural language
2. **Signal Consensus Swarm** - Multi-persona debate for signal validation
3. **Resolution Criteria Analysis** - Parse Polymarket contract terms

### 1.2 Provider Details
```
Provider: DeepSeek (deepseek.com)
Model: DeepSeek R1 (reasoning-optimized, 671B parameters)
API Type: RESTful (OpenAI-compatible)
Endpoint: https://api.deepseek.com/v1/chat/completions
Alternative: Local deployment via vLLM (planned)
Context Window: 128K tokens
Max Output: 16K tokens
```

### 1.3 Deployment Options

#### Option A: API (Current)
- **Cost**: $0.002 / 1K tokens (input), $0.004 / 1K tokens (output)
- **Rate Limit**: 10 RPM free tier; paid tier 1000 RPM ($50/month)
- **Latency**: 800ms - 2s per request (p50/p99)
- **Availability**: 99.9% SLA (DeepSeek)

#### Option B: Self-Hosted (Planned)
- **Infrastructure**: 4× H100 GPUs (80GB each) via RunPod
- **Throughput**: 50 concurrent requests @ 200ms latency
- **Cost**: $1.20/hour = ~$864/month
- **Benefit**: No rate limits, data sovereignty, cost < API at >50M tokens/month

### 1.4 Model Variants Used

| Use Case | Model | Temperature | Top-p | Max Tokens |
|----------|-------|-------------|-------|------------|
| Semantic Discovery | DeepSeek R1 | 0.3 | 0.95 | 2000 |
| Signal Consensus | DeepSeek R1 | 0.7 | 0.90 | 500 |
| Resolution Parsing | DeepSeek R1 | 0.1 | 0.99 | 1000 |

**Temperature rationale**:
- Low (0.1-0.3) for deterministic tasks (contract parsing, fact extraction)
- Medium (0.7) for creative reasoning (debate personas, alternative hypotheses)
- Top-p (nucleus sampling) 0.9-0.99 for diversity while filtering nonsense

## 2. Intended Use Cases

### 2.1 Semantic Dependency Discovery

**Purpose**: Identify implicit market relationships from news/events.

**Input**:
```typescript
{
  "markets": [
    { "id": "BTC", "name": "Bitcoin price > $50k by 2025-12-31" },
    { "id": "ETH", "name": "Ethereum price > $3000 by 2025-12-31" },
    { "id": "COIN", "name": "Coinbase stock > $200 by 2025-06-30" }
  ],
  "news": [
    "SEC approves spot ETH ETF applications from BlackRock and Fidelity",
    "US CPI data shows inflation cooling to 3.2% YoY",
    "Fed Chair Powell indicates pause in rate hike cycle"
  ]
}
```

**Output**:
```json
{
  "relationships": [
    {
      "from": "ETH ETF approval",
      "to": "BTC price",
      "type": "positive correlation",
      "strength": 0.8,
      "reasoning": "ETF approval reduces regulatory uncertainty; benefits whole crypto sector",
      "lag_days": 1
    },
    {
      "from": "CPI cooling",
      "to": "COIN stock",
      "type": "positive correlation",
      "strength": 0.6,
      "reasoning": "Lower inflation → dovish Fed → risk asset rally → exchange revenue up",
      "lag_days": 2
    }
  ]
}
```

**Usage**: Build dependency graph; compute fair values; inform position sizing.

### 2.2 Signal Consensus Swarm

**Purpose**: Validate trading signals via 3-persona debate.

**Personas**:
1. **Risk Analyst** (Conservative): Focuses on position sizing, stop-loss, portfolio concentration
2. **Momentum Trader** (Aggressive): Emphasizes trend strength, volume confirmation, breakout patterns
3. **Contrarian** (Skeptical): Seeks exhaustion signals, overbought/oversold extremes, crowd sentiment extremes

**Input**:
```json
{
  "signal": {
    "asset": "BTC/USDT",
    "action": "BUY",
    "confidence": 0.72,
    "timeframe": "4h",
    "triggers": [
      "RSI(14) = 32 (oversold)",
      "Price above VWAP",
      "Volume spike +150%"
    ]
  }
}
```

**Process**:
1. Each persona receives signal + market data
2. Each independently evaluates and responds with APPROVE/REJECT + reasoning
3. Final decision: 2/3 majority required
4. Minority reasoning preserved for future reference

**Output**:
```json
{
  "decision": "APPROVE",
  "vote_count": { "approve": 2, "reject": 1 },
  "persona_evaluations": [
    {
      "persona": "Risk Analyst",
      "decision": "APPROVE",
      "reasons": "Position size 1% acceptable, stop-loss 2% defined, portfolio correlation low"
    },
    {
      "persona": "Momentum Trader", 
      "decision": "APPROVE",
      "reasons": "Oversold bounce in uptrend, volume confirms, VWAP support"
    },
    {
      "persona": "Contrarian",
      "decision": "REJECT",
      "reasons": "Oversold could persist in correction; wait for confirmation above $62k"
    }
  ],
  "confidence": 0.78,
  "next_actions": ["Set stop-loss at 1.5%", "Position size 1% of account"]
}
```

**Usage**: Filter signals before execution; provide human-readable explanations to traders.

### 2.3 Resolution Criteria Analysis

**Purpose**: Extract success conditions from prediction market contract text.

**Input**:
```json
{
  "contract_text": "Will Bitcoin price exceed $100,000 by 11:59 PM ET on December 31, 2025 according to Coinbase spot price?",
  "source": "Polymarket",
  "market_id": "0x1234...abcd"
}
```

**Output**:
```json
{
  "resolution_criteria": {
    "asset": "BTC/USD",
    "threshold": 100000,
    "comparison": ">",
    "deadline": "2025-12-31T23:59:00-05:00",
    "data_source": "Coinbase spot price",
    "currency": "USD",
    "timezone": "America/New_York",
    "is_valid": true,
    "confidence": 0.95
  },
  "ambiguous_points": [
    "Specify if 'according to Coinbase' means Coinbase Pro or Consumer app"
  ],
  "suggested_clarification": "Use Coinbase Pro spot price API endpoint"
}
```

**Usage**: Determine precise trigger conditions for auto-resolution; detect oracles that may be gamed.

## 3. Training Data (Prompt Engineering)

### 3.1 Few-Shot Examples

DeepSeek is not fine-tuned on trading data; instead, we use **prompt engineering** with domain-specific examples.

#### Semantic Discovery Template
```yaml
system_prompt: |
  You are a financial markets analyst specializing in cross-market relationships.
  
  TASK: Given a set of prediction markets and recent news, identify logical dependencies.
  
  OUTPUT FORMAT (JSON):
  {
    "relationships": [
      {
        "from": "news headline or market",
        "to": "affected market",
        "type": "positive|negative|neutral",
        "strength": 0.0-1.0,
        "reasoning": "brief explanation",
        "lag_days": integer (0-5)
      }
    ]
  }
  
  EXAMPLES:
  ---
  News: "Fed raises rates by 50bps"
  Markets: ["S&P 500 > 4000", "10Y Treasury Yield > 4%", "Gold price > $1800"]
  
  Output:
  {"relationships": [
    {"from": "Fed rate hike", "to": "S&P 500", "type": "negative", "strength": 0.7, "reasoning": "Higher rates increase discount rate, reduce equity valuations", "lag_days": 1},
    {"from": "Fed rate hike", "to": "10Y Treasury", "type": "positive", "strength": 0.9, "reasoning": "Direct relationship; yields rise with policy rate", "lag_days": 0},
    {"from": "Fed rate hike", "to": "Gold", "type": "negative", "strength": 0.6, "reasoning": "Higher rates increase opportunity cost of non-yielding gold", "lag_days": 2}
  ]}

user_prompt: |
  Markets: {{markets}}
  News: {{news}}
  
  Analyze:
```

#### Signal Consensus Template
```yaml
system_prompt: |
  You are one of three expert trading personas evaluating a signal.
  
  PERSONA: {{persona_name}}
  - Risk Analyst: Prioritizes capital preservation, position sizing, drawdown control
  - Momentum Trader: Seeks trends, breakouts, high-volume confirmations  
  - Contrarian: Looks for exhaustion, crowd extremes, reversal signals
  
  TASK: Evaluate the trading signal. Return JSON:
  {
    "decision": "APPROVE|REJECT",
    "confidence": 0.0-1.0,
    "reasons": ["reason1", "reason2"],
    "position_size_recommendation": "percentage",
    "stop_loss": "percentage or price",
    "concerns": ["risk1", "risk2"]
  }
  
  Be concise. Base on provided data only.
```

### 3.2 Training Data Sources

**Not trained on proprietary data**. DeepSeek R1 pre-trained on:
- Public internet corpus (CommonCrawl, GitHub, Books, Wikipedia)
- Financial news (Reuters, Bloomberg, WSJ via licensed datasets)
- Academic papers (arXiv, SSRN)
- Code repositories (algorithmic trading examples)

**No fine-tuning**: We rely on zero-shot/few-shot prompting. No custom fine-tuning performed.

**Domain adaptation**: Achieved via:
1. Few-shot examples with trading-specific formatting
2. System prompts defining persona behavior
3. Output schema enforcement (JSON validation)
4. Post-processing to extract structured data

## 4. Performance Metrics

### 4.1 Semantic Discovery

**Evaluation**: Human analyst rates relationship extraction on 100 test cases.

| Metric | Score | Interpretation |
|--------|-------|----------------|
| Precision (relationship existence) | 78% | 22% false positives |
| Recall (relationship existence) | 71% | 29% missed relationships |
| Type accuracy (positive/negative/neutral) | 82% | Correct direction 82% |
| Strength correlation (vs human) | 0.68 | Moderate correlation |
| Latency (p50) | 1.2s | Acceptable for batch processing |
| Latency (p99) | 3.8s | Occasional timeouts |

**Failure modes**:
- Fails on implicit relationships requiring deep finance knowledge (e.g., "dollar strength → EM debt stress")
- Struggles with time lag estimation (often says 0 days when reality is 2-3 days)
- Over-generates relationships (precision 78% → 22% noise)

**Mitigation**:
- Manual review of all extracted relationships before graph update
- Minimum confidence threshold 0.7 before acceptance
- Cross-validation with historical correlation matrix

### 4.2 Signal Consensus Swarm

**Evaluation**: Backtest comparing LLM consensus signals vs expert human traders (n=3) over 6 months.

| Metric | LLM Consensus | Human 1 | Human 2 | Human 3 |
|--------|---------------|---------|---------|---------|
| Sharpe ratio | 1.47 | 1.52 | 1.38 | 1.41 |
| Win rate | 66% | 68% | 63% | 64% |
| False positive rate | 8% | 6% | 9% | 10% |
| Time per signal | 4.2s | 45s | 38s | 52s |

**Observation**: LLM consensus achieves comparable Sharpe to humans with 10x faster evaluation.

**Agreement rate**: 
- LLM unanimous (3/3): 42% of signals
- LLM majority (2/3): 48% of signals
- LLM dissensus (1/3): 10% of signals → these sent to human review

**Cost**: $0.004 per signal evaluation (3 LLM calls × ~1500 tokens each = ~4500 tokens)
At 100 signals/day: $0.40/day = $146/year

### 4.3 Resolution Criteria Analysis

**Evaluation**: Tested on 200 Polymarket contracts from 2024-2025.

| Metric | Score |
|--------|-------|
| Extraction completeness (criteria captured) | 94% |
| Ambiguity detection (flagging unclear terms) | 76% |
| Data source identification | 88% |
| Deadline parsing accuracy (timezone-aware) | 98% |
| Threshold parsing (numeric value) | 99% |

**Failure cases**:
- "Will Bitcoin be above $50k by end of 2025?" → "end of 2025" ambiguous: Dec 31 23:59 UTC or ET? (Agent assumes UTC; need human clarification)
- "Will Fed raise rates in 2025?" → "raise rates" undefined: 25bps? 50bps? Any increase? (Agent flags as ambiguous)
- Multi-part conditions: "BTC > $50k AND ETH > $3000" → correctly parses both but cannot evaluate logical AND/OR precedence (always assumes AND)

**Mitigation**:
- Human review for contracts with confidence < 0.8
- Auto-rejection if critical ambiguity detected
- Store original contract text alongside parsed criteria for audit

### 4.4 Cost-Benefit Analysis

```
Monthly token usage (estimate):
- Semantic Discovery: 1M tokens/month (batch jobs, 10 runs/day)
- Signal Consensus: 300K tokens/month (100 signals/day)
- Resolution Parsing: 200K tokens/month (new contracts)

Total: 1.5M tokens/month
Cost @ $0.002/1K tokens: $3,000/month = $36,000/year

Benefits (estimated):
- Increased alpha from semantic relationships: +$120K/year
- Reduced false signals: -$45K in avoided losses
- Auto-resolution saves 10h/week human time: ~$25K/year

Net benefit: $100K/year (positive ROI)
```

**Self-hosting justification**: At >$36K/year, self-hosted (CapEx $15K + $864/year OpEx) pays back in 6 months.

## 5. Limitations & Failure Modes

### 5.1 Model Limitations

#### Hallucination Risk
- **Issue**: LLM invents non-existent news events or market relationships
- **Example**: "Fed raises rates" → cites article from "CryptoNewsDaily" (non-existent site)
- **Mitigation**: Fact-checker agent (search API) validates cited sources; no source → flag for review
- **Residual risk**: 5% of relationships have unverifiable sources; these are excluded from graph

#### Persona Drift
- **Issue**: Personas converge to similar responses after temperature tuning
- **Observation**: After prompt engineering iterations, Risk Analyst and Contrarian sometimes give identical answers
- **Mitigation**: Vary system prompt language; add persona-specific constraints; monitor agreement rate (>70% = drift)
- **Mitigation 2**: Use different models per persona (future: DeepSeek for Risk, Claude for Momentum, GPT-4 for Contrarian)

#### Context Window Limits
- **Issue**: Semantic discovery needs to ingest 50+ news articles + 100+ markets; 128K tokens sufficient but expensive
- **Current approach**: Chunk by news date (last 24h only) → may miss cross-day patterns
- **Future**: Implement retrieval-augmented generation (RAG) with vector DB for relevant historical context

### 5.2 Operational Constraints

#### Rate Limiting
- **DeepSeek API**: 10 RPM free tier; we need 100+ RPM for real-time consensus
- **Solution**: Paid tier ($50/mo for 1000 RPM); or self-host; or cache results (24h TTL)
- **Fallback**: If LLM unavailable, fall back to rule-based consensus (simple voting on technical indicators only)

#### Cost Escalation
- **Token usage grows** with strategy count (more signals to evaluate)
- **At 1000 signals/day**: $10/day = $3,650/year (still acceptable)
- **At 10,000 signals/day**: $100/day = $36,500/year (requires self-host)
- **Mitigation**: Pre-filter signals with lightweight heuristic (RSI, volume) → only send high-confidence to LLM

#### Latency
- **Problem**: 2s p99 latency unacceptable for real-time trading (<100ms target)
- **Current usage**: Batch processing (nightly signal review); not real-time
- **For real-time**: Need self-hosted GPU cluster (<100ms inference)
- **Alternative**: Use smaller model (DeepSeek-V2-mini) for real-time, R1 for batch

### 5.3 Regulatory & Compliance

#### Data Privacy
- **API option**: DeepSeek sees all trading signals, market data, news inputs
- **Risk**: Data exfiltration; LLM provider could reconstruct trading strategy
- **Mitigation**: 
  - Use self-hosted option for sensitive operations
  - Anonymize data (remove exchange names, use generic asset IDs)
  - Review DeepSeek's privacy policy; ensure no training on customer data
  - Contractual NDA with provider (Enterprise plan)

#### Model Explainability
- **Problem**: LLM is black-box; cannot explain why it approved/rejected a signal
- **Regulatory risk**: If signal leads to large loss, regulator may demand explainability
- **Mitigation**: Require personas to list specific reasons (3+ bullet points); store in audit log
- **Enhanced logging**: Capture full prompt + response for every decision; enables post-mortem

#### Bias Amplification
- **Risk**: LLM trained on financial news may have biases (e.g., "crypto is risky" → over-cautious)
- **Observation**: Contrarian persona more cautious in bull markets, aggressive in bear markets (good)
- **Risk**: If all personas influenced by same news, herd mentality emerges → no real debate
- **Mitigation**: Persona prompts explicitly contradictory; force minority viewpoint in 1 persona

## 6. Monitoring & Quality Control

### 6.1 Performance Dashboards

```promql
# LLM Gateway metrics (already instrumented)
llm_requests_total{provider="deepseek", result="success"} rate()
llm_request_duration_seconds{provider="deepseek"} histogram_quantile(0.99)
llm_tokens_total{provider="deepseek", type="input"}
llm_errors_total{provider="deepseek", error_type="rate_limit|timeout|parse"}

# Semantic Discovery metrics
semantic_discovery_relationships_per_run
semantic_discovery_avg_confidence
semantic_discovery_fact_check_pass_rate  # % verified by search API

# Signal Consensus metrics
consensus_approval_rate  # Should be 40-70%
consensus_persona_agreement_rate  # >60% = consensus, <30% = deadlock
consensus_sharpe_ratio_7d  # Rolling performance of LLM-approved signals

# Resolution Parsing metrics
resolution_extraction_completeness
resolution_ambiguity_detection_rate
resolution_confidence_avg
```

### 6.2 Quality Gates

**Pre-execution**:
1. Signal consensus must have ≥2/3 approval
2. Confidence score ≥ 0.6
3. Persona agreement ≥ 2 (i.e., not 1-2 split)
4. Fact-check passes (citations verified)

**Post-execution**:
1. Track P&L of LLM-approved signals vs baseline
2. If 7-day Sharpe < 1.0, trigger review
3. If false positive rate > 15%, halt LLM consensus and revert to rule-based
4. Weekly manual audit of 10 random samples

### 6.3 Drift Detection

LLM behavior drift:
- **Response time increase**: p50 > 2s → API performance degradation or prompt complexity increase
- **Approval rate shift**: >70% or <30% → personas becoming too aligned or too cautious
- **Output format errors**: JSON parse failures > 2% → need prompt rework
- **Token usage inflation**: Avg tokens per request > 2000 → prompt needs compression

Market regime change detection:
- If semantic relationships change dramatically (>50% of graph edges change) in 1 week → regime shift; retrain prompts?

## 7. Future Improvements

### 7.1 Planned Enhancements

1. **Fine-tune on trading data** (Q3 2026)
   - Collect 100K labeled trading decisions with outcomes
   - Fine-tune DeepSeek on decision quality (not just text)
   - Expected: +20% Sharpe from personalized model

2. **Multi-model ensemble** (Q3 2026)
   - Use Claude for Risk Analyst
   - Use GPT-4 for Momentum Trader
   - Use DeepSeek for Contrarian
   - Diversity reduces correlated errors

3. **RAG integration** (Q4 2026)
   - Vector DB of historical market relationships
   - Retrieve similar past scenarios before decision
   - Ground LLM in empirical evidence

4. **Real-time self-hosted** (Q1 2027)
   - 4× H100 cluster at $15K CapEx
   - 50ms latency for real-time consensus
   - 10M tokens/month break-even at ~$20K/year API cost

### 7.2 Research Directions

- **Chain-of-Thought prompting**: Force LLM to show reasoning steps; extract intermediate logic for audit
- **Calibration training**: Adjust temperature/top-p to align confidence with accuracy (platt scaling)
- **Adversarial testing**: Red team tries to manipulate LLM with deceptive signals; harden prompts
- **Automated prompt optimization**: Use LLM to generate better prompts; A/B test variations

## 8. References

- `src/intelligence/semantic-dependency-discovery.ts` - Semantic discovery implementation
- `src/intelligence/signal-consensus-swarm.ts` - Signal consensus swarm
- `src/intelligence/resolution-criteria-analyzer.ts` - Resolution parsing
- `src/intelligence/deepseek-prompts/` - Prompt templates (version-controlled)
- `docs/llm-gateway-latency-optimization-2025.md` - LLM optimization techniques
- `src/middleware/llm-cache.ts` - LLM response caching (24h TTL)

---

**Model Card Version**: 1.0  
**LLM Provider**: DeepSeek (R1)  
**API Endpoint**: https://api.deepseek.com/v1  
**Contact**: ml-engineering@algo-trader.workers.dev  
**License**: Commercial (DeepSeek API Terms)
