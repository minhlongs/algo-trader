/**
 * Tests for live-trading-event-handler — LiveTradingEventHandler position
 * tracking, price subscription, snapshot/restore and clear.
 *
 * Pure class, no external deps — a fake PriceEventBus is all that is needed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LiveTradingEventHandler, PriceEventBus, PriceEvent, PositionInfo } from '../live-trading-event-handler';

function makeBus(): {
  bus: PriceEventBus & { _handler: ((e: PriceEvent) => void) | undefined };
  subscribe: ReturnType<typeof vi.fn>;
  unsubscribe: ReturnType<typeof vi.fn>;
  emit: (e: PriceEvent) => void;
} {
  const bus = {
    _handler: undefined as ((e: PriceEvent) => void) | undefined,
    emit: (e: PriceEvent) => void 0,
    subscribe: vi.fn((_event: string, handler: (e: PriceEvent) => void) => {
      bus._handler = handler;
      return 'sub-1';
    }),
    unsubscribe: vi.fn(),
  };
  bus.emit = (e: PriceEvent) => bus._handler?.(e);
  return {
    bus: bus as PriceEventBus & { _handler: ((e: PriceEvent) => void) | undefined; emit: (e: PriceEvent) => void },
    subscribe: bus.subscribe,
    unsubscribe: bus.unsubscribe,
  };
}

function makePosition(overrides: Partial<PositionInfo> = {}): PositionInfo {
  return {
    market: 'mkt-1',
    outcome: 'Yes',
    size: 100,
    avgEntryPrice: 0.5,
    currentPrice: 0.5,
    unrealizedPnl: 0,
    ...overrides,
  };
}

describe('LiveTradingEventHandler', () => {
  let handler: LiveTradingEventHandler;
  let log: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    log = vi.fn();
  });

  it('subscribes to price updates and returns the sub id', () => {
    const { bus, subscribe } = makeBus();
    handler = new LiveTradingEventHandler(bus, log);
    const id = handler.startPriceSubscription();
    expect(id).toBe('sub-1');
    expect(subscribe).toHaveBeenCalledWith('price_update', expect.any(Function));
  });

  it('unsubscribes on stop and clears the sub id', () => {
    const { bus, unsubscribe } = makeBus();
    handler = new LiveTradingEventHandler(bus, log);
    handler.startPriceSubscription();
    handler.stopPriceSubscription();
    expect(unsubscribe).toHaveBeenCalledWith('sub-1');
    // calling stop twice is a no-op
    handler.stopPriceSubscription();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('stop before start is a no-op', () => {
    const { bus, unsubscribe } = makeBus();
    handler = new LiveTradingEventHandler(bus, log);
    handler.stopPriceSubscription();
    expect(unsubscribe).not.toHaveBeenCalled();
  });

  it('updates tracked positions on a price event', () => {
    const { bus } = makeBus();
    handler = new LiveTradingEventHandler(bus, log);
    handler.startPriceSubscription();
    handler.trackPosition(makePosition({ market: 'mkt-1', outcome: 'Yes', size: 100, avgEntryPrice: 0.5 }));
    bus.emit({ marketId: 'mkt-1', outcomeIndex: 0, price: 0.6, timestamp: 1 });
    const pos = handler.getPosition('mkt-1', 'Yes');
    expect(pos?.currentPrice).toBe(0.6);
    expect(pos?.unrealizedPnl).toBeCloseTo(10, 5);
  });

  it('ignores price events for untracked markets', () => {
    const { bus } = makeBus();
    handler = new LiveTradingEventHandler(bus, log);
    handler.startPriceSubscription();
    handler.trackPosition(makePosition({ market: 'mkt-1', outcome: 'Yes' }));
    bus.emit({ marketId: 'mkt-9', outcomeIndex: 0, price: 0.9, timestamp: 1 });
    expect(handler.getPosition('mkt-9', 'Yes')).toBeUndefined();
    expect(handler.getPosition('mkt-1', 'Yes')?.currentPrice).toBe(0.5);
  });

  it('tracks Yes and No outcomes on the same market separately', () => {
    const { bus } = makeBus();
    handler = new LiveTradingEventHandler(bus, log);
    handler.trackPosition(makePosition({ market: 'mkt-1', outcome: 'Yes', size: 50, avgEntryPrice: 0.4 }));
    handler.trackPosition(makePosition({ market: 'mkt-1', outcome: 'No', size: 50, avgEntryPrice: 0.6 }));
    expect(handler.getPosition('mkt-1', 'Yes')?.size).toBe(50);
    expect(handler.getPosition('mkt-1', 'No')?.size).toBe(50);
    expect(handler.getPosition('mkt-1', 'Yes')?.avgEntryPrice).toBe(0.4);
    expect(handler.getPosition('mkt-1', 'No')?.avgEntryPrice).toBe(0.6);
  });

  it('returns all tracked positions through getPositions', () => {
    const { bus } = makeBus();
    handler = new LiveTradingEventHandler(bus, log);
    handler.trackPosition(makePosition({ market: 'mkt-1', outcome: 'Yes' }));
    handler.trackPosition(makePosition({ market: 'mkt-2', outcome: 'No' }));
    expect(handler.getPositions().size).toBe(2);
  });

  it('snapshots positions to a plain array', () => {
    const { bus } = makeBus();
    handler = new LiveTradingEventHandler(bus, log);
    handler.trackPosition(makePosition({ market: 'mkt-1', outcome: 'Yes', size: 10, avgEntryPrice: 0.5, currentPrice: 0.6, unrealizedPnl: 1 }));
    const snap = handler.snapshotPositions();
    expect(snap).toHaveLength(1);
    expect(snap[0].market).toBe('mkt-1');
    expect(snap[0].outcome).toBe('Yes');
    expect(snap[0].size).toBe(10);
  });

  it('returns an empty snapshot when nothing is tracked', () => {
    const { bus } = makeBus();
    handler = new LiveTradingEventHandler(bus, log);
    expect(handler.snapshotPositions()).toEqual([]);
  });

  it('restorePositions clears and reloads from a snapshot', () => {
    const { bus } = makeBus();
    handler = new LiveTradingEventHandler(bus, log);
    handler.trackPosition(makePosition({ market: 'mkt-1', outcome: 'Yes' }));
    handler.restorePositions([
      makePosition({ market: 'mkt-2', outcome: 'No', size: 5, avgEntryPrice: 0.7, currentPrice: 0.8, unrealizedPnl: 0.5 }),
      makePosition({ market: 'mkt-3', outcome: 'Yes', size: 20, avgEntryPrice: 0.2, currentPrice: 0.25, unrealizedPnl: 1 }),
    ]);
    expect(handler.getPositions().size).toBe(2);
    expect(handler.getPosition('mkt-1', 'Yes')).toBeUndefined();
    expect(handler.getPosition('mkt-2', 'No')?.size).toBe(5);
    expect(handler.getPosition('mkt-3', 'Yes')?.unrealizedPnl).toBeCloseTo(1, 5);
  });

  it('clear removes all tracked positions', () => {
    const { bus } = makeBus();
    handler = new LiveTradingEventHandler(bus, log);
    handler.trackPosition(makePosition({ market: 'mkt-1', outcome: 'Yes' }));
    handler.trackPosition(makePosition({ market: 'mkt-2', outcome: 'No' }));
    handler.clear();
    expect(handler.getPositions().size).toBe(0);
  });
});
