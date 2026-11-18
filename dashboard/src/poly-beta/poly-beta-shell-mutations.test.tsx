import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PolyBetaShell } from './poly-beta-shell';
import { buildPortfolio, jsonResponse, mockFetch } from './poly-beta-test-fixtures';

const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => {
  vi.unstubAllGlobals();
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('PolyBetaShell mutations and locks', () => {
  it('confirms settlement with payout details and locks duplicate mutations while busy', async () => {
    const view = buildPortfolio({
      engine: {
        state: 'HALTED', haltReason: null, selectedStrategyId: 'toxicity-aware-mm-paper',
        selectedMarketId: 'market-1', lastTickAtMs: null,
      },
      openPositions: [{
        marketId: 'market-1', tokenId: 'yes', marketQuestion: 'Sample', outcome: 'YES',
        shares: 7.5, avgEntryPrice: 0.4, markPrice: 0.5, unrealizedPnlUsd: 0,
      }],
    });
    let settleResolve: (value: Response) => void = () => {};
    const pendingSettle = new Promise<Response>((resolve) => { settleResolve = resolve; });
    const calls = mockFetch(({ url }) => {
      if (url.endsWith('/api/beta/auth/me') || url.endsWith('/api/beta/portfolio')) {
        return jsonResponse(url.endsWith('/auth/me')
          ? { ok: true, user: { email: 'user@example.com', tenantId: 'tenant-1' }, csrfToken: 'csrf' }
          : view);
      }
      if (url.endsWith('/positions/settle')) return pendingSettle;
      return jsonResponse({});
    });

    render(<PolyBetaShell />);
    const drillButton = await screen.findByTestId('simulate-settle-yes-btn');
    expect(drillButton).toHaveTextContent('$7.50');

    fireEvent.click(drillButton);
    fireEvent.click(drillButton);
    expect(window.confirm).toHaveBeenCalledTimes(1);

    const settleCalls = () => calls.filter((c) => c.url.endsWith('/positions/settle'));
    expect(settleCalls()).toHaveLength(1);

    await act(async () => {
      settleResolve(jsonResponse({ ok: true, settledCount: 1, settledDeltaMicro: 750_000 }));
      await pendingSettle;
    });

    await waitFor(() => expect(settleCalls()).toHaveLength(1));
    // The success banner reports the server's realized settled PnL, not a
    // client-side payout estimate.
    const banner = await screen.findByTestId('status-banner');
    expect(banner).toHaveTextContent('PnL Tất toán');
    expect(banner).toHaveTextContent('+$0.7500');
  });

  it('completes an intentional logout on 401 without an expired-session notice', async () => {
    let loggedOut = false;
    mockFetch(({ url }) => {
      if (url.endsWith('/api/beta/auth/logout')) {
        loggedOut = true;
        return jsonResponse({ error: 'Unauthorized' }, 401);
      }
      if (url.endsWith('/api/beta/auth/me')) {
        return loggedOut
          ? jsonResponse({ error: 'Unauthorized' }, 401)
          : jsonResponse({ ok: true, user: { email: 'user@example.com', tenantId: 'tenant-1' }, csrfToken: 'csrf' });
      }
      if (url.endsWith('/api/beta/portfolio')) return jsonResponse(buildPortfolio());
      return jsonResponse({});
    });

    render(<PolyBetaShell />);
    const logout = await screen.findByTestId('logout-btn');
    act(() => { fireEvent.click(logout); });

    await screen.findByTestId('hero-signup-btn');
    expect(screen.queryByTestId('session-expired-notice')).not.toBeInTheDocument();
    expect(screen.queryByTestId('beta-auth-form')).not.toBeInTheDocument();
  });

  it('shows a localized mutation failure and releases the busy lock', async () => {
    mockFetch(({ url }) => {
      if (url.endsWith('/api/beta/orders/o-1/cancel')) {
        return jsonResponse({ error: 'Ledger locked', code: 'LEDGER_LOCKED' }, 409);
      }
      if (url.endsWith('/api/beta/auth/me')) {
        return jsonResponse({ ok: true, user: { email: 'user@example.com', tenantId: 'tenant-1' }, csrfToken: 'csrf' });
      }
      if (url.endsWith('/api/beta/portfolio')) {
        return jsonResponse(buildPortfolio({ pendingOrders: [{
          order_id: 'o-1', market_id: 'market-1', side: 'BUY', outcome: 'YES',
          size_shares_micro: 5_000_000, price_micro: 400_000,
        }] }));
      }
      return jsonResponse({});
    });

    render(<PolyBetaShell />);
    const cancelButtons = await screen.findAllByRole('button', { name: /hủy lệnh/i });
    act(() => { fireEvent.click(cancelButtons[0]); });

    const banner = await screen.findByTestId('status-banner');
    expect(banner).toHaveAttribute('role', 'alert');
    expect(banner).toHaveTextContent('Ledger locked');
    expect(banner).toHaveTextContent('LEDGER_LOCKED');
    // The lock releases, so the action is retryable.
    await waitFor(() => expect(screen.getByRole('button', { name: /hủy lệnh/i })).toBeEnabled());
  });
});
