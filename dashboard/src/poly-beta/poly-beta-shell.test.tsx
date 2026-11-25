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

describe('PolyBetaShell session and screen states', () => {
  it('shows the landing page for an anonymous 401 without an expired-session notice', async () => {
    mockFetch(() => jsonResponse({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, 401));
    render(<PolyBetaShell />);
    await screen.findByTestId('hero-signup-btn');
    expect(screen.queryByTestId('session-expired-notice')).not.toBeInTheDocument();
  });

  it('renders a retryable error banner when the initial screen check times out', async () => {
    mockFetch(() => jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new DOMException('Aborted', 'AbortError');
    }));
    render(<PolyBetaShell />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/did not respond in time/i);
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('sends an expired notice back to login on an authenticated 401', async () => {
    let authed = true;
    mockFetch(({ url }) => {
      if (url.endsWith('/api/beta/auth/me')) {
        return authed
          ? jsonResponse({ ok: true, user: { email: 'user@example.com', tenantId: 'tenant-1' }, csrfToken: 'csrf' })
          : jsonResponse({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, 401);
      }
      if (url.endsWith('/api/beta/portfolio')) {
        return authed ? jsonResponse(buildPortfolio({ pendingOrders: [{
          order_id: 'o-1', market_id: 'market-1', side: 'BUY', outcome: 'YES',
          size_shares_micro: 5_000_000, price_micro: 400_000,
        }] })) : jsonResponse({ error: 'Unauthorized' }, 401);
      }
      if (url.endsWith('/api/beta/orders/o-1/cancel')) {
        authed = false;
        return jsonResponse({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, 401);
      }
      return jsonResponse({});
    });

    render(<PolyBetaShell />);
    await screen.findByTestId('system-health-panel');

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    });

    await waitFor(() => expect(screen.getByTestId('session-expired-notice')).toBeInTheDocument());
    expect(screen.getByTestId('beta-auth-form')).toBeInTheDocument();
  });

  it('ignores a stale session check that resolves after sign-in', async () => {
    let meCalls = 0;
    let releaseRetry: (value: Response) => void = () => {};
    const pendingRetry = new Promise<Response>((resolve) => { releaseRetry = resolve; });
    mockFetch(({ url }) => {
      if (url.endsWith('/api/beta/auth/me')) {
        meCalls += 1;
        return meCalls === 1
          ? jsonResponse({ error: 'Gateway down', code: 'UPSTREAM_ERROR' }, 503)
          : pendingRetry;
      }
      if (url.endsWith('/api/beta/auth/login')) {
        return jsonResponse({
          ok: true, csrfToken: 'csrf-new',
          user: { email: 'user@example.com', tenantId: 'tenant-1' },
        });
      }
      if (url.endsWith('/api/beta/portfolio')) return jsonResponse(buildPortfolio());
      return jsonResponse({});
    });

    render(<PolyBetaShell />);
    // A failed initial check keeps the landing page usable.
    fireEvent.click(await screen.findByRole('button', { name: /retry/i }));
    fireEvent.click(screen.getByTestId('nav-login-btn'));
    fireEvent.change(screen.getByTestId('auth-email-input'), { target: { value: 'user@example.com' } });
    fireEvent.change(screen.getByTestId('auth-password-input'), { target: { value: 'correct horse battery' } });
    fireEvent.click(screen.getByTestId('auth-submit-btn'));

    // The signed-in dashboard now owns the session.
    await screen.findByTestId('system-health-panel');

    // The retry from the old anonymous screen answers 401 late; it must not
    // bounce the freshly signed-in user.
    await act(async () => {
      releaseRetry(jsonResponse({ error: 'Unauthorized' }, 401));
      await pendingRetry;
    });

    expect(screen.getByTestId('system-health-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('session-expired-notice')).not.toBeInTheDocument();
  });
});

describe('PolyBetaShell dashboard content', () => {
  it('renders selected strategy assumptions and real fills', async () => {
    mockFetch(({ url }) => url.endsWith('/api/beta/portfolio')
      ? jsonResponse(buildPortfolio({
          fills: [{
            fill_id: 'fill-1', order_id: 'order-1', side: 'SELL', outcome: 'YES',
            market_question: 'Will the sample resolve YES?', price_micro: 500_000, shares_micro: 2_000_000,
            notional_micro: 1_000_000, fee_micro: 1_000, realized_delta_micro: -1_000,
            settled_delta_micro: 0, created_at_ms: 1_700_000_000_000,
          }],
        }))
      : jsonResponse({ ok: true, user: { email: 'user@example.com', tenantId: 'tenant-1' }, csrfToken: 'csrf' }));

    render(<PolyBetaShell />);
    expect(await screen.findByText('Taker fee model')).toBeInTheDocument();
    expect(screen.getByText('No queue')).toBeInTheDocument();
    const fillRow = await screen.findByTestId('fill-row');
    expect(fillRow).toHaveTextContent('2.00 @ $0.500');
    expect(fillRow).toHaveTextContent('2023-11-14T22:13:20.000Z');
  });

  it('keeps deletion in the danger zone and outside the header', async () => {
    mockFetch(({ url }) => url.endsWith('/api/beta/portfolio')
      ? jsonResponse(buildPortfolio())
      : jsonResponse({ ok: true, user: { email: 'user@example.com', tenantId: 'tenant-1' }, csrfToken: 'csrf' }));

    render(<PolyBetaShell />);
    const dangerZone = await screen.findByTestId('account-danger-zone');
    expect(dangerZone).toContainElement(screen.getByTestId('delete-account-btn'));
    // Logout stays reachable in the header, but it is a separate control group.
    expect(screen.getByTestId('logout-btn')).toBeInTheDocument();
    expect(dangerZone).not.toContainElement(screen.getByTestId('logout-btn'));
  });

  it('disables manual trading starters and the market picker when the feed is empty', async () => {
    mockFetch(({ url }) => {
      if (url.endsWith('/api/beta/auth/me')) {
        return jsonResponse({ ok: true, user: { email: 'user@example.com', tenantId: 'tenant-1' }, csrfToken: 'csrf' });
      }
      if (url.endsWith('/api/beta/portfolio')) return jsonResponse(buildPortfolio({ markets: [] }));
      return jsonResponse({});
    });

    render(<PolyBetaShell />);
    expect(await screen.findByText(/Market feed is empty or unhealthy/i)).toBeInTheDocument();
    expect(screen.getByTestId('buy-yes-btn')).toBeDisabled();
    expect(screen.getByTestId('strategy-start-btn')).toBeDisabled();
    expect(screen.getByTestId('market-select')).toBeDisabled();
  });

  it('Case 24: renders Paper Beta UI cleanly in maintenance mode without crashing or making external calls', async () => {
    const requestedUrls: string[] = [];
    mockFetch(({ url }) => {
      requestedUrls.push(url);
      if (url.endsWith('/api/beta/auth/me')) {
        return jsonResponse(
          { error: 'Paper Beta is temporarily paused for maintenance.', code: 'MAINTENANCE_MODE' },
          503,
        );
      }
      return jsonResponse({ error: 'Maintenance', code: 'MAINTENANCE_MODE' }, 503);
    });

    render(<PolyBetaShell />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/Paper Beta is temporarily paused for maintenance/i);
    // Same-origin relative path only — never calls workers.dev, gamma, or clob directly
    expect(requestedUrls.length).toBeGreaterThan(0);
    for (const u of requestedUrls) {
      expect(u.startsWith('/api/beta/')).toBe(true);
      expect(u).not.toContain('workers.dev');
      expect(u).not.toContain('gamma-api.polymarket.com');
      expect(u).not.toContain('clob.polymarket.com');
    }
  });
});
