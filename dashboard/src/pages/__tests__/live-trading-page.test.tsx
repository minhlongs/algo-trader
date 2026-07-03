// @ts-nocheck
/**
 * Live Trading Page Tests
 * Covers: KPI cards, positions table, trades table, loading state,
 * empty state, error state, and close position button behavior.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ── Hook mocks ──

vi.mock('../../hooks/use-api-client', () => ({
  useApiClient: vi.fn(),
}));

vi.mock('../../hooks/use-admin-controls', () => ({
  useAdminControls: vi.fn(() => ({
    status: {
      trading: true,
      circuitBreaker: { state: 'CLOSED' },
      drawdown: { isHalted: false, currentDrawdown: 0, maxDrawdown: 0.15, peakEquity: 10000, currentEquity: 10500 },
    },
    halt: vi.fn(),
    resume: vi.fn(),
    loading: false,
    error: null,
    refresh: vi.fn(),
  })),
}));

vi.mock('../../stores/trading-store', () => ({
  useTradingStore: vi.fn(),
}));

// ── i18n mock (return keys as-is) ──

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));

// ── Component mocks (avoid Recharts / heavy deps in jsdom) ──

vi.mock('../../components/confirmation-dialog', () => ({
  ConfirmationDialog: ({ open, title, message, confirmLabel, disabled, error, onConfirm, onCancel }) =>
    open ? (
      <div data-testid="confirmation-dialog">
        <h3>{title}</h3>
        <div>{message}</div>
        {error && <p data-testid="confirmation-error">{error}</p>}
        <button data-testid="confirm-btn" disabled={disabled} onClick={onConfirm}>{confirmLabel}</button>
        <button data-testid="cancel-btn" onClick={onCancel}>Cancel</button>
      </div>
    ) : null,
}));

vi.mock('../../components/risk-dashboard-gauges', () => ({
  RiskDashboardGauges: ({ metrics, stale }) => (
    <div data-testid="risk-gauges">
      {stale && <span>STALE</span>}
      {metrics.length > 0 && <span>{metrics.length} metrics</span>}
    </div>
  ),
}));

vi.mock('../../components/trading-kpi-card', () => ({
  TradingKpiCard: ({ label, value, accent, trend, trendLabel, children }) => (
    <div data-testid={`kpi-${label}`}>
      <span>{label}</span>
      <span>{value}</span>
      {trend != null && <span>trend: {trend}</span>}
      {trendLabel && <span>{trendLabel}</span>}
      {children}
    </div>
  ),
}));

vi.mock('../../components/trading-equity-chart', () => ({
  TradingEquityChart: ({ data, loading }) => (
    <div data-testid="equity-chart">
      {loading ? 'Loading chart...' : `${data?.length ?? 0} data points`}
    </div>
  ),
}));

vi.mock('../../components/strategy-allocation-chart', () => ({
  StrategyAllocationChart: ({ data }) => (
    <div data-testid="strategy-allocation">
      {!data || data.length === 0 ? 'No active strategies' : `${data.length} strategies`}
    </div>
  ),
}));

import { useApiClient } from '../../hooks/use-api-client';
import { useAdminControls } from '../../hooks/use-admin-controls';
import { useTradingStore } from '../../stores/trading-store';
import { LiveTradingPage } from '../live-trading-page';

const mockUseApiClient = vi.mocked(useApiClient);
const mockUseAdminControls = vi.mocked(useAdminControls);
const mockUseTradingStore = vi.mocked(useTradingStore);

const DEFAULT_BOT_STATUS = {
  running: true,
  mode: 'live',
  uptime: 3600,
  totalSignals: 100,
  executedTrades: 50,
  rejectedTrades: 2,
  dailyPnl: 150.00,
};

const DEFAULT_POSITIONS = [
  {
    id: 'pos-001',
    symbol: 'BTC/USD',
    buyExchange: 'binance',
    sellExchange: 'binance',
    buyPrice: 65000,
    sellPrice: 65200,
    amount: 0.5,
    pnl: 100,
    status: 'open',
  },
  {
    id: 'pos-002',
    symbol: 'ETH/USD',
    buyExchange: 'coinbase',
    sellExchange: 'coinbase',
    buyPrice: 3200,
    sellPrice: 3180,
    amount: 2.0,
    pnl: -40,
    status: 'open',
  },
];

const DEFAULT_STRATEGIES = [
  { name: 'vwap-sniper', enabled: true, signalCount: 10, lastSignalAt: '2026-07-01T10:00:00Z', mode: 'live' },
];

const DEFAULT_TRADES = [
  {
    id: 'trade-001',
    date: '2026-07-01T10:00:00Z',
    pair: 'BTC/USD',
    side: 'BUY',
    price: 65000,
    amount: 0.5,
    fee: 1.5,
    pnl: 0,
    exchange: 'binance',
  },
];

function storeSelector(overrides = {}) {
  return (selector) =>
    selector({
      positions: DEFAULT_POSITIONS,
      spreads: [],
      strategies: DEFAULT_STRATEGIES,
      trades: [],
      botStatus: DEFAULT_BOT_STATUS,
      ...overrides,
    });
}

function renderPage(overrides = {}) {
  const storeOverrides = overrides.storeOverrides || {};
  mockUseTradingStore.mockImplementation(storeSelector(storeOverrides));

  const fetchImpl = overrides.fetchImpl
    ? overrides.fetchImpl
    : vi.fn().mockImplementation((path) => {
        if (path === '/trades') return Promise.resolve([]);
        return Promise.resolve(null);
      });

  mockUseApiClient.mockReturnValue({ fetchApi: fetchImpl, loading: false });

  if (overrides.adminControls) {
    mockUseAdminControls.mockReturnValue(overrides.adminControls);
  }

  return render(<LiveTradingPage />);
}

describe('LiveTradingPage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-01T12:00:00Z'));
    mockUseApiClient.mockReset();
    mockUseAdminControls.mockReset();
    mockUseTradingStore.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Flush pending promises and advance timers so waitFor can operate. */
  async function flushTimers() {
    await vi.advanceTimersByTimeAsync(1000);
  }

  /* ── Render tests ── */

  it('renders page heading', () => {
    renderPage();
    expect(screen.getByText('liveTrading.title')).toBeTruthy();
  });

  it('renders trading mode badge', () => {
    renderPage();
    expect(screen.getByText('liveTrading.live')).toBeTruthy();
  });

  it('renders KPI card labels', () => {
    renderPage();
    // Regular KpiCard section
    expect(screen.getByText('liveTrading.botStatus')).toBeTruthy();
    expect(screen.getByText('liveTrading.consecutiveLosses')).toBeTruthy();
    // TradingKpiCard section (sparkline cards)
    expect(screen.getByTestId('kpi-liveTrading.dailyPnl')).toBeTruthy();
    expect(screen.getByTestId('kpi-liveTrading.winRate')).toBeTruthy();
    expect(screen.getByTestId('kpi-liveTrading.openPositionsLabel')).toBeTruthy();
  });

  it('renders bot engine stats', () => {
    renderPage();
    expect(screen.getByText('liveTrading.uptime')).toBeTruthy();
    expect(screen.getByText('liveTrading.totalSignals')).toBeTruthy();
    expect(screen.getByText('liveTrading.executedTrades')).toBeTruthy();
    expect(screen.getByText('liveTrading.rejectedTrades')).toBeTruthy();
  });

  it('renders positions heading with count', () => {
    renderPage();
    expect(screen.getByText('liveTrading.openPositions')).toBeTruthy();
  });

  it('renders trades heading', () => {
    renderPage();
    expect(screen.getByText(/liveTrading\.recentTrades/)).toBeTruthy();
  });

  it('renders risk gauges', () => {
    renderPage();
    expect(screen.getByTestId('risk-gauges')).toBeTruthy();
  });

  it('renders equity chart', () => {
    renderPage();
    expect(screen.getByTestId('equity-chart')).toBeTruthy();
  });

  it('renders strategy allocation section', () => {
    renderPage();
    expect(screen.getByTestId('strategy-allocation')).toBeTruthy();
  });

  it('renders position rows from store', () => {
    renderPage();
    expect(screen.getByText('BTC/USD')).toBeTruthy();
    expect(screen.getByText('ETH/USD')).toBeTruthy();
  });

  it('renders Close buttons for each open position', () => {
    renderPage();
    const closeButtons = screen.getAllByRole('button', { name: /liveTrading\.close/i });
    expect(closeButtons).toHaveLength(2);
  });

  it('shows Running status', () => {
    renderPage();
    expect(screen.getByText('liveTrading.running')).toBeTruthy();
  });

  /* ── Empty state tests ── */

  it('shows "No open positions" when positions array is empty', () => {
    renderPage({ storeOverrides: { positions: [] } });
    expect(screen.getByText('liveTrading.noOpenPositions')).toBeTruthy();
  });

  it('shows "No trades yet" when trades array is empty', () => {
    renderPage({ storeOverrides: { trades: [] } });
    expect(screen.getByText('liveTrading.noTradesYet')).toBeTruthy();
  });

  it('shows "No active strategies" when no strategies enabled', () => {
    renderPage({ storeOverrides: { strategies: [] } });
    expect(screen.getByText('No active strategies')).toBeTruthy();
  });

  /* ── Loading state tests ── */

  it('shows Refreshing indicator when admin is loading', () => {
    renderPage({
      adminControls: {
        status: null,
        halt: vi.fn(),
        resume: vi.fn(),
        loading: true,
        error: null,
        refresh: vi.fn(),
      },
    });
    expect(screen.getByText('liveTrading.refreshing')).toBeTruthy();
  });

  /* ── Mode badge tests ── */

  it('shows PAPER badge when mode is dry-run', () => {
    renderPage({ storeOverrides: { botStatus: { ...DEFAULT_BOT_STATUS, mode: 'dry-run' } } });
    expect(screen.getByText('liveTrading.paper')).toBeTruthy();
  });

  it('shows Stopped when bot is not running', () => {
    renderPage({ storeOverrides: { botStatus: { ...DEFAULT_BOT_STATUS, running: false } } });
    expect(screen.getByText('liveTrading.stopped')).toBeTruthy();
  });

  /* ── Close position tests ── */

  it('calls close API when Close button is clicked', async () => {
    const mockFetch = vi.fn().mockImplementation((path) => {
      if (path === '/trades') return Promise.resolve([]);
      return Promise.resolve({ success: true });
    });
    renderPage({ fetchImpl: mockFetch });

    fireEvent.click(screen.getAllByRole('button', { name: /liveTrading\.close/i })[0]);
    await flushTimers();

    expect(mockFetch).toHaveBeenCalledWith('/positions/pos-001/close', {
      method: 'POST',
      body: JSON.stringify({
        symbol: 'BTC/USD',
        exchange: 'binance',
        exitPrice: 65200,
      }),
    });
  });

  it('shows success toast on successful close', async () => {
    const mockFetch = vi.fn().mockImplementation((path) => {
      if (path === '/trades') return Promise.resolve([]);
      return Promise.resolve({ success: true });
    });
    renderPage({ fetchImpl: mockFetch });

    fireEvent.click(screen.getAllByRole('button', { name: /liveTrading\.close/i })[0]);
    await flushTimers();

    expect(screen.getByText('liveTrading.positionClosed')).toBeTruthy();
  });

  it('shows error toast when close API fails', async () => {
    const mockFetch = vi.fn().mockImplementation((path) => {
      if (path === '/trades') return Promise.resolve([]);
      return Promise.resolve({ success: false });
    });
    renderPage({ fetchImpl: mockFetch });

    fireEvent.click(screen.getAllByRole('button', { name: /liveTrading\.close/i })[0]);
    await flushTimers();

    expect(screen.getByText('liveTrading.failedClose')).toBeTruthy();
  });

  it('shows error toast when close API throws', async () => {
    const mockFetch = vi.fn().mockImplementation((path) => {
      if (path === '/trades') return Promise.resolve([]);
      return Promise.reject(new Error('Network error'));
    });
    renderPage({ fetchImpl: mockFetch });

    fireEvent.click(screen.getAllByRole('button', { name: /liveTrading\.close/i })[0]);
    await flushTimers();

    expect(screen.getByText('liveTrading.failedClose')).toBeTruthy();
  });

  it('disables close button while closing', async () => {
    let resolvePromise;
    const mockFetch = vi.fn().mockImplementation((path) => {
      if (path === '/trades') return Promise.resolve([]);
      return new Promise((resolve) => { resolvePromise = resolve; });
    });
    renderPage({ fetchImpl: mockFetch });

    fireEvent.click(screen.getAllByRole('button', { name: /liveTrading\.close/i })[0]);
    expect(screen.getAllByRole('button', { name: /liveTrading\.close/i })[0]).toBeDisabled();
    resolvePromise({ success: true });
  });

  it('removes position row from table after successful close', async () => {
    const mockFetch = vi.fn().mockImplementation((path) => {
      if (path === '/trades') return Promise.resolve([]);
      return Promise.resolve({ success: true });
    });
    renderPage({ fetchImpl: mockFetch });

    expect(screen.getByText('BTC/USD')).toBeTruthy();
    expect(screen.getByText('ETH/USD')).toBeTruthy();

    fireEvent.click(screen.getAllByRole('button', { name: /liveTrading\.close/i })[0]);
    await flushTimers();

    expect(screen.queryByText('BTC/USD')).toBeNull();
    expect(screen.getByText('ETH/USD')).toBeTruthy();
  });

  /* ── Stop bot dialog ── */

  it('shows stop bot button when bot is running', () => {
    renderPage();
    expect(screen.getByText('liveTrading.stopBot')).toBeTruthy();
  });

  it('does not show stop bot button when bot is stopped', () => {
    renderPage({ storeOverrides: { botStatus: { ...DEFAULT_BOT_STATUS, running: false } } });
    expect(screen.queryByText('liveTrading.stopBot')).toBeNull();
  });

  it('shows confirmation dialog when Stop Bot is clicked', () => {
    renderPage();
    fireEvent.click(screen.getByText('liveTrading.stopBot'));
    expect(screen.getByTestId('confirmation-dialog')).toBeTruthy();
  });

  /* ── Auto-refresh controls ── */

  it('shows Pause button by default', () => {
    renderPage();
    expect(screen.getByText('liveTrading.pause')).toBeTruthy();
  });

  it('shows Resume button after clicking Pause', () => {
    renderPage();
    fireEvent.click(screen.getByText('liveTrading.pause'));
    expect(screen.getByText('liveTrading.resume')).toBeTruthy();
  });
});
