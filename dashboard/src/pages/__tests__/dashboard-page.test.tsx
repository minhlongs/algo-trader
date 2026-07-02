import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// ── Hook mocks ──

vi.mock('../../hooks/use-realtime-updates', () => ({
  useRealtimeUpdates: vi.fn(() => ({
    connected: true,
    latency: { avgLatency: 45 },
    error: null,
    reconnectCount: 0,
  })),
}));

vi.mock('../../hooks/use-signals', () => ({
  useSignals: vi.fn(() => ({
    signals: [],
    loading: false,
    error: null,
    refresh: vi.fn(),
  })),
}));

vi.mock('../../hooks/use-pnl-analytics', () => ({
  usePnlAnalytics: vi.fn(() => ({
    metrics: null,
    loading: false,
    error: null,
  })),
}));

vi.mock('../../hooks/use-admin-controls', () => ({
  useAdminControls: vi.fn(() => ({
    status: { trading: true, circuitBreaker: { state: 'CLOSED' } },
    halt: vi.fn(),
    resume: vi.fn(),
    loading: false,
    error: null,
    refresh: vi.fn(),
  })),
}));

vi.mock('../../hooks/use-health-status', () => ({
  useHealthStatus: vi.fn(),
}));

vi.mock('../../hooks/use-websocket-price-feed', () => ({
  useWebSocketPriceFeed: vi.fn(),
}));

vi.mock('../../stores/trading-store', () => ({
  useTradingStore: vi.fn((selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      positions: [],
      spreads: [],
      strategies: [],
      trades: [],
      botStatus: [],
    })
  ),
}));

// ── Child component mocks ──

vi.mock('../../components/price-ticker-strip', () => ({
  PriceTickerStrip: () => <div data-testid="price-ticker">PriceTickerStrip</div>,
}));

vi.mock('../../components/positions-table-sortable', () => ({
  PositionsTableSortable: () => <div data-testid="positions-table">PositionsTable</div>,
}));

vi.mock('../../components/spread-opportunities-card-grid', () => ({
  SpreadOpportunitiesCardGrid: () => <div data-testid="spread-opportunities">SpreadGrid</div>,
}));

vi.mock('../../components/equity-curve-pnl-chart', () => ({
  EquityCurveChart: () => <div data-testid="equity-curve">Mock Equity Curve</div>,
}));

vi.mock('../../components/cache-status', () => ({
  CacheStatus: () => <div data-testid="cache-status">CacheStatus</div>,
}));

vi.mock('../../components/strategy-status-panel', () => ({
  StrategyStatusPanel: () => <div data-testid="strategy-status">StrategyStatus</div>,
}));

vi.mock('../../components/trade-history-feed', () => ({
  TradeHistoryFeed: () => <div data-testid="trade-history">TradeHistory</div>,
}));

vi.mock('../../components/stats-row', () => ({
  StatsRow: () => <div data-testid="stats-row">StatsRow</div>,
}));

vi.mock('../../components/signals-panel', () => ({
  SignalsPanel: () => <div data-testid="signals-panel">SignalsPanel</div>,
}));

vi.mock('../../components/pnl-analytics-chart', () => ({
  PnLAnalyticsChart: () => <div data-testid="pnl-analytics">PnLAnalytics</div>,
}));

vi.mock('../../components/admin-controls', () => ({
  AdminControls: () => <div data-testid="admin-controls">AdminControls</div>,
}));

vi.mock('../../components/skeleton-loaders', () => ({
  DashboardSkeleton: () => <div data-testid="dashboard-skeleton">DashboardSkeleton</div>,
  StatsRowSkeleton: () => <div>StatsRowSkeleton</div>,
  PnlChartSkeleton: () => <div>PnlChartSkeleton</div>,
  AdminControlsSkeleton: () => <div>AdminControlsSkeleton</div>,
  SignalsPanelSkeleton: () => <div>SignalsPanelSkeleton</div>,
  EquityCurveSkeleton: () => <div>EquityCurveSkeleton</div>,
  PriceTickerSkeleton: () => <div>PriceTickerSkeleton</div>,
  SpreadGridSkeleton: () => <div>SpreadGridSkeleton</div>,
  TradeHistorySkeleton: () => <div>TradeHistorySkeleton</div>,
  PositionsTableSkeleton: () => <div>PositionsTableSkeleton</div>,
}));

import { DashboardPage } from '../dashboard-page';

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-01T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the dashboard heading', () => {
    render(<DashboardPage />);

    expect(screen.getByText('Dashboard')).toBeTruthy();
  });

  it('renders all bento grid sections', () => {
    render(<DashboardPage />);

    // Section headers
    expect(screen.getByText('Strategies')).toBeTruthy();
    expect(screen.getByText('P&L Analytics')).toBeTruthy();
    expect(screen.getByText('Admin Controls')).toBeTruthy();
    expect(screen.getByText('Arbitrage Signals')).toBeTruthy();
    expect(screen.getByText('Equity Curve')).toBeTruthy();
    expect(screen.getByText('Live Prices')).toBeTruthy();
    expect(screen.getByText('Spread Opportunities')).toBeTruthy();
    expect(screen.getByText('Trade History')).toBeTruthy();
    expect(screen.getByText('Positions')).toBeTruthy();
  });

  it('renders all widget components', () => {
    render(<DashboardPage />);

    expect(screen.getByTestId('stats-row')).toBeTruthy();
    expect(screen.getByTestId('strategy-status')).toBeTruthy();
    expect(screen.getByTestId('pnl-analytics')).toBeTruthy();
    expect(screen.getByTestId('admin-controls')).toBeTruthy();
    expect(screen.getByTestId('signals-panel')).toBeTruthy();
    expect(screen.getByTestId('equity-curve')).toBeTruthy();
    expect(screen.getByTestId('price-ticker')).toBeTruthy();
    expect(screen.getByTestId('spread-opportunities')).toBeTruthy();
    expect(screen.getByTestId('trade-history')).toBeTruthy();
    expect(screen.getByTestId('positions-table')).toBeTruthy();
    expect(screen.getByTestId('cache-status')).toBeTruthy();
  });

  it('shows connected status in header', () => {
    render(<DashboardPage />);

    expect(screen.getByText(/Connected/)).toBeTruthy();
  });
});
