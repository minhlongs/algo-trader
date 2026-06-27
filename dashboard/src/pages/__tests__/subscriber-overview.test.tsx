/**
 * Subscriber Overview Page Tests
 * Uses React Testing Library with Vitest.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
<<<<<<< HEAD

// Mock auth store — return a real tenantId
vi.mock('../../stores/auth-store', () => ({
  useAuthStore: vi.fn((selector: (s: { tenantId: string | null }) => unknown) =>
    selector({ tenantId: 'sub-test-001' })
=======
import type { AuthState } from '../../stores/auth-store';

const mockAuthState = (overrides: Partial<AuthState> = {}): AuthState =>
  ({ tenantId: 'sub-test-001', ...overrides }) as AuthState;

vi.mock('../../stores/auth-store', () => ({
  useAuthStore: vi.fn((selector: (s: AuthState) => unknown) =>
    selector(mockAuthState())
>>>>>>> origin/feat/qwen-signal-daemon-phase03
  ),
}));

// Mock the hook
vi.mock('../../hooks/use-subscriber-pnl', () => ({
  useSubscriberPnl: vi.fn(),
}));

import { useSubscriberPnl } from '../../hooks/use-subscriber-pnl';
<<<<<<< HEAD
import { SubscriberOverviewPage } from '../subscriber-overview';

const mockHook = vi.mocked(useSubscriberPnl);
=======
import { useAuthStore } from '../../stores/auth-store';
import { SubscriberOverviewPage } from '../subscriber-overview';

const mockHook = vi.mocked(useSubscriberPnl);
const mockAuth = vi.mocked(useAuthStore);
>>>>>>> origin/feat/qwen-signal-daemon-phase03

const DEFAULT_SUMMARY = {
  subscriberId: 'sub-test-001',
  totalRealizedPnl: 1234.5678,
  tradeCount: 42,
  winCount: 30,
  lossCount: 12,
  winRate: 0.714,
  avgWin: 55.0,
  avgLoss: 22.0,
  bestTrade: 200.0,
  worstTrade: -80.0,
  profitFactor: 2.5,
  blockedDlpCount: 3,
};

const DEFAULT_ACTIVITY = {
  subscriberId: 'sub-test-001',
  activeSignalsCount: 5,
  totalFillsCount: 42,
  blockedDlpCount: 3,
  pendingOrdersCount: 1,
  lastActivityMs: Date.now(),
};

function hookResult(overrides = {}) {
  return {
    summary: DEFAULT_SUMMARY,
    equity: null,
    activity: DEFAULT_ACTIVITY,
    dailyBreakdown: [],
    loading: false,
    error: null,
    refresh: vi.fn(),
    ...overrides,
  };
}

describe('SubscriberOverviewPage', () => {
  beforeEach(() => {
    mockHook.mockReset();
<<<<<<< HEAD
=======
    // Restore default tenantId after any test that mutates useAuthStore
    mockAuth.mockImplementation(
      (selector: (s: AuthState) => unknown) => selector(mockAuthState())
    );
>>>>>>> origin/feat/qwen-signal-daemon-phase03
  });

  it('renders KPI cards when data is loaded', () => {
    mockHook.mockReturnValue(hookResult());
    render(<SubscriberOverviewPage />);

    expect(screen.getByText('Total Realized P&L')).toBeTruthy();
    expect(screen.getByText('Win Rate')).toBeTruthy();
    expect(screen.getByText('Total Trades')).toBeTruthy();
    expect(screen.getByText('Blocked by DLP')).toBeTruthy();
  });

  it('shows tenant ID in header', () => {
    mockHook.mockReturnValue(hookResult());
    render(<SubscriberOverviewPage />);
    expect(screen.getByText('sub-test-001')).toBeTruthy();
  });

  it('shows loading state when loading=true and no summary', () => {
    mockHook.mockReturnValue(hookResult({ summary: null, loading: true }));
    render(<SubscriberOverviewPage />);
    expect(screen.getByText(/Loading subscriber metrics/i)).toBeTruthy();
  });

  it('shows error banner when error is set', () => {
    mockHook.mockReturnValue(hookResult({ error: 'Network failure' }));
    render(<SubscriberOverviewPage />);
    expect(screen.getByText('Network failure')).toBeTruthy();
  });

<<<<<<< HEAD
  it('shows no-identity message when tenantId is null', () => {
    const { useAuthStore } = await import('../../stores/auth-store');
    vi.mocked(useAuthStore).mockImplementation(
      (selector: (s: { tenantId: string | null }) => unknown) => selector({ tenantId: null })
=======
  it('shows no-identity message when tenantId is null', async () => {
    const { useAuthStore } = await import('../../stores/auth-store');
    vi.mocked(useAuthStore).mockImplementation(
      (selector: (s: AuthState) => unknown) => selector(mockAuthState({ tenantId: null }))
>>>>>>> origin/feat/qwen-signal-daemon-phase03
    );
    mockHook.mockReturnValue(hookResult({ summary: null }));
    render(<SubscriberOverviewPage />);
    expect(screen.getByText(/No subscriber identity/i)).toBeTruthy();
  });

  it('displays blocked DLP count with loss accent when > 0', () => {
    mockHook.mockReturnValue(hookResult());
    render(<SubscriberOverviewPage />);
    // 3 blocked shown
    expect(screen.getByText('3')).toBeTruthy();
  });
});
