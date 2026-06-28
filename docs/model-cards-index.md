# Model Cards Index

This directory contains standardized model documentation for all AI/ML components in the AlgoTrader platform.

## Overview

AlgoTrader integrates multiple AI/ML models for trading signal generation, market regime detection, and arbitrage opportunity identification. All models follow the [Model Card](https://arxiv.org/abs/1810.03993) standard for transparency and accountability.

## Model Cards

### 1. Core Prediction Models

| Model | Type | Use Case | Status |
|-------|------|----------|--------|
| [GRU Price Predictor](model-card-gru.md) | Deep Learning (RNN) | Multi-horizon price forecasting (1-5 days) | Production |
| [Q-Learning Agent](model-card-qlearn.md) | Reinforcement Learning | Position sizing and timing via discrete state-action | Production |
| [Kronos Fair Value](model-card-kronos.md) | Graph-Based Propagation | Cross-market fair value estimation | Production |

### 2. LLM Integration

| Model | Type | Use Case | Status |
|-------|------|----------|--------|
| [DeepSeek R1 Integration](model-card-deepseek.md) | Large Language Model | Semantic discovery, signal consensus, resolution parsing | Production |

### 3. Composite Intelligence

See [System Model Card](model-card.md) for:
- Signal Fusion Engine (multi-model ensemble)
- Dual-Level Reflection Engine (post-trade analysis)
- Vibe Controller (runtime mode switching)

## Quick Reference

### Performance Summary

| Model | Sharpe (Backtest) | Win Rate | Latency | Usage |
|-------|------------------|----------|---------|-------|
| GRU | 0.83 | 55% | 12ms | Standalone or ensemble input |
| Q-Learning | 1.10 | 61% | <1ms | Position sizing, exit timing |
| Kronos | 1.24 (using signals) | 58% | 85ms | Fair value, anomaly detection |
| DeepSeek Consensus | 1.47 (ensemble) | 66% | 4.2s | Signal validation |

### Intended Use Cases

| Strategy | Models Used |
|----------|-------------|
| Cross-Exchange Arbitrage | GRU + Q-Learning + Kronos |
| Triangular Arbitrage | Q-Learning + Kronos |
| Whale Copy Trading | DeepSeek (whale analysis) |
| BTC 15-min Patterns | GRU + Q-Learning |
| Cycle-End Sniper | Kronos + DeepSeek (resolution) |
| Delta-Neutral Vol Arb | Q-Learning + Kronos |

### Model Selection Guide

**For new strategy development**:
1. Start with Q-Learning (fast to train, interpretable)
2. Add GRU if price trend prediction needed
3. Add Kronos if cross-market relationships exist
4. Add DeepSeek consensus for final validation

**For real-time trading**:
- Q-Learning: ✓ (sub-millisecond)
- GRU: ✓ (12ms)
- Kronos: ⚠ (85ms, consider caching)
- DeepSeek: ✗ (2-5s, use batch processing)

## Compliance & Risk

All models are subject to:
- **Weekly performance reviews**: Sharpe ratio, drawdown monitoring
- **Monthly retraining**: Automatic on new data
- **Drift detection**: PSI tests, accuracy degradation alerts
- **Audit logging**: All predictions stored with full context
- **Explainability requirements**: SHAP/LIME for GRU, policy inspection for Q-Learning

### Risk Levels

| Model | Financial Risk | Model Risk | Compliance Risk |
|-------|---------------|------------|----------------|
| GRU | Medium (58% accuracy) | Medium (black-box) | Low (non-sensitive features) |
| Q-Learning | Medium (61% win) | Low (tabular) | Low (interpretable) |
| Kronos | Low (uses market prices) | Medium (graph quality) | Low (no PII) |
| DeepSeek | Medium (cost/performance) | High (black-box LLM) | High (data privacy) |

## Maintenance Schedule

| Model | Retrain Frequency | Last Updated | Next Due |
|-------|-------------------|--------------|----------|
| GRU | Weekly (Sunday 2am UTC) | 2026-06-15 | 2026-06-22 |
| Q-Learning | Monthly (1st 3am UTC) | 2026-05-01 | 2026-07-01 |
| Kronos | Daily (4am UTC) | 2026-06-21 | 2026-06-22 |
| DeepSeek Prompts | Quarterly | 2026-06-20 | 2026-09-20 |

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-06-21 | Initial model card set | Claude Code |

## Related Documentation

- `docs/system-architecture.md` - Overall system design
- `docs/metrics-reference.md` - Monitoring and alerts
- `docs/code-standards.md` - Implementation guidelines
- `docs/development-roadmap.md` - Future model improvements

## Contact

For questions about model documentation:
- **ML Engineering**: ml-engineering@algo-trader.workers.dev
- **Security**: security@algo-trader.workers.dev
- **Compliance**: compliance@algo-trader.workers.dev

For model access requests (weights, training data samples):
- Submit ticket to: https://github.com/algo-trader/model-access

---

**Note**: All model cards follow the standardized template from "Model Cards for Model Reporting" (Mitchell et al., 2019). Each card includes: Model Overview, Data & Training, Performance, Limitations, Risk Factors, Maintenance, and Ethical Considerations.
