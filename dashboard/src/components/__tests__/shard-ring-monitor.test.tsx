import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ShardRingMonitor } from '../shard-ring-monitor';
import { useDashboardStore } from '../../stores/dashboard-store';

vi.mock('../shard-ring-chart', () => ({
  ShardRingChart: () => <div data-testid="shard-ring-chart">Shard Ring Chart Mock</div>,
}));

describe('ShardRingMonitor', () => {
  beforeEach(() => {
    useDashboardStore.setState({
      health: {
        status: 'healthy',
        redis: 'ok',
        postgres: 'ok',
        timestamp: Date.now(),
        uptime: 3600,
        shards: [
          { shardId: 0, status: 'healthy', rps: 120, avgLatencyMs: 8 },
          { shardId: 1, status: 'healthy', rps: 110, avgLatencyMs: 9 },
          { shardId: 2, status: 'degraded', rps: 45, avgLatencyMs: 65 },
          { shardId: 3, status: 'offline', rps: 0, avgLatencyMs: 0 },
        ],
      },
    });
  });

  it('renders title and ring status', () => {
    render(<ShardRingMonitor />);
    expect(screen.getByText(/Shard Health Ring/i)).toBeInTheDocument();
    expect(screen.getByTestId('shard-ring-chart')).toBeInTheDocument();
  });

  it('renders all 12 shard nodes in consistent hash topology', () => {
    const { container } = render(<ShardRingMonitor />);
    // Shard nodes rendered with title attribute
    const shardNodes = container.querySelectorAll('[title^="Shard "]');
    expect(shardNodes.length).toBe(12);
  });
});
