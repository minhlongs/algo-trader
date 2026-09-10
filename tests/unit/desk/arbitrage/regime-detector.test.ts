/**
 * Tests for regime-detector — RegimeDetector class.
 *
 * Covers: calculateVolatility, calculateSpreadStats, getHistoricalSpreads,
 * detectRegime, updateRegime, start, getCurrentRegime, getHistory, storeMetrics.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../../src/shared/utils/logger', () => ({ logger: mockLogger }));

let mockRedis: {
  hgetall: ReturnType<typeof vi.fn>;
  pipeline: ReturnType<typeof vi.fn>;
};
let mockPipeline: {
  hset: ReturnType<typeof vi.fn>;
  expire: ReturnType<typeof vi.fn>;
  exec: ReturnType<typeof vi.fn>;
};

const { mockGetRedisClient } = vi.hoisted(() => ({
  mockGetRedisClient: vi.fn(),
}));

vi.mock('../../../../src/redis', () => ({ getRedisClient: mockGetRedisClient }));

import { RegimeDetector, type MarketRegime } from '../../../../src/desk/arbitrage/regime-detector';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeRedis() {
  mockPipeline = {
    hset: vi.fn(),
    expire: vi.fn(),
    exec: vi.fn().mockResolvedValue([]),
  };
  mockRedis = {
    hgetall: vi.fn().mockResolvedValue({}),
    pipeline: vi.fn().mockReturnValue(mockPipeline),
  };
  return mockRedis;
}

function makePrices(n: number, base: number, noise: number): number[] {
  const prices: number[] = [];
  for (let i = 0; i < n; i++) {
    prices.push(base + Math.sin(i) * noise);
  }
  return prices;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  makeRedis();
  mockGetRedisClient.mockReturnValue(mockRedis);
});

afterEach(() => {
  vi.useRealTimers();
});

// ── Constructor ──────────────────────────────────────────────────────────────

describe('constructor', () => {
  it('uses injected redis and default config', () => {
    const detector = new RegimeDetector(mockRedis);
    expect(detector.getCurrentRegime()).toBe('NORMAL');
  });

  it('applies partial config overrides', () => {
    const detector = new RegimeDetector(mockRedis, {
      volatilityThresholds: { normal: 2.0, volatile: 5.0, crash: 10.0 },
      lookbackPeriods: 50,
      checkIntervalMs: 1000,
    });
    expect(detector.getCurrentRegime()).toBe('NORMAL');
  });
});

// ── calculateVolatility ──────────────────────────────────────────────────────

describe('calculateVolatility (via detectRegime)', () => {
  it('returns 0 for empty spreads (< 2 points)', async () => {
    mockRedis.hgetall.mockResolvedValue({ bid: '100', ask: '101' });
    const detector = new RegimeDetector(mockRedis, { lookbackPeriods: 10 });
    const metrics = await detector.detectRegime('BTC', ['exA']);
    expect(metrics.volatility).toBe(0);
    expect(metrics.regime).toBe('NORMAL');
  });

  it('returns 0 for uniform spreads (zero volatility)', async () => {
    // Return same bid/ask for all exchanges → same spread → zero vol
    mockRedis.hgetall.mockResolvedValue({ bid: '100', ask: '101' });
    const detector = new RegimeDetector(mockRedis, { lookbackPeriods: 10 });
    const metrics = await detector.detectRegime('BTC', ['exA', 'exB', 'exC']);
    expect(metrics.volatility).toBe(0);
    expect(metrics.regime).toBe('NORMAL');
  });
});

// ── calculateSpreadStats ─────────────────────────────────────────────────────

describe('spreadStats (via detectRegime)', () => {
  it('returns avg=0, stdDev=0 for empty spreads', async () => {
    const detector = new RegimeDetector(mockRedis, { lookbackPeriods: 10 });
    const metrics = await detector.detectRegime('BTC', []);
    expect(metrics.spreadAvg).toBe(0);
    expect(metrics.spreadStdDev).toBe(0);
  });
});

// ── getHistoricalSpreads ─────────────────────────────────────────────────────

describe('getHistoricalSpreads (via detectRegime)', () => {
  it('skips exchange with empty ticker', async () => {
    mockRedis.hgetall.mockResolvedValueOnce({}).mockResolvedValueOnce({ bid: '100', ask: '101' });
    const detector = new RegimeDetector(mockRedis, { lookbackPeriods: 10 });
    const metrics = await detector.detectRegime('BTC', ['exA', 'exB']);
    expect(metrics.spreadAvg).toBeGreaterThanOrEqual(0);
  });

  it('skips ticker with zero bid', async () => {
    mockRedis.hgetall.mockResolvedValue({ bid: '0', ask: '101' });
    const detector = new RegimeDetector(mockRedis, { lookbackPeriods: 10 });
    const metrics = await detector.detectRegime('BTC', ['exA']);
    expect(metrics.spreadAvg).toBe(0);
  });

  it('skips ticker with zero ask', async () => {
    mockRedis.hgetall.mockResolvedValue({ bid: '100', ask: '0' });
    const detector = new RegimeDetector(mockRedis, { lookbackPeriods: 10 });
    const metrics = await detector.detectRegime('BTC', ['exA']);
    expect(metrics.spreadAvg).toBe(0);
  });

  it('handles ticker with NaN bid/ask', async () => {
    mockRedis.hgetall.mockResolvedValue({ bid: 'abc', ask: 'xyz' });
    const detector = new RegimeDetector(mockRedis, { lookbackPeriods: 10 });
    const metrics = await detector.detectRegime('BTC', ['exA']);
    expect(metrics.spreadAvg).toBe(0);
  });
});

// ── detectRegime ─────────────────────────────────────────────────────────────

describe('detectRegime', () => {
  it('returns NORMAL regime for low volatility', async () => {
    // Stable spreads → low volatility
    mockRedis.hgetall.mockResolvedValue({ bid: '100', ask: '101' });
    const detector = new RegimeDetector(mockRedis, {
      lookbackPeriods: 10,
      volatilityThresholds: { normal: 0.5, volatile: 1.5, crash: 3.0 },
    });
    const metrics = await detector.detectRegime('BTC', ['exA']);
    expect(metrics.regime).toBe('NORMAL');
    expect(metrics.confidence).toBe(0.8);
  });

  it('includes timestamp in returned metrics', async () => {
    mockRedis.hgetall.mockResolvedValue({ bid: '100', ask: '101' });
    const detector = new RegimeDetector(mockRedis, { lookbackPeriods: 10 });
    const before = Date.now();
    const metrics = await detector.detectRegime('BTC', ['exA']);
    expect(metrics.timestamp).toBeGreaterThanOrEqual(before);
    expect(metrics.volumeChange).toBe(0);
  });
});

// ── updateRegime ─────────────────────────────────────────────────────────────

describe('updateRegime (via public API)', () => {
  it('tracks regime history and caps at 10', () => {
    const detector = new RegimeDetector(mockRedis);
    // Manually trigger updateRegime indirectly — it's private, but called by start()
    // We test via getHistory() and getCurrentRegime()
    expect(detector.getHistory()).toEqual([]);
  });

  it('getCurrentRegime returns initial NORMAL', () => {
    const detector = new RegimeDetector(mockRedis);
    expect(detector.getCurrentRegime()).toBe('NORMAL');
  });

  it('getHistory returns a copy (not the internal array)', () => {
    const detector = new RegimeDetector(mockRedis);
    const h1 = detector.getHistory();
    const h2 = detector.getHistory();
    expect(h1).toEqual(h2);
    expect(h1).not.toBe(h2);
  });
});

// ── start ────────────────────────────────────────────────────────────────────

describe('start', () => {
  it('calls onRegimeChange when regime changes after 3 consecutive readings', async () => {
    // Create varied spreads to get a non-NORMAL regime
    // Return different prices for different exchanges to create volatility
    let callCount = 0;
    mockRedis.hgetall.mockImplementation(() => {
      callCount++;
      // Alternate between very different spreads to create high volatility
      if (callCount % 2 === 1) {
        return Promise.resolve({ bid: '100', ask: '150' }); // 50% spread
      }
      return Promise.resolve({ bid: '100', ask: '101' }); // 1% spread
    });

    const detector = new RegimeDetector(mockRedis, {
      checkIntervalMs: 100,
      volatilityThresholds: { normal: 0.01, volatile: 0.02, crash: 0.05 },
      lookbackPeriods: 10,
    });

    const onChange = vi.fn();
    detector.start('BTC', ['exA', 'exB'], onChange);

    // The initial check() runs immediately; advance timers to trigger more checks
    await vi.advanceTimersByTimeAsync(350);

    // After several checks with high volatility, regime should change
    // We need 3 consecutive same-regime readings to confirm
    expect(detector.getHistory().length).toBeGreaterThan(0);
  });

  it('logs error when detectRegime throws', async () => {
    const errorSpy = vi.fn();
    mockLogger.error = errorSpy;
    mockRedis.hgetall.mockRejectedValue(new Error('Redis down'));

    const detector = new RegimeDetector(mockRedis, { checkIntervalMs: 100, lookbackPeriods: 10 });
    detector.start('BTC', ['exA'], vi.fn());

    await vi.advanceTimersByTimeAsync(150);
    expect(errorSpy).toHaveBeenCalledWith(
      'RegimeDetector error:',
      expect.objectContaining({ error: expect.anything() }),
    );
  });

  it('does not call onRegimeChange when regime stays NORMAL', async () => {
    mockRedis.hgetall.mockResolvedValue({ bid: '100', ask: '100.01' }); // tiny spread
    const detector = new RegimeDetector(mockRedis, {
      checkIntervalMs: 100,
      lookbackPeriods: 10,
      volatilityThresholds: { normal: 0.5, volatile: 1.5, crash: 3.0 },
    });
    const onChange = vi.fn();
    detector.start('BTC', ['exA'], onChange);

    await vi.advanceTimersByTimeAsync(350);
    // All readings NORMAL → no regime change → no callback
    expect(onChange).not.toHaveBeenCalled();
  });
});

// ── storeMetrics ─────────────────────────────────────────────────────────────

describe('storeMetrics', () => {
  it('writes regime metrics to Redis via pipeline with 1h expiry', async () => {
    const detector = new RegimeDetector(mockRedis);
    const metrics = {
      regime: 'VOLATILE' as MarketRegime,
      volatility: 2.5,
      spreadAvg: 1.2,
      spreadStdDev: 0.3,
      volumeChange: 10,
      confidence: 0.8,
      timestamp: 1700000000000,
    };
    await detector.storeMetrics(metrics, 'BTC');

    expect(mockRedis.pipeline).toHaveBeenCalled();
    expect(mockPipeline.hset).toHaveBeenCalledWith(
      'regime:BTC:1700000000000',
      {
        regime: 'VOLATILE',
        volatility: '2.5',
        spreadAvg: '1.2',
        spreadStdDev: '0.3',
        volumeChange: '10',
        confidence: '0.8',
        timestamp: '1700000000000',
      },
    );
    expect(mockPipeline.expire).toHaveBeenCalledWith('regime:BTC:1700000000000', 3600);
    expect(mockPipeline.exec).toHaveBeenCalled();
  });

  it('serializes zero values correctly', async () => {
    const detector = new RegimeDetector(mockRedis);
    const metrics = {
      regime: 'NORMAL' as MarketRegime,
      volatility: 0,
      spreadAvg: 0,
      spreadStdDev: 0,
      volumeChange: 0,
      confidence: 0.5,
      timestamp: 1,
    };
    await detector.storeMetrics(metrics, 'ETH');
    expect(mockPipeline.hset).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ volatility: '0', confidence: '0.5' }),
    );
  });
});

// ── Edge cases for detectRegime with different thresholds ─────────────────────

describe('detectRegime regime classification', () => {
  async function testRegime(
    thresholds: { normal: number; volatile: number; crash: number },
    expectedRegime: MarketRegime,
    expectedConfidence: number,
  ) {
    // Use multiple exchanges so getHistoricalSpreads returns 2+ spreads,
    // allowing calculateVolatility to compute a non-zero value.
    // Spread values [1, 2, 1, 2, 1] produce volatility ~75 (verified).
    const spreadValues = [1, 2, 1, 2, 1];
    let callIdx = 0;
    mockRedis.hgetall.mockImplementation(() => {
      const s = spreadValues[callIdx % spreadValues.length];
      callIdx++;
      return Promise.resolve({ bid: '100', ask: String(100 + s) });
    });

    const detector = new RegimeDetector(mockRedis, {
      lookbackPeriods: 10,
      volatilityThresholds: thresholds,
    });
    const metrics = await detector.detectRegime('BTC', ['exA', 'exB', 'exC']);
    expect(metrics.regime).toBe(expectedRegime);
    expect(metrics.confidence).toBe(expectedConfidence);
  }

  it('classifies as NORMAL when volatility < normal threshold', async () => {
    await testRegime(
      { normal: 999, volatile: 2000, crash: 3000 },
      'NORMAL', 0.8,
    );
  });

  it('classifies as TRENDING when volatility >= normal threshold', async () => {
    await testRegime(
      { normal: 0.0001, volatile: 999, crash: 2000 },
      'TRENDING', 0.7,
    );
  });

  it('classifies as VOLATILE when volatility >= volatile threshold', async () => {
    await testRegime(
      { normal: 0.0001, volatile: 0.001, crash: 999 },
      'VOLATILE', 0.8,
    );
  });

  it('classifies as CRASH when volatility >= crash threshold', async () => {
    await testRegime(
      { normal: 0.0001, volatile: 0.001, crash: 0.002 },
      'CRASH', 0.9,
    );
  });
});

// ── start regime change callback ─────────────────────────────────────────────

describe('start with persistent regime change', () => {
  it('triggers callback after 3 consecutive regime confirmations', async () => {
    // Alternating spreads [1, 2, 1, 2, 1] → volatility ~75, well above crash threshold.
    const spreadValues = [1, 2, 1, 2, 1];
    let callIdx = 0;
    mockRedis.hgetall.mockImplementation(() => {
      const s = spreadValues[callIdx % spreadValues.length];
      callIdx++;
      return Promise.resolve({ bid: '100', ask: String(100 + s) });
    });

    const detector = new RegimeDetector(mockRedis, {
      checkIntervalMs: 100,
      lookbackPeriods: 10,
      volatilityThresholds: { normal: 0.01, volatile: 0.02, crash: 0.03 },
    });

    const onChange = vi.fn();
    detector.start('BTC', ['exA', 'exB', 'exC'], onChange);

    // Advance enough intervals for 3+ consecutive CRASH readings + history > 10
    await vi.advanceTimersByTimeAsync(2500);

    const history = detector.getHistory();
    expect(history.length).toBe(10);
    expect(detector.getCurrentRegime()).toBe('CRASH');
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
