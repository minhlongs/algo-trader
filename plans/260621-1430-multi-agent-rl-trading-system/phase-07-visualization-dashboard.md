# Phase 7: Visualization & Reporting Dashboard

**Goal:** Create comprehensive visualizations for analyzing multi-agent simulation results and generate automated reports.

## Visualization Components

### 1. Agent Performance Dashboard
- Equity curves overlaid for all agents (Plotly line chart)
- Bar chart: final P&L by agent type
- Box plot: Sharpe ratio distribution per agent category
- Scatter: max DD vs Sharpe (risk-return frontier)
- Histogram: trade counts, position durations

### 2. Order Book Evolution
- Heatmap: price levels (Y) vs time (X), color = volume
- Animation of order book depth over time
- Mid-price line overlaid on heatmap
- Agent order placement markers (colored by agent)

### 3. Market Impact Visualization
- Cumulative volume vs price change (Almgren-Chriss plot)
- Impact decay curve (temporary impact over time)
- Per-agent impact attribution (bar chart)
- Spread evolution during large trades

### 4. Agent Interaction Network
- Correlation matrix heatmap of agent returns
- Network graph: nodes = agents, edges = correlation > 0.7
- Color nodes by type (MM, arb, trend)
- Size nodes by P&L

### 5. Market Quality Over Time
- Rolling spread (bps)
- Rolling depth (top 5 levels sum)
- Volatility (rolling std of returns)
- Flash crash markers on price chart

## Implementation

### Simulation Serializer
```python
class SimulationSerializer:
    def save(sim_results, path):
        # HDF5 or Parquet
        # Store: agent_states, order_book_history, trades, observations, rewards
    def load(path) -> SimulationData:
        # Reconstruct for visualization
```

### Dashboard Generator
```python
class DashboardGenerator:
    def generate_all(data: SimulationData, output_dir: Path):
        self.plot_agent_equity_curves(data)
        self.plot_order_book_heatmap(data)
        self.plot_market_impact(data)
        self.plot_agent_network(data)
        self.plot_market_quality(data)
        self.create_summary_page(output_dir)
```

### Report Generator
- PDF via LaTeX or HTML→PDF (WeasyPrint)
- Include key metrics table, charts, statistical tests
- Executive summary (3-5 bullet points)
- Raw JSON export for further analysis

## Files to Create

- `rl/io/simulation_serializer.py` - HDF5/Parquet I/O
- `rl/visualization/agent_charts.py`
- `rl/visualization/order_book_viz.py`
- `rl/visualization/impact_viz.py`
- `rl/visualization/network_graph.py`
- `rl/visualization/market_quality_viz.py`
- `rl/visualization/sim_dashboard.py` - Main orchestrator
- `rl/reporting/report_generator.py` - PDF/HTML reports
- `scripts/generate_dashboard.py` - CLI entry point
- `rl/tests/test_visualization.py`

## CLI Commands

```bash
# Generate dashboard (HTML + PNG)
python scripts/generate_dashboard.py \
  --input results/simulation.h5 \
  --output reports/dashboard.html

# Generate PDF report
python scripts/generate_report.py \
  --input results/simulation.h5 \
  --output reports/report.pdf \
  --format pdf
```

## Success Criteria

- [ ] Dashboard renders all 5 visualization components automatically
- [ ] Charts are publication-quality (vector graphics, readable labels)
- [ ] Report generation completes <30 seconds for 1M-step simulation
- [ ] Output includes both interactive HTML and static PDF
- [ ] All visualizations handle missing data gracefully

## Technical Stack

- `matplotlib` + `seaborn` for static plots
- `plotly` for interactive charts (optional)
- `h5py` or `pyarrow` for serialization
- `weasyprint` or `reportlab` for PDF
- `jinja2` for HTML templating

## Performance Optimization

- Precompute aggregates (rolling metrics) before plotting
- Downsample for long time series (>10k points)
- Cache intermediate computations (use `functools.lru_cache`)
- Parallel plot generation (5 plots → 5 processes)
