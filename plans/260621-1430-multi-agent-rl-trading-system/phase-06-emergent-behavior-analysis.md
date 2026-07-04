# Phase 6: Emergent Behavior Analysis Tools

**Goal:** Quantify and detect emergent market phenomena: regime changes, flash crashes, herd behavior, liquidity spirals.

## Analysis Modules

### 1. Regime Detector
```python
class RegimeDetector:
    detect_volatility_regime(returns, window=20) -> List[RegimeLabel]
    detect_trend_regime(prices, window=50) -> TrendLabel
    detect_liquidity_regime(order_book_history) -> LiquidityLabel
```
- Use rolling Hurst exponent for trending/mean-reverting
- Volatility: rolling std vs historical median
- Transition probability matrix between regimes

### 2. Liquidity Analyzer
```python
class LiquidityAnalyzer:
    compute_bid_ask_spread_series() -> pd.Series
    compute_market_depth(levels=10) -> pd.Series
    compute_market_resilience(shock_size) -> float
    detect_liquidity_drying_up(window) -> bool
```
- Measure spread widening, depth shrinkage
- Resilience: time to recover after large market order

### 3. Flash Crash Detector
```python
class FlashCrashAnalyzer:
    detect_flash_crash(prices, threshold=-0.05, recovery_time=60) -> FlashCrashEvent
    analyze_pre_crash_conditions() -> Dict[Condition]
    compute_crash_recovery_rate() -> float
```
- Sudden price drop >5% within 1 minute
- Partial/full recovery within N minutes
- Correlate with order book imbalance, large market orders

### 4. Herd Behavior Detector
```python
class HerdBehaviorAnalyzer:
    compute_action_correlation(agent_actions) -> float
    measure_imitation_index() -> float
    detect_synchronized_selling(window) -> bool
```
- Cross-correlation of agent buy/sell signals
- Imitation index: fraction of agents taking same action
- Synchronized selling → potential crash precursor

### 5. Market Quality Metrics
```python
class MarketQualityAnalyzer:
    compute_price_efficiency(returns, fundamentals) -> float  # R² vs random walk
    measure_price_discovery_speed(news_arrival) -> float  # latency to price-in
    calculate_trading_costs_per_unit() -> float  # spread + impact
```

## Emergence Analyzer (Orchestrator)

```python
class EmergenceAnalyzer:
    def __init__(self, simulation_results):
        self.results = simulation_results
    
    def analyze_all(self) -> EmergenceReport:
        report = EmergenceReport()
        report.regimes = RegimeDetector().analyze(self.results)
        report.liquidity = LiquidityAnalyzer().analyze(self.results)
        report.flash_crashes = FlashCrashAnalyzer().detect_all(self.results)
        report.herd_behavior = HerdBehaviorAnalyzer().measure(self.results)
        report.market_quality = MarketQualityAnalyzer().compute(self.results)
        return report
```

## Files to Create

- `rl/analysis/regime_detector.py`
- `rl/analysis/liquidity_analyzer.py`
- `rl/analysis/flash_crash_analyzer.py`
- `rl/analysis/herd_behavior.py`
- `rl/analysis/market_quality.py`
- `rl/analysis/emergence_analyzer.py`
- `rl/analysis/report_generator.py` - JSON/markdown report output
- `rl/tests/test_emergence_analysis.py`

## CLI Commands

```bash
python -m rl.cli.main analyze \
  --results simulation_results.json \
  --output analysis_report.json \
  --format json
```

## Success Criteria

- [ ] Regime detector labels high/low volatility periods with >80% accuracy (vs manual)
- [ ] Liquidity analyzer detects spread widening in 90% of flash crash precursors
- [ ] Herd behavior index > 0.7 during coordinated agent actions (labeled scenarios)
- [ ] Analysis completes <10 seconds for 1M-step simulation
- [ ] Reports include statistical significance (p-values) for detected patterns

## Validation Approach

- **Synthetic scenarios**: Inject known flash crashes, measure detection rate
- **Statistical tests**: Kendall τ for action correlation, ADF for regime stationarity
- **Benchmark**: Compare against random agent baseline (should show no herd behavior)
