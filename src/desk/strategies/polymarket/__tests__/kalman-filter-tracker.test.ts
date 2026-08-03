import { describe, it, expect } from 'vitest';
import { DEFAULT_CONFIG, KalmanFilter1D, calcResidualZScore, createKalmanFilterTrackerTick } from '../kalman-filter-tracker';

describe('kalman-filter-tracker::DEFAULT_CONFIG', () => {
  it('has expected default values', () => {
    expect(DEFAULT_CONFIG.processNoise).toBeGreaterThan(0);
    expect(DEFAULT_CONFIG.measurementNoise).toBeGreaterThan(0);
    expect(DEFAULT_CONFIG.entryStdDev).toBeGreaterThan(0);
    expect(DEFAULT_CONFIG.minResidual).toBeGreaterThan(0);
    expect(DEFAULT_CONFIG.baseSizeUsdc).toBeGreaterThan(0);
  });
});

describe('kalman-filter-tracker::KalmanFilter1D', () => {
  it('initializes with default state 0.5', () => {
    const kf = new KalmanFilter1D(0.01, 0.1);
    expect(kf.getState()).toBeCloseTo(0.5, 5);
  });
  it('initializes with provided state', () => {
    const kf = new KalmanFilter1D(0.01, 0.1, 0.5);
    expect(kf.getState()).toBeCloseTo(0.5, 5);
  });
  it('state moves toward observation after update', () => {
    const kf = new KalmanFilter1D(0.01, 0.1, 0);
    kf.update(1.0);
    const s = kf.getState();
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThan(1.0);
  });
  it('state converges to repeated observation', () => {
    const kf = new KalmanFilter1D(0.001, 0.01, 0);
    for (let i = 0; i < 50; i++) kf.update(0.8);
    expect(kf.getState()).toBeCloseTo(0.8, 1);
  });
  it('covariance stays finite', () => {
    const kf = new KalmanFilter1D(0.01, 0.1);
    kf.update(0.5);
    expect(Number.isFinite(kf.getCovariance())).toBe(true);
    expect(kf.getCovariance()).toBeGreaterThan(0);
  });
});

describe('kalman-filter-tracker::calcResidualZScore', () => {
  it('returns 0 for empty history', () => {
    expect(calcResidualZScore(0.5, [])).toBe(0);
  });
  it('returns 0 for single-element history', () => {
    expect(calcResidualZScore(0.5, [0.5])).toBe(0);
  });
  it('returns 0 for fewer than 3 points', () => {
    expect(calcResidualZScore(0.8, [0.7, 0.7])).toBe(0);
  });
  it('returns 0 for zero-variance with 3+ points', () => {
  expect(calcResidualZScore(1.0, [1, 1, 1])).toBeCloseTo(0, 0);
  });
  it('returns positive z-score when residual is high', () => {
    const hist = [0.01, 0.02, 0.01, 0.02, 0.01];
    const r = calcResidualZScore(0.1, hist);
    expect(r).toBeGreaterThan(0);
  });
  it('returns finite number', () => {
    const r = calcResidualZScore(0.05, [0.01, 0.02, 0.01, 0.02, 0.01]);
    expect(Number.isFinite(r)).toBe(true);
  });
});

describe('kalman-filter-tracker::createKalmanFilterTrackerTick', () => {
  it('returns a tick function from deps', () => {
    const tick = createKalmanFilterTrackerTick({
      clob: { getOrderBook: async () => ({ bids: [], asks: [] }) },
      orders: {},
      bus: { publish: async () => {} },
      gamma: { getTrending: async () => [], getEvents: async () => ({ markets: [] }) },
    } as any);
    expect(typeof tick).toBe('function');
  });
});
