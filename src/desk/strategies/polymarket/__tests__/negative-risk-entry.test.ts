/**
 * Tests for negative-risk-entry.scanEntries.
 *
 * Mocks clob, orderManager, gamma, eventBus and logger so scanEntries can be
 * driven through its full filtering + placement + event-emission pipeline
 * without a live Polymarket connection. getBestAsk/usdcToTokens are imported
 * for real (they are pure).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockLogger, mockIsOnCooldown, mockSetCooldown } = vi.hoisted(() => ({
  mockLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  mockIsOnCooldown: vi.fn(),
  mockSetCooldown: vi.fn(),
}));

vi.mock('../../../core/logger', () => ({ logger: mockLogger }));
vi.mock('../negative-risk-types', () => ({
  STRATEGY_NAME: 'negative-risk-scanner',
  isOnCooldown: mockIsOnCooldown,
  setCooldown: mockSetCooldown,
}));

import { scanEntries } from '../negative-risk-entry';
import type { ScannerRuntime, ArbPosition } from '../negative-risk-types';

function makeMarket(overrides: Record<string, unknown> = {}) {
  return { conditionId: 'm-1', yesTokenId: 'yes-1', noTokenId: 'no-1', closed: false, resolved: false, volume: 2000, ...overrides };
}

function makeRuntime(markets: unknown[], positions = new Map<string, ArbPosition>()) {
  return {
    positions,
    cooldowns: new Map<string, number>(),
    cfg: { threshold: 0.98, maxOpportunitySizeUsdc: 10, cooldownMs: 30000, minVolumeUsdc: 1000 },
    clob: { getOrderBook: vi.fn(async () => ({ bids: [], asks: [{ price: '0.48', size: '100' }] })) },
    orderManager: { placeOrder: vi.fn(async (p: { tokenId: string }) => ({ id: `oid-${p.tokenId}` })) },
    eventBus: { emit: vi.fn() },
    gamma: { getTrending: vi.fn(async () => markets) },
  } as unknown as ScannerRuntime;
}

describe('scanEntries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsOnCooldown.mockReturnValue(false);
  });

  it('returns early when getTrending throws', async () => {
    const runtime = makeRuntime([]);
    (runtime.gamma.getTrending as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('network down'));
    await scanEntries(runtime);
    expect(runtime.orderManager.placeOrder).not.toHaveBeenCalled();
    expect(mockLogger.debug).toHaveBeenCalledWith('Failed to fetch trending markets', 'negative-risk-scanner', expect.anything());
  });

  it('skips markets missing yes/no token ids, closed/resolved, or below min volume', async () => {
    const runtime = makeRuntime([
      makeMarket({ yesTokenId: '' }),
      makeMarket({ closed: true }),
      makeMarket({ resolved: true }),
      makeMarket({ volume: 100 }),
    ]);
    await scanEntries(runtime);
    expect(runtime.orderManager.placeOrder).not.toHaveBeenCalled();
  });

  it('skips markets that already have an arb position or are on cooldown', async () => {
    const runtime = makeRuntime([makeMarket()], new Map([['m-1', {} as ArbPosition]]));
    await scanEntries(runtime);
    expect(runtime.orderManager.placeOrder).not.toHaveBeenCalled();

    mockIsOnCooldown.mockReturnValue(true);
    const cooledRuntime = makeRuntime([makeMarket()]);
    await scanEntries(cooledRuntime);
    expect(cooledRuntime.orderManager.placeOrder).not.toHaveBeenCalled();
  });

  it('skips markets with invalid ask prices, cost >= threshold, or zero token size', async () => {
    const invalidAsk = makeRuntime([makeMarket()]);
    (invalidAsk.clob.getOrderBook as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ bids: [], asks: [{ price: '0', size: '100' }] });
    await scanEntries(invalidAsk);
    expect(invalidAsk.orderManager.placeOrder).not.toHaveBeenCalled();

    const highCost = makeRuntime([makeMarket()]);
    (highCost.clob.getOrderBook as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ bids: [], asks: [{ price: '0.90', size: '100' }] });
    await scanEntries(highCost);
    expect(highCost.orderManager.placeOrder).not.toHaveBeenCalled();

    const zeroSize = makeRuntime([makeMarket()]);
    (zeroSize as unknown as { cfg: { maxOpportunitySizeUsdc: number } }).cfg.maxOpportunitySizeUsdc = 0;
    await scanEntries(zeroSize);
    expect(zeroSize.orderManager.placeOrder).not.toHaveBeenCalled();
  });

  it('places both legs, records the position, arms cooldown, logs and emits trade events', async () => {
    const runtime = makeRuntime([makeMarket()]);
    await scanEntries(runtime);
    expect(runtime.orderManager.placeOrder).toHaveBeenCalledTimes(2);
    expect(runtime.positions.get('m-1')).toMatchObject({
      conditionId: 'm-1', yesTokenId: 'yes-1', noTokenId: 'no-1', yesOrderId: 'oid-yes-1', noOrderId: 'oid-no-1',
    });
    expect(mockSetCooldown).toHaveBeenCalledWith(runtime, 'm-1');
    expect(mockLogger.info).toHaveBeenCalledWith('Arbitrage opportunity detected', 'negative-risk-scanner', expect.anything());
    expect(runtime.eventBus.emit).toHaveBeenCalledTimes(2);
    expect(runtime.eventBus.emit).toHaveBeenCalledWith('trade.executed', expect.objectContaining({ trade: expect.objectContaining({ orderId: 'oid-yes-1' }) }));
    expect(runtime.eventBus.emit).toHaveBeenCalledWith('trade.executed', expect.objectContaining({ trade: expect.objectContaining({ orderId: 'oid-no-1' }) }));
  });

  it('catches and logs errors from the per-market placement loop', async () => {
    const runtime = makeRuntime([makeMarket()]);
    (runtime.orderManager.placeOrder as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('order rejected'));
    await scanEntries(runtime);
    expect(mockLogger.debug).toHaveBeenCalledWith('Entry error', 'negative-risk-scanner', expect.anything());
    expect(runtime.positions.size).toBe(0);
  });

  it('skips a market whose raw cost clears the threshold but whose CLOB V2 fee-adjusted cost does not', async () => {
    const runtime = makeRuntime([makeMarket({ question: 'Will Bitcoin close above $100k?' })]);
    (runtime.clob.getOrderBook as ReturnType<typeof vi.fn>).mockImplementation(async (tokenId: string) => ({
      bids: [], asks: [{ price: tokenId === 'yes-1' ? '0.48' : '0.495', size: '100' }],
    }));
    await scanEntries(runtime);
    expect(runtime.orderManager.placeOrder).not.toHaveBeenCalled();
  });

  it('keeps placing both legs for a politics book whose fee-adjusted cost still clears the threshold', async () => {
    const runtime = makeRuntime([makeMarket({ question: 'Will the bill pass the Senate?' })]);
    (runtime.clob.getOrderBook as ReturnType<typeof vi.fn>).mockImplementation(async () => ({
      bids: [], asks: [{ price: '0.48', size: '100' }],
    }));
    await scanEntries(runtime);
    expect(runtime.orderManager.placeOrder).toHaveBeenCalledTimes(2);
    expect(runtime.positions.size).toBe(1);
  });

  it('skips a fee-bearing market when V2 share deduction pushes net edge under minNetEdgeUsdc', async () => {
    const runtime = makeRuntime([makeMarket({ question: 'Will Bitcoin close above $100k?' })]);
    (runtime.clob.getOrderBook as ReturnType<typeof vi.fn>).mockImplementation(async () => ({
      bids: [], asks: [{ price: '0.45', size: '100' }],
    }));
    (runtime as unknown as { cfg: { minNetEdgeUsdc: number } }).cfg.minNetEdgeUsdc = 2.0;
    await scanEntries(runtime);
    expect(runtime.orderManager.placeOrder).not.toHaveBeenCalled();
  });

  it('places both legs on an asymmetric book where one leg ask is above 0.50', async () => {
    const runtime = makeRuntime([makeMarket({ question: 'Ukraine ceasefire by July' })]);
    (runtime.clob.getOrderBook as ReturnType<typeof vi.fn>).mockImplementation(async (tokenId: string) => ({
      bids: [], asks: [{ price: tokenId === 'yes-1' ? '0.35' : '0.60', size: '100' }],
    }));
    await scanEntries(runtime);
    expect(runtime.orderManager.placeOrder).toHaveBeenCalledTimes(2);
  });

  it('emits real CLOB V2 taker fees on fee-bearing markets and zero on exempt markets', async () => {
    const cryptoRuntime = makeRuntime([makeMarket({ question: 'Will Bitcoin close above $100k?' })]);
    (cryptoRuntime.clob.getOrderBook as ReturnType<typeof vi.fn>).mockImplementation(async () => ({
      bids: [], asks: [{ price: '0.40', size: '100' }],
    }));
    await scanEntries(cryptoRuntime);
    const cryptoEmitted = (cryptoRuntime.eventBus.emit as ReturnType<typeof vi.fn>).mock.calls.filter((c) => c[0] === 'trade.executed');
    expect(cryptoEmitted).toHaveLength(2);
    for (const [, payload] of cryptoEmitted) expect(payload.trade.fees).toBe('0.168000');

    const exemptRuntime = makeRuntime([makeMarket({ question: 'Ukraine ceasefire by July' })]);
    (exemptRuntime.clob.getOrderBook as ReturnType<typeof vi.fn>).mockImplementation(async () => ({
      bids: [], asks: [{ price: '0.48', size: '100' }],
    }));
    await scanEntries(exemptRuntime);
    const exemptEmitted = (exemptRuntime.eventBus.emit as ReturnType<typeof vi.fn>).mock.calls.filter((c) => c[0] === 'trade.executed');
    expect(exemptEmitted).toHaveLength(2);
    for (const [, payload] of exemptEmitted) expect(payload.trade.fees).toBe('0.000000');
  });

  it('refuses un-grossed-up entry when requireFullRequestedPairMerge is enabled, and places grossed-up orders when grossUpForShareDeduction is enabled', async () => {
    const blocked = makeRuntime([makeMarket({ question: 'Will Bitcoin close above $100k?' })]);
    (blocked.clob.getOrderBook as ReturnType<typeof vi.fn>).mockImplementation(async () => ({
      bids: [], asks: [{ price: '0.40', size: '100' }],
    }));
    Object.assign(blocked.cfg, { requireFullRequestedPairMerge: true });
    await scanEntries(blocked);
    expect(blocked.orderManager.placeOrder).not.toHaveBeenCalled();

    const grossed = makeRuntime([makeMarket({ question: 'Will Bitcoin close above $100k?' })]);
    (grossed.clob.getOrderBook as ReturnType<typeof vi.fn>).mockImplementation(async () => ({
      bids: [], asks: [{ price: '0.40', size: '100' }],
    }));
    Object.assign(grossed.cfg, { requireFullRequestedPairMerge: true, grossUpForShareDeduction: true });
    await scanEntries(grossed);
    expect(grossed.orderManager.placeOrder).toHaveBeenCalledTimes(2);
    expect(grossed.orderManager.placeOrder).toHaveBeenCalledWith(expect.objectContaining({ size: '26' }));
  });
});
