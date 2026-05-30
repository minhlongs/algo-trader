/**
 * Subscriber Trade History Page Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../../stores/auth-store', () => ({
  useAuthStore: vi.fn((selector: (s: { tenantId: string | null }) => unknown) =>
    selector({ tenantId: 'sub-history-001' })
  ),
}));

vi.mock('../../hooks/use-subscriber-pnl', () => ({
  useSubscriberPnl: vi.fn(),
}));

import { useSubscriberPnl } from '../../hooks/use-subscriber-pnl';
import { SubscriberTradeHistoryPage } from '../subscriber-trade-history';

const mockHook = vi.mocked(useSubscriberPnl);

const SAMPLE_ROWS = [
  { date: '2026-04-14', netPnl: 320.5, tradeCount: 5, winRate: 0.8 },
  { date: '2026-04-15', netPnl: -45.2, tradeCount: 3, winRate: 0.33 },
  { date: '2026-04-16', netPnl: 102.0, tradeCount: 4, winRate: 0.75 },
];

const SAMPLE_SUMMARY = {
  subscriberId: 'sub-history-001',
  totalRealizedPnl: 377.3,
  tradeCount: 12,
  winCount: 9,
  lossCount: 3,
  winRate: 0.75,
  avgWin: 55.0,
  avgLoss: 20.0,
  bestTrade: 200.0,
  worstTrade: -45.0,
  profitFactor: 3.2,
  blockedDlpCount: 0,
};

function hookResult(overrides = {}) {
  return {
    summary: SAMPLE_SUMMARY,
    equity: null,
    activity: null,
    dailyBreakdown: SAMPLE_ROWS,
    loading: false,
    error: null,
    refresh: vi.fn(),
    ...overrides,
  };
}

describe('SubscriberTradeHistoryPage', () => {
  beforeEach(async () => {
    mockHook.mockReset();
    const { useAuthStore } = await import('../../stores/auth-store');
    vi.mocked(useAuthStore).mockImplementation(
      (selector: any) => selector({ tenantId: 'sub-history-001' })
    );
  });

  it('renders Trade History heading', () => {
    mockHook.mockReturnValue(hookResult());
    render(<SubscriberTradeHistoryPage />);
    expect(screen.getByText('Trade History')).toBeTruthy();
  });

  it('shows tenant ID', () => {
    mockHook.mockReturnValue(hookResult());
    render(<SubscriberTradeHistoryPage />);
    expect(screen.getByText('sub-history-001')).toBeTruthy();
  });

  it('renders table with date rows', () => {
    mockHook.mockReturnValue(hookResult());
    render(<SubscriberTradeHistoryPage />);
    expect(screen.getByText('2026-04-14')).toBeTruthy();
    expect(screen.getByText('2026-04-15')).toBeTruthy();
    expect(screen.getByText('2026-04-16')).toBeTruthy();
  });

  it('shows loading state when data is loading', () => {
    mockHook.mockReturnValue(hookResult({ dailyBreakdown: [], loading: true }));
    render(<SubscriberTradeHistoryPage />);
    expect(screen.getByText(/Loading trades/i)).toBeTruthy();
  });

  it('shows error banner on error', () => {
    mockHook.mockReturnValue(hookResult({ error: 'Fetch failed' }));
    render(<SubscriberTradeHistoryPage />);
    expect(screen.getByText('Fetch failed')).toBeTruthy();
  });

  it('shows no-identity message when tenantId is null', async () => {
    const { useAuthStore } = await import('../../stores/auth-store');
    vi.mocked(useAuthStore).mockImplementation(
      (selector: any) => selector({ tenantId: null })
    );
    mockHook.mockReturnValue(hookResult({ dailyBreakdown: [] }));
    render(<SubscriberTradeHistoryPage />);
    expect(screen.getByText(/No subscriber identity/i)).toBeTruthy();
  });

  it('shows lifetime fills count from summary', () => {
    mockHook.mockReturnValue(hookResult());
    render(<SubscriberTradeHistoryPage />);
    expect(screen.getByText(/12 lifetime fills/)).toBeTruthy();
  });

  it('shows period note when data present', () => {
    mockHook.mockReturnValue(hookResult());
    render(<SubscriberTradeHistoryPage />);
    expect(screen.getByText(/Showing last 30 days/)).toBeTruthy();
  });
});
