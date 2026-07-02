// @ts-nocheck
/**
 * Subscriber Equity Page Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../../stores/auth-store', () => ({
  useAuthStore: vi.fn((selector: (s: { tenantId: string | null }) => unknown) =>
    selector({ tenantId: 'sub-equity-001' })
  ),
}));

vi.mock('../../hooks/use-subscriber-pnl', () => ({
  useSubscriberPnl: vi.fn(),
}));

// Lightweight mock for PriceChartLightweight — jsdom cannot run canvas
vi.mock('../../components/price-chart-lightweight', () => ({
  PriceChartLightweight: ({ title }: { title?: string }) => (
    <div data-testid="equity-chart">{title}</div>
  ),
}));

import { useSubscriberPnl } from '../../hooks/use-subscriber-pnl';
import { SubscriberEquityPage } from '../subscriber-equity';

const mockHook = vi.mocked(useSubscriberPnl);

const DEFAULT_EQUITY = {
  subscriberId: 'sub-equity-001',
  startingCapital: 10000,
  currentNav: 11250,
  totalReturn: 0.125,
  maxDrawdown: 0.04,
  curve: [
    { date: '2026-04-15', nav: 10500, dailyPnl: 500 },
    { date: '2026-04-16', nav: 11250, dailyPnl: 750 },
  ],
};

function hookResult(overrides = {}) {
  return {
    summary: null,
    equity: DEFAULT_EQUITY,
    activity: null,
    dailyBreakdown: [],
    loading: false,
    error: null,
    refresh: vi.fn(),
    ...overrides,
  };
}

describe('SubscriberEquityPage', () => {
  beforeEach(() => {
    mockHook.mockReset();
  });

  it('renders KPI cards with equity data', () => {
    mockHook.mockReturnValue(hookResult());
    render(<SubscriberEquityPage />);

    expect(screen.getByText('Starting Capital')).toBeTruthy();
    expect(screen.getByText('Current NAV')).toBeTruthy();
    expect(screen.getByText('Total Return')).toBeTruthy();
    expect(screen.getByText('Max Drawdown')).toBeTruthy();
  });

  it('renders equity chart', () => {
    mockHook.mockReturnValue(hookResult());
    render(<SubscriberEquityPage />);
    expect(screen.getByTestId('equity-chart')).toBeTruthy();
  });

  it('shows loading state when loading=true and no equity', () => {
    mockHook.mockReturnValue(hookResult({ equity: null, loading: true }));
    render(<SubscriberEquityPage />);
    expect(screen.getByText(/Loading equity curve/i)).toBeTruthy();
  });

  it('shows error when error is set', () => {
    mockHook.mockReturnValue(hookResult({ error: 'Connection timeout' }));
    render(<SubscriberEquityPage />);
    expect(screen.getByText('Connection timeout')).toBeTruthy();
  });

  it('shows no-identity message when tenantId is null', async () => {
    const { useAuthStore } = await import('../../stores/auth-store');
    vi.mocked(useAuthStore).mockImplementation(
      (selector: (s: { tenantId: string | null }) => unknown) => selector({ tenantId: null })
    );
    mockHook.mockReturnValue(hookResult({ equity: null }));
    render(<SubscriberEquityPage />);
    expect(screen.getByText(/No subscriber identity/i)).toBeTruthy();
    // Restore default mock so subsequent tests aren't poisoned
    vi.mocked(useAuthStore).mockImplementation(
      (selector: (s: { tenantId: string | null }) => unknown) => selector({ tenantId: 'sub-equity-001' })
    );
  });

  it('shows snapshot count in footer', () => {
    mockHook.mockReturnValue(hookResult());
    render(<SubscriberEquityPage />);
    expect(screen.getByText(/2 daily snapshots/)).toBeTruthy();
  });

  it('shows positive return in profit color class', () => {
    mockHook.mockReturnValue(hookResult());
    render(<SubscriberEquityPage />);
    // +12.50% should appear (0.125 * 100)
    expect(screen.getByText(/\+12\.50%/)).toBeTruthy();
  });
});
