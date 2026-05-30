import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

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
    metrics: {
      totalPnl: 1540.25,
      dailyPnl: 120.50,
      weeklyPnl: 540.00,
      winRate: 0.68,
      avgTrade: 25.40,
      pnlHistory: [],
    },
    loading: false,
    error: null,
  })),
}));

vi.mock('../../hooks/use-admin-controls', () => ({
  useAdminControls: vi.fn(() => ({
    status: { halted: false, reason: '' },
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

vi.mock('../../components/candlestick-chart', () => ({
  CandlestickChart: () => <div data-testid="candlestick-chart">Mock Candlestick Chart</div>,
}));

vi.mock('../../components/equity-curve-pnl-chart', () => ({
  EquityCurveChart: () => <div data-testid="equity-curve">Mock Equity Curve</div>,
}));

import { DashboardPage } from '../dashboard-page';

describe('DashboardPage', () => {
  it('renders bento grid sections and widgets', () => {
    render(<DashboardPage />);

    expect(screen.getByText('Dashboard')).toBeTruthy();
    expect(screen.getByTestId('candlestick-chart')).toBeTruthy();
    expect(screen.getByText('Strategies & Controls')).toBeTruthy();
    expect(screen.getByText('Emergency Switch')).toBeTruthy();
    expect(screen.getByText('PnL Analytics')).toBeTruthy();
    expect(screen.getByText('Equity Curve')).toBeTruthy();
    expect(screen.getByText('system-log-terminal')).toBeTruthy();
  });
});
