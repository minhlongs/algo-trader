import { describe, it, expect, beforeEach } from 'vitest';
import { LiveExecutionGateway } from '../../../../src/desk/execution/live-execution-gateway';
import { PmSmartOrderRouter } from '../../../../src/desk/execution/pm-sor-engine';
import { CircuitBreakerSafeguard } from '../../../../src/desk/risk/circuit-breaker-safeguard';
import { DynamicLpEngine } from '../../../../src/desk/mm/dynamic-lp-engine';
import type { VenueBookSnapshot } from '../../../../src/desk/execution/pm-sor-types';
import type { OrderIntent } from '../../../../src/desk/execution/live-execution-gateway-types';

describe('LiveExecutionGateway', () => {
  let router: PmSmartOrderRouter;
  let safeguard: CircuitBreakerSafeguard;
  let lpEngine: DynamicLpEngine;
  let gateway: LiveExecutionGateway;

  const mockBooks: VenueBookSnapshot[] = [
    {
      venue: 'polymarket',
      marketId: 'pres-2024',
      outcome: 'YES',
      feeRate: 0.002,
      bids: [{ price: 0.52, quantity: 1000 }],
      asks: [{ price: 0.54, quantity: 1000 }],
    },
  ];

  beforeEach(() => {
    router = new PmSmartOrderRouter();
    safeguard = new CircuitBreakerSafeguard({ maxDrawdownPct: 0.1 });
    safeguard.updateNav(100000);
    lpEngine = new DynamicLpEngine();
    gateway = new LiveExecutionGateway({ router, safeguard, lpEngine });
  });

  it('successfully routes and fills a valid order intent', () => {
    const intent: OrderIntent = {
      intentId: 'intent-1',
      marketId: 'pres-2024',
      outcome: 'YES',
      action: 'BUY',
      targetQuantity: 500,
      clientTimestamp: Date.now(),
    };

    const res = gateway.executeOrder({ intent, books: mockBooks });
    expect(res.status).toBe('FILLED');
    expect(res.routePlan?.filledQuantity).toBe(500);

    const status = gateway.getStatus();
    expect(status.totalOrdersProcessed).toBe(1);
    expect(status.totalVolumeProcessed).toBe(500);
  });

  it('halts order execution when circuit breaker is tripped', () => {
    safeguard.trip('MAX_DRAWDOWN_BREACH');

    const intent: OrderIntent = {
      intentId: 'intent-halted',
      marketId: 'pres-2024',
      outcome: 'YES',
      action: 'BUY',
      targetQuantity: 100,
      clientTimestamp: Date.now(),
    };

    const res = gateway.executeOrder({ intent, books: mockBooks });
    expect(res.status).toBe('HALTED');
    expect(res.rejectionReason).toContain('Trading halted');
  });

  it('rejects order with invalid target quantity', () => {
    const intent: OrderIntent = {
      intentId: 'intent-invalid',
      marketId: 'pres-2024',
      outcome: 'YES',
      action: 'BUY',
      targetQuantity: -5,
      clientTimestamp: Date.now(),
    };

    const res = gateway.executeOrder({ intent, books: mockBooks });
    expect(res.status).toBe('REJECTED');
    expect(res.rejectionReason).toContain('Invalid target quantity');
  });

  it('refreshes and cancels active two-sided quotes', () => {
    const quote = gateway.refreshQuote({
      marketId: 'pres-2024',
      fairProbability: 0.53,
      currentInventoryShares: 0,
    });

    expect(quote).not.toBeNull();
    expect(quote?.bidPrice).toBeLessThan(quote?.askPrice ?? 0);
    expect(gateway.getStatus().activeQuotesCount).toBe(1);

    gateway.cancelQuotes();
    expect(gateway.getStatus().activeQuotesCount).toBe(0);
  });
});
