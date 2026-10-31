import { describe, it, expect, beforeEach } from 'vitest';
import { LiveExecutionGateway } from '../live-execution-gateway';
import { PmSmartOrderRouter } from '../pm-sor-engine';
import { CircuitBreakerSafeguard } from '../../risk/circuit-breaker-safeguard';
import { DynamicLpEngine } from '../../mm/dynamic-lp-engine';
import type { VenueBookSnapshot } from '../pm-sor-types';
import type { OrderIntent } from '../live-execution-gateway-types';

describe('LiveExecutionGateway venue fill honesty', () => {
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

  it('reports ROUTED rather than FILLED because the gateway calculates a route without venue submission', () => {
    const intent: OrderIntent = {
      intentId: 'intent-1',
      marketId: 'pres-2024',
      outcome: 'YES',
      action: 'BUY',
      targetQuantity: 500,
      clientTimestamp: Date.now(),
    };

    const res = gateway.executeOrder({ intent, books: mockBooks });

    // An in-process route planner cannot claim a venue fill.
    // It must report ROUTED so callers do not treat simulated routing as a live fill.
    expect(res.status).toBe('ROUTED');
    expect(res.status).not.toBe('FILLED');
    expect(res.routePlan?.filledQuantity).toBe(500);
  });
});
