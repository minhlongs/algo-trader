/**
 * Tests for MeanReversionStrategy class — constructor, onPriceUpdate,
 * executeTick exit logic, and stop. Focuses on the state machine that the
 * pure-helper suite (mean-reversion.test.ts) does not touch. Logger is
 * mocked; ClobClient/Scanner are passed as stubs since the tested methods
 * never touch them.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const loggerMock = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../../../../../src/desk/core/logger', () => ({
  logger: loggerMock,
}));

import { MeanReversionStrategy } from '../../../../../src/desk/strategies/polymarket/mean-reversion';
import type { StrategyConfig } from '../../../../../src/desk/core/types';

function makeConfig(overrides: Record<string, unknown> = {}): StrategyConfig {
  return { name: 'mean-reversion', enabled: true, capitalAllocation: '1000', params: overrides };
}

/** Push `n` price ticks, linearly spaced between `lo` and `hi`. */
function feed(strategy: MeanReversionStrategy, tokenId: string, n: number, lo: number, hi: number): void {
  for (let i = 0; i < n; i++) {
    const price = lo + ((hi - lo) * i) / Math.max(1, n - 1);
    strategy.onPriceUpdate(tokenId, price);
  }
}

describe('MeanReversionStrategy class', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('constructs with merged config, running=true, and logs init', () => {
    const s = new MeanReversionStrategy({} as never, {} as never, makeConfig({ spikeThreshold: 3.5 }), 'CAP1');
    // running=true means a valid price update is processed (history grows).
    s.onPriceUpdate('T1', 0.5);
    expect(loggerMock.info).toHaveBeenCalledWith(
      '[mean-reversion] Strategy initialized',
      expect.objectContaining({ spikeThreshold: 3.5 }),
    );
    // No position opened with only 1 tick (history < maWindow).
    expect(loggerMock.info).not.toHaveBeenCalledWith(
      '[mean-reversion] Position opened',
      expect.anything(),
    );
  });

  it('ignores price updates when not running', () => {
    const s = new MeanReversionStrategy({} as never, {} as never, makeConfig(), 'CAP1');
    s.stop();
    // After stop, even a strong spike does not open a position.
    feed(s, 'T1', 20, 0.01, 0.01);
    s.onPriceUpdate('T1', 0.02);
    expect(loggerMock.info).not.toHaveBeenCalledWith(
      '[mean-reversion] Position opened',
      expect.anything(),
    );
  });

  it('rejects out-of-range prices (<=0 or >=1)', () => {
    const s = new MeanReversionStrategy({} as never, {} as never, makeConfig(), 'CAP1');
    s.onPriceUpdate('T1', 0);
    s.onPriceUpdate('T1', 1);
    s.onPriceUpdate('T1', -0.1);
    s.onPriceUpdate('T1', 1.5);
    // No progress toward opening a position.
    expect(loggerMock.info).not.toHaveBeenCalledWith(
      '[mean-reversion] Position opened',
      expect.anything(),
    );
  });

  it('does not open a second position on a token that is already tracked', () => {
    const s = new MeanReversionStrategy({} as never, {} as never, makeConfig({ spikeThreshold: 0.1 }), 'CAP1');
    // Build a flat history then a big spike to open a position.
    feed(s, 'T1', 20, 0.5, 0.5);
    s.onPriceUpdate('T1', 0.01); // huge negative z → opens "yes"
    expect(loggerMock.info).toHaveBeenCalledWith(
      '[mean-reversion] Position opened',
      expect.objectContaining({ side: 'yes' }),
    );
    const callsBefore = loggerMock.info.mock.calls.length;
    // Another spike on the same token must NOT open again.
    s.onPriceUpdate('T1', 0.01);
    s.onPriceUpdate('T1', 0.01);
    expect(loggerMock.info.mock.calls.length).toBe(callsBefore);
  });

  it('respects maxPositions across distinct tokens', () => {
    const s = new MeanReversionStrategy({} as never, {} as never, makeConfig({ spikeThreshold: 0.1, maxPositions: 2 }), 'CAP1');
    for (const tok of ['A', 'B', 'C']) {
      feed(s, tok, 20, 0.5, 0.5);
      s.onPriceUpdate(tok, 0.01); // spike → open
    }
    // First two tokens opened, third rejected (maxPositions=2).
    const opened = loggerMock.info.mock.calls.filter((c) => c[0] === '[mean-reversion] Position opened');
    expect(opened).toHaveLength(2);
  });

  it('waits until history reaches maWindow before opening', () => {
    const s = new MeanReversionStrategy({} as never, {} as never, makeConfig({ spikeThreshold: 0.1, maWindow: 10 }), 'CAP1');
    // 8 ticks flat then a spike — 9 total, below window (10), should not open.
    feed(s, 'T1', 8, 0.5, 0.5);
    s.onPriceUpdate('T1', 0.01);
    const openedBelow = loggerMock.info.mock.calls.filter((c) => c[0] === '[mean-reversion] Position opened');
    expect(openedBelow).toHaveLength(0);
    // Add flat ticks to reach the window, then a spike — now it opens.
    s.onPriceUpdate('T1', 0.5); // 10th tick
    s.onPriceUpdate('T1', 0.5); // 11th tick
    s.onPriceUpdate('T1', 0.01);
    const opened = loggerMock.info.mock.calls.filter((c) => c[0] === '[mean-reversion] Position opened');
    expect(opened).toHaveLength(1);
  });

  it('opens a position when z-score exceeds the spike threshold', () => {
    const s = new MeanReversionStrategy({} as never, {} as never, makeConfig({ spikeThreshold: 0.5, maWindow: 5 }), 'CAP1');
    feed(s, 'T1', 5, 0.5, 0.5);
    s.onPriceUpdate('T1', 0.01); // way below mean of 0.5 → opens "yes"
    expect(loggerMock.info).toHaveBeenCalledWith(
      '[mean-reversion] Position opened',
      expect.objectContaining({ side: 'yes', entryPrice: '0.0100' }),
    );
  });

  it('does not open when z-score is below the spike threshold', () => {
    const s = new MeanReversionStrategy({} as never, {} as never, makeConfig({ spikeThreshold: 3.0, maWindow: 5 }), 'CAP1');
    feed(s, 'T1', 5, 0.5, 0.5);
    s.onPriceUpdate('T1', 0.45); // modest deviation, |z| < 3
    expect(loggerMock.info).not.toHaveBeenCalledWith(
      '[mean-reversion] Position opened',
      expect.anything(),
    );
  });

  it('caps price history at maWindow * 3', () => {
    const s = new MeanReversionStrategy({} as never, {} as never, makeConfig({ maWindow: 5 }), 'CAP1');
    // Feed 100 ticks; history should cap at 15.
    feed(s, 'T1', 100, 0.4, 0.6);
    // Internally verify via reflection on the private field.
    const hist = (s as unknown as { priceHistory: Map<string, number[]> }).priceHistory.get('T1');
    expect(hist).toBeDefined();
    expect(hist!.length).toBeLessThanOrEqual(5 * 3);
  });

  describe('executeTick exit logic', () => {
    it('closes a position when z-score reverts near zero', async () => {
      const s = new MeanReversionStrategy({} as never, {} as never, makeConfig({ spikeThreshold: 0.5, maWindow: 5, exitThreshold: 0.5 }), 'CAP1');
      feed(s, 'T1', 5, 0.5, 0.5);
      s.onPriceUpdate('T1', 0.01); // open "yes" at 0.01
      // Now the most recent price returns to the mean.
      s.onPriceUpdate('T1', 0.5);
      await s.executeTick();
      expect(loggerMock.info).toHaveBeenCalledWith(
        '[mean-reversion] Position closed',
        expect.objectContaining({ reason: 'reverted' }),
      );
    });

    it('closes a position after the 30-minute timeout', async () => {
      const s = new MeanReversionStrategy({} as never, {} as never, makeConfig({ spikeThreshold: 0.5, maWindow: 5 }), 'CAP1');
      feed(s, 'T1', 5, 0.5, 0.5);
      s.onPriceUpdate('T1', 0.9); // open "no"
      // Price stays at the spike so z-score does NOT revert; advance time past 30 min.
      vi.advanceTimersByTime(31 * 60_000);
      await s.executeTick();
      expect(loggerMock.info).toHaveBeenCalledWith(
        '[mean-reversion] Position closed',
        expect.objectContaining({ reason: 'timeout' }),
      );
    });

    it('skips exit logic when price history is too short', async () => {
      const s = new MeanReversionStrategy({} as never, {} as never, makeConfig({ spikeThreshold: 0.1, maWindow: 20 }), 'CAP1');
      // Open a position (need 20 ticks first).
      feed(s, 'T1', 20, 0.5, 0.5);
      s.onPriceUpdate('T1', 0.01); // open
      // Clear history by simulating the token's history being wiped (edge: short).
      (s as unknown as { priceHistory: Map<string, number[]> }).priceHistory.set('T1', [0.5]);
      await s.executeTick();
      // No close logged because history length < 3 → continue.
      expect(loggerMock.info).not.toHaveBeenCalledWith(
        '[mean-reversion] Position closed',
        expect.anything(),
      );
    });

    it('does not exit when z-score is still beyond exit threshold and within time', async () => {
      const s = new MeanReversionStrategy({} as never, {} as never, makeConfig({ spikeThreshold: 0.5, maWindow: 5, exitThreshold: 0.5 }), 'CAP1');
      feed(s, 'T1', 5, 0.5, 0.5);
      s.onPriceUpdate('T1', 0.01); // open
      // Advance only 10 minutes — not a timeout, and z-score stays large.
      vi.advanceTimersByTime(10 * 60_000);
      await s.executeTick();
      expect(loggerMock.info).not.toHaveBeenCalledWith(
        '[mean-reversion] Position closed',
        expect.anything(),
      );
    });
  });

  it('stop clears state, sets running=false, and logs', () => {
    const s = new MeanReversionStrategy({} as never, {} as never, makeConfig({ spikeThreshold: 0.1, maWindow: 5 }), 'CAP1');
    feed(s, 'T1', 5, 0.5, 0.5);
    s.onPriceUpdate('T1', 0.01); // open a position
    s.stop();
    expect(loggerMock.info).toHaveBeenCalledWith('[mean-reversion] Stopped');
    // After stop, executeTick is a no-op (running=false).
    // Verify state cleared via reflection.
    const internal = s as unknown as { running: boolean; positions: unknown[]; priceHistory: Map<string, unknown> };
    expect(internal.running).toBe(false);
    expect(internal.positions).toHaveLength(0);
    expect(internal.priceHistory.size).toBe(0);
  });
});
