/**
 * Tests for negative-risk-exit.evaluateExits.
 *
 * Drives the exit evaluator through take-profit, stop-loss, max-hold,
 * no-liquidity, position deletion, and error-handling branches against
 * mocked clob/orderManager/eventBus/logger.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockLogger, mockSetCooldown } = vi.hoisted(() => ({
  mockLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  mockSetCooldown: vi.fn(),
}));

vi.mock('../../../core/logger', () => ({ logger: mockLogger }));
vi.mock('../negative-risk-types', () => ({
  STRATEGY_NAME: 'negative-risk-scanner',
  setCooldown: mockSetCooldown,
}));
vi.mock('../../polymarket/clob-client', () => ({ getOrderBook: vi.fn(), RawOrderBook: {} }));
vi.mock('../../polymarket/gamma-client', () => ({ getTrending: vi.fn(), GammaMarket: {} }));
vi.mock('../../polymarket/order-manager', () => ({ placeOrder: vi.fn(), OrderManager: {} }));

import { evaluateExits } from '../negative-risk-exit';
import type { ScannerRuntime, ArbPosition } from '../negative-risk-types';

function makePosition(overrides: Partial<ArbPosition> = {}): ArbPosition {
  return {
    conditionId: 'm-1',
    yesTokenId: 'yes-1',
    noTokenId: 'no-1',
    yesEntryPrice: 0.48,
    noEntryPrice: 0.48,
    yesSizeUsdc: 10,
    noSizeUsdc: 10,
    yesOrderId: 'yoid',
    noOrderId: 'noid',
    openedAt: Date.now() - 1000,
    ...overrides,
  };
}

function makeRuntime(positions = new Map<string, ArbPosition>(), overrides: Record<string, unknown> = {}) {
  return {
    positions,
    cooldowns: new Map<string, number>(),
    cfg: {
      threshold: 0.98,
      maxOpportunitySizeUsdc: 10,
      cooldownMs: 30000,
      minVolumeUsdc: 1000,
      takeProfitPct: 0.02,
      stopLossPct: 0.015,
      maxHoldMs: 60 * 60 * 1000,
      ...overrides,
    },
    clob: { getOrderBook: vi.fn(async () => ({ bids: [{ price: '0.50', size: '100' }], asks: [] })) },
    orderManager: { placeOrder: vi.fn(async (p: { tokenId: string }) => ({ id: `oid-${p.tokenId}` })) },
    eventBus: { emit: vi.fn() },
    gamma: { getTrending: vi.fn(async () => []) },
  } as unknown as ScannerRuntime;
}

describe('evaluateExits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is a no-op when there are no positions', async () => {
    const runtime = makeRuntime();
    await evaluateExits(runtime);
    expect(runtime.orderManager.placeOrder).not.toHaveBeenCalled();
    expect(mockSetCooldown).not.toHaveBeenCalled();
  });

  it('skips positions with no liquidity on either leg', async () => {
    const runtime = makeRuntime(new Map([['m-1', makePosition()]]));
    (runtime.clob.getOrderBook as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ bids: [], asks: [] });
    await evaluateExits(runtime);
    expect(runtime.orderManager.placeOrder).not.toHaveBeenCalled();
    expect(runtime.positions.size).toBe(1);
  });

  it('closes a position that hits take-profit', async () => {
    // yesBid 0.50, noBid 0.50 -> exit value 1.00 vs cost 0.96 -> +4.17% pnl
    const runtime = makeRuntime(new Map([['m-1', makePosition()]]));
    await evaluateExits(runtime);

    expect(runtime.orderManager.placeOrder).toHaveBeenCalledTimes(2);
    expect(runtime.positions.has('m-1')).toBe(false);
    expect(mockSetCooldown).toHaveBeenCalledWith(runtime, 'm-1');
    expect(mockLogger.info).toHaveBeenCalledWith('Exit arbitrage position', 'negative-risk-scanner', expect.anything());
    expect(runtime.eventBus.emit).toHaveBeenCalledTimes(2);
    expect(runtime.eventBus.emit).toHaveBeenCalledWith('trade.executed', expect.objectContaining({ trade: expect.objectContaining({ side: 'sell' }) }));
  });

  it('closes a position that hits stop-loss', async () => {
    // bids well below entry cost -> large negative pnl
    const runtime = makeRuntime(
      new Map([['m-1', makePosition({ yesEntryPrice: 0.9, noEntryPrice: 0.9, yesSizeUsdc: 10, noSizeUsdc: 10 })]]),
      { stopLossPct: 0.015 }
    );
    (runtime.clob.getOrderBook as ReturnType<typeof vi.fn>).mockResolvedValue({ bids: [{ price: '0.2', size: '100' }], asks: [] });
    await evaluateExits(runtime);

    expect(runtime.orderManager.placeOrder).toHaveBeenCalledTimes(2);
    expect(runtime.positions.has('m-1')).toBe(false);
    expect(mockLogger.info).toHaveBeenCalledWith('Exit arbitrage position', 'negative-risk-scanner', expect.objectContaining({ reason: expect.stringContaining('stop-loss') }));
  });

  it('closes a position that exceeds max hold time', async () => {
    const runtime = makeRuntime(
      new Map([['m-1', makePosition({ openedAt: Date.now() - 10 * 60 * 60 * 1000 })]]),
      { maxHoldMs: 60 * 60 * 1000, takeProfitPct: 0.5, stopLossPct: 0.5 }
    );
    await evaluateExits(runtime);

    expect(runtime.orderManager.placeOrder).toHaveBeenCalledTimes(2);
    expect(runtime.positions.has('m-1')).toBe(false);
    expect(mockLogger.info).toHaveBeenCalledWith('Exit arbitrage position', 'negative-risk-scanner', expect.anything());
  });

  it('keeps open positions that miss all exit criteria', async () => {
    // bids 0.48/0.48 -> exit value 0.96 vs cost 0.96 -> ~0% pnl, no max-hold hit
    const runtime = makeRuntime(
      new Map([['m-1', makePosition({ yesEntryPrice: 0.48, noEntryPrice: 0.48 })]]),
      { takeProfitPct: 0.02, stopLossPct: 0.015, maxHoldMs: 60 * 60 * 1000 }
    );
    (runtime.clob.getOrderBook as ReturnType<typeof vi.fn>).mockResolvedValue({ bids: [{ price: '0.48', size: '100' }], asks: [] });
    await evaluateExits(runtime);

    expect(runtime.orderManager.placeOrder).not.toHaveBeenCalled();
    expect(runtime.positions.size).toBe(1);
    expect(mockLogger.info).not.toHaveBeenCalled();
    expect(mockSetCooldown).not.toHaveBeenCalled();
  });

  it('catches and warns on per-position evaluation errors', async () => {
    const runtime = makeRuntime(new Map([['m-1', makePosition()]]));
    (runtime.clob.getOrderBook as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('book fetch failed'));
    await evaluateExits(runtime);

    expect(mockLogger.warn).toHaveBeenCalledWith('Exit check failed', 'negative-risk-scanner', expect.anything());
    expect(runtime.positions.size).toBe(1);
    expect(runtime.orderManager.placeOrder).not.toHaveBeenCalled();
  });

  it('applies cooldown and deletes position only after the close loop completes', async () => {
    const runtime = makeRuntime(
      new Map([
        ['m-1', makePosition({ conditionId: 'm-1' })],
        ['m-2', makePosition({ conditionId: 'm-2' })],
      ]),
      { takeProfitPct: 0.02, stopLossPct: 0.015, maxHoldMs: 60 * 60 * 1000 }
    );
    await evaluateExits(runtime);

    expect(runtime.positions.size).toBe(0);
    expect(mockSetCooldown).toHaveBeenCalledWith(runtime, 'm-1');
    expect(mockSetCooldown).toHaveBeenCalledWith(runtime, 'm-2');
  });
});
