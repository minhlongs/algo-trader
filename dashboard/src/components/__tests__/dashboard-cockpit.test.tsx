import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DashboardCockpit } from '../dashboard-cockpit';

vi.mock('../candlestick-chart', () => ({
  CandlestickChart: () => <div data-testid="candlestick-chart">Candlestick Chart Mock</div>,
}));

vi.mock('../shard-ring-monitor', () => ({
  ShardRingMonitor: () => <div data-testid="shard-ring-monitor">Shard Ring Monitor Mock</div>,
}));

describe('DashboardCockpit', () => {
  it('renders cockpit telemetry header and sub-components', () => {
    render(<DashboardCockpit />);
    expect(screen.getByText('Cockpit Matrix')).toBeInTheDocument();
    expect(screen.getByText(/12 Shards \(Balanced\)/i)).toBeInTheDocument();
    expect(screen.getByTestId('candlestick-chart')).toBeInTheDocument();
    expect(screen.getByTestId('shard-ring-monitor')).toBeInTheDocument();
  });

  it('renders latency and synchronization stats', () => {
    render(<DashboardCockpit />);
    expect(screen.getByText('12ms')).toBeInTheDocument();
    expect(screen.getByText('99.99%')).toBeInTheDocument();
  });
});
