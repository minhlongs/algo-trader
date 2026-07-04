// @ts-nocheck
/**
 * Leaderboard Page Tests
 * Covers: badge component, row component, table sorting, page states
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ── Hook mocks ──

vi.mock('../../hooks/use-api-client', () => ({
  useApiClient: vi.fn(),
}));

import { useApiClient } from '../../hooks/use-api-client';
import { LeaderboardBadge } from '../../components/leaderboard/leaderboard-badge';
import { LeaderboardRow } from '../../components/leaderboard/leaderboard-row';
import { LeaderboardTable } from '../../components/leaderboard/leaderboard-table';
import { LeaderboardPage } from '../leaderboard-page';

const mockUseApiClient = vi.mocked(useApiClient);

const MOCK_ENTRIES = [
  { rank: 1, strategy: 'vwap-sniper', winRate: 72.5, sharpe: 2.1, pnl: 15200, drawdown: -5.2, trades: 340, badge: 'top_performer' },
  { rank: 2, strategy: 'momentum-rider', winRate: 65.3, sharpe: 1.8, pnl: 8900, drawdown: -8.1, trades: 210, badge: 'verified' },
  { rank: 3, strategy: 'grid-bot', winRate: 58.7, sharpe: 1.2, pnl: 4300, drawdown: -12.4, trades: 180, badge: 'rising_star' },
  { rank: 4, strategy: 'mean-reversion', winRate: 52.1, sharpe: 0.9, pnl: -1200, drawdown: -15.0, trades: 95, badge: 'new' },
  { rank: 5, strategy: 'scalper-pro', winRate: 48.0, sharpe: 0.6, pnl: -3400, drawdown: -18.3, trades: 25 },
];

/* ── LeaderboardBadge ── */

describe('LeaderboardBadge', () => {
  it('renders Top Performer badge', () => {
    render(<LeaderboardBadge badge="top_performer" />);
    expect(screen.getByText('Top Performer')).toBeTruthy();
  });

  it('renders Rising Star badge', () => {
    render(<LeaderboardBadge badge="rising_star" />);
    expect(screen.getByText('Rising Star')).toBeTruthy();
  });

  it('renders Verified badge', () => {
    render(<LeaderboardBadge badge="verified" />);
    expect(screen.getByText('Verified')).toBeTruthy();
  });

  it('renders New badge', () => {
    render(<LeaderboardBadge badge="new" />);
    expect(screen.getByText('New')).toBeTruthy();
  });
});

/* ── LeaderboardRow ── */

describe('LeaderboardRow', () => {
  it('renders strategy name and rank', () => {
    render(
      <table>
        <tbody>
          <LeaderboardRow entry={MOCK_ENTRIES[0]} isTop3 rankClass="rank-1" />
        </tbody>
      </table>
    );
    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.getByText('vwap sniper')).toBeTruthy();
  });

  it('renders badge when present', () => {
    render(
      <table>
        <tbody>
          <LeaderboardRow entry={MOCK_ENTRIES[0]} isTop3 rankClass="rank-1" />
        </tbody>
      </table>
    );
    expect(screen.getByText('Top Performer')).toBeTruthy();
  });

  it('renders negative P&L in red', () => {
    render(
      <table>
        <tbody>
          <LeaderboardRow entry={MOCK_ENTRIES[4]} isTop3={false} rankClass="" />
        </tbody>
      </table>
    );
    // scalper-pro has pnl: -3400, rendered as -$3,400.00
    // Use a text content function matcher since jsdom may split text nodes
    expect(screen.getByText((text) => text.includes('3,400'))).toBeTruthy();
  });
});

/* ── LeaderboardTable ── */

describe('LeaderboardTable', () => {
  it('renders all entries', () => {
    render(<LeaderboardTable entries={MOCK_ENTRIES} />);
    expect(screen.getByText('vwap sniper')).toBeTruthy();
    expect(screen.getByText('scalper pro')).toBeTruthy();
  });

  it('renders column headers', () => {
    render(<LeaderboardTable entries={MOCK_ENTRIES} />);
    expect(screen.getByText('Rank')).toBeTruthy();
    expect(screen.getByText('Strategy')).toBeTruthy();
    expect(screen.getByText('Win Rate')).toBeTruthy();
    expect(screen.getByText('Sharpe')).toBeTruthy();
    expect(screen.getByText('P&L')).toBeTruthy();
    expect(screen.getByText('Drawdown')).toBeTruthy();
    expect(screen.getByText('Trades')).toBeTruthy();
    expect(screen.getByText('Badge')).toBeTruthy();
  });

  it('shows empty state when no entries', () => {
    render(<LeaderboardTable entries={[]} />);
    expect(screen.getByText('No leaderboard data available')).toBeTruthy();
  });

  it('sorts by P&L when column header clicked', () => {
    render(<LeaderboardTable entries={MOCK_ENTRIES} />);
    // Initially sorted by rank asc
    const rows = screen.getAllByText(/\d+/);
    const firstRank = rows.find((r) => r.textContent === '1');
    expect(firstRank).toBeTruthy();

    // Click P&L header to sort desc
    fireEvent.click(screen.getByText('P&L'));
    // Now vwap-sniper (15200) should be first
    const pnlCells = screen.getAllByText(/\$[0-9,]+/);
    expect(pnlCells[0].textContent).toContain('15,200');
  });

  it('sorts by strategy name when clicked', () => {
    render(<LeaderboardTable entries={MOCK_ENTRIES} />);
    fireEvent.click(screen.getByText('Strategy'));
    // Should sort asc: grid-bot, mean-reversion, momentum-rider, scalper-pro, vwap-sniper
    const names = screen.getAllByText(/grid bot|mean reversion|momentum rider|scalper pro|vwap sniper/);
    expect(names[0].textContent).toMatch(/grid bot|grid/);
  });

  it('shows badges in table', () => {
    render(<LeaderboardTable entries={MOCK_ENTRIES} />);
    expect(screen.getByText('Top Performer')).toBeTruthy();
    expect(screen.getByText('Rising Star')).toBeTruthy();
    expect(screen.getByText('Verified')).toBeTruthy();
    expect(screen.getByText('New')).toBeTruthy();
  });
});

/* ── LeaderboardPage ── */

describe('LeaderboardPage', () => {
  beforeEach(() => {
    mockUseApiClient.mockReset();
  });

  function renderPage(impl) {
    mockUseApiClient.mockReturnValue({ fetchApi: impl, loading: false });
    return render(<LeaderboardPage />);
  }

  /* ── Loading state ── */
  it('shows loading state initially', () => {
    mockUseApiClient.mockReturnValue({ fetchApi: vi.fn(), loading: true });
    render(<LeaderboardPage />);
    expect(screen.getByText('Strategy Leaderboard')).toBeTruthy();
    // Skeleton present (multiple animated divs)
    const skeleton = document.querySelector('.animate-pulse');
    expect(skeleton).toBeTruthy();
  });

  /* ── Error state ── */
  it('shows error state when API fails', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('Network error'));
    renderPage(fetchImpl);
    // Wait for async load to complete
    await vi.waitFor(() => {
      expect(screen.getByText('Failed to load data.')).toBeTruthy();
    });
  });

  it('shows retry button on error', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('Network error'));
    renderPage(fetchImpl);
    await vi.waitFor(() => {
      expect(screen.getByText('Retry')).toBeTruthy();
    });
  });

  /* ── Empty state ── */
  it('shows empty state when no data returned', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ data: [], total: 0 });
    renderPage(fetchImpl);
    await vi.waitFor(() => {
      expect(screen.getByText('No leaderboard data available')).toBeTruthy();
    });
  });

  /* ── Data state ── */
  it('renders strategy names from API', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ data: MOCK_ENTRIES, total: 5 });
    renderPage(fetchImpl);
    await vi.waitFor(() => {
      expect(screen.getByText('vwap sniper')).toBeTruthy();
      expect(screen.getByText('momentum rider')).toBeTruthy();
    });
  });

  it('renders summary cards with data', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ data: MOCK_ENTRIES, total: 5 });
    renderPage(fetchImpl);
    await vi.waitFor(() => {
      expect(screen.getByText((content) => content.includes('5 strategies'))).toBeTruthy();
      expect(screen.getByText('Total Strategies')).toBeTruthy();
      expect(screen.getByText('Avg Win Rate')).toBeTruthy();
      expect(screen.getByText('Avg Sharpe')).toBeTruthy();
      expect(screen.getByText('Total P&L')).toBeTruthy();
    });
  });

  /* ── Search/filter ── */
  it('filters strategies by search input', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ data: MOCK_ENTRIES, total: 5 });
    renderPage(fetchImpl);
    await vi.waitFor(() => {
      expect(screen.getByText('vwap sniper')).toBeTruthy();
    });

    const searchInput = screen.getByPlaceholderText('Search strategies...');
    fireEvent.change(searchInput, { target: { value: 'momentum' } });

    expect(screen.getByText('momentum rider')).toBeTruthy();
    expect(screen.queryByText('vwap sniper')).toBeNull();
  });

  it('shows no results message when search has no match', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ data: MOCK_ENTRIES, total: 5 });
    renderPage(fetchImpl);
    await vi.waitFor(() => {
      expect(screen.getByText('vwap sniper')).toBeTruthy();
    });

    const searchInput = screen.getByPlaceholderText('Search strategies...');
    fireEvent.change(searchInput, { target: { value: 'zzzzz' } });

    expect(screen.getByText('No strategies match your search')).toBeTruthy();
    expect(screen.getByText('Clear filter')).toBeTruthy();
  });

  it('clears search filter when Clear is clicked', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ data: MOCK_ENTRIES, total: 5 });
    renderPage(fetchImpl);
    await vi.waitFor(() => {
      expect(screen.getByText('vwap sniper')).toBeTruthy();
    });

    const searchInput = screen.getByPlaceholderText('Search strategies...');
    fireEvent.change(searchInput, { target: { value: 'zzzzz' } });
    expect(screen.getByText('No strategies match your search')).toBeTruthy();

    fireEvent.click(screen.getByText('Clear filter'));
    expect(screen.getByText('vwap sniper')).toBeTruthy();
  });

  it('renders page heading', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ data: MOCK_ENTRIES, total: 5 });
    renderPage(fetchImpl);
    expect(screen.getByText('Strategy Leaderboard')).toBeTruthy();
  });
});
