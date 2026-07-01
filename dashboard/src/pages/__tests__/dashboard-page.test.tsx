import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useDashboardStore } from '../../stores/dashboard-store';

vi.mock('../../hooks/use-dashboard-websocket', () => ({
  useDashboardWebSocket: vi.fn(() => ({
    connected: true,
    latency: { avgLatency: 45 },
    error: null,
    reconnectCount: 0,
    reconnect: vi.fn(),
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

vi.mock('../../components/candlestick-chart', () => ({
  CandlestickChart: () => <div data-testid="candlestick-chart">Mock Candlestick Chart</div>,
}));

vi.mock('../../components/equity-curve-pnl-chart', () => ({
  EquityCurveChart: () => <div data-testid="equity-curve">Mock Equity Curve</div>,
}));

import { DashboardPage } from '../dashboard-page';

describe('DashboardPage', () => {
  beforeEach(() => {
    useDashboardStore.setState({
      signals: [],
      lastSignalsUpdate: Date.now(),
      metrics: {
        totalPnl: 1540.25,
        dailyPnl: 120.50,
        weeklyPnl: 540.00,
        monthlyPnl: 2000.00,
        sharpeRatio: 2.1,
        maxDrawdown: 0.05,
        winRate: 0.68,
        avgTrade: 25.40,
        bestTrade: 150.00,
        worstTrade: -50.00,
        pnlHistory: [],
      },
      lastMetricsUpdate: Date.now(),
    });
  });

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
