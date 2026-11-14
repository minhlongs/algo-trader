/**
 * Pins every number the queue model is built on, so a later tuning pass cannot
 * silently change what a paper fill means.
 *
 * The acceptance contract: back-of-queue, 15–25% cancel-volume deduction,
 * log-normal cancel latency (median 35 ms / p99 180 ms), and the +150 ms crypto
 * taker delay.
 */

import { describe, it, expect } from 'vitest';
import {
  CANCEL_LATENCY_MEDIAN_MS,
  CANCEL_LATENCY_P99_MS,
  CANCEL_LATENCY_SIGMA,
  CANCEL_VOLUME_FRACTION_MAX,
  CANCEL_VOLUME_FRACTION_MIN,
  CRYPTO_TAKER_MATCH_DELAY_MS,
  buildQueueModel,
  createSeededRandom,
  estimateMakerQueue,
  sampleCancelLatencyMs,
  sampleCancelVolumeFraction,
  simulateMakerFill,
  takerMatchDelayMsForTier,
} from '../../src/desk/polymarket/queue-aware-fill-simulator';

const BOOK = [
  { price: '0.48', size: '400' },
  { price: '0.50', size: '100' },
  { price: '0.52', size: '250' },
];

describe('venue constants', () => {
  it('states the cancel-volume band as 15–25%', () => {
    expect(CANCEL_VOLUME_FRACTION_MIN).toBe(0.15);
    expect(CANCEL_VOLUME_FRACTION_MAX).toBe(0.25);
  });

  it('states cancel latency as median 35 ms / p99 180 ms', () => {
    expect(CANCEL_LATENCY_MEDIAN_MS).toBe(35);
    expect(CANCEL_LATENCY_P99_MS).toBe(180);
  });

  it('states the crypto taker delay as 150 ms', () => {
    expect(CRYPTO_TAKER_MATCH_DELAY_MS).toBe(150);
  });

  it('derives sigma from the median and p99 rather than hardcoding it', () => {
    expect(CANCEL_LATENCY_SIGMA).toBeCloseTo(Math.log(180 / 35) / 2.3263478740408408, 12);
    expect(CANCEL_LATENCY_MEDIAN_MS * Math.exp(CANCEL_LATENCY_SIGMA * 2.3263478740408408))
      .toBeCloseTo(180, 6);
  });
});

describe('sampleCancelLatencyMs', () => {
  it('is deterministic for a given seed', () => {
    const a = createSeededRandom(7);
    const b = createSeededRandom(7);
    const first = Array.from({ length: 5 }, () => sampleCancelLatencyMs(a));
    const second = Array.from({ length: 5 }, () => sampleCancelLatencyMs(b));
    expect(first).toEqual(second);
  });

  it('lands near the median 35 ms and the p99 180 ms over a large sample', () => {
    const rng = createSeededRandom(20261112);
    const draws = Array.from({ length: 20000 }, () => sampleCancelLatencyMs(rng)).sort(
      (x, y) => x - y,
    );
    const median = draws[Math.floor(draws.length * 0.5)]!;
    const p99 = draws[Math.floor(draws.length * 0.99)]!;
    expect(median).toBeGreaterThan(33);
    expect(median).toBeLessThan(37);
    expect(p99).toBeGreaterThan(165);
    expect(p99).toBeLessThan(195);
  });

  it('never returns a negative latency', () => {
    const rng = createSeededRandom(11);
    for (let i = 0; i < 500; i++) expect(sampleCancelLatencyMs(rng)).toBeGreaterThan(0);
  });
});

describe('sampleCancelVolumeFraction', () => {
  it('stays inside the 15–25% band for every draw', () => {
    const rng = createSeededRandom(99);
    for (let i = 0; i < 500; i++) {
      const fraction = sampleCancelVolumeFraction(rng);
      expect(fraction).toBeGreaterThanOrEqual(0.15);
      expect(fraction).toBeLessThanOrEqual(0.25);
    }
  });

  it('maps the extremes of the draw to the extremes of the band', () => {
    expect(sampleCancelVolumeFraction(() => 0)).toBe(0.15);
    expect(sampleCancelVolumeFraction(() => 1)).toBe(0.25);
    expect(sampleCancelVolumeFraction(() => Number.NaN)).toBe(0.15);
  });
});

describe('takerMatchDelayMsForTier', () => {
  it('charges crypto contracts the 150 ms venue delay', () => {
    expect(takerMatchDelayMsForTier('crypto')).toBe(150);
  });

  it('charges standard contracts no extra delay', () => {
    expect(takerMatchDelayMsForTier('standard')).toBe(0);
  });
});

describe('buildQueueModel', () => {
  it('is reproducible from a seed', () => {
    const a = buildQueueModel({ tier: 'crypto', rng: createSeededRandom(3) });
    const b = buildQueueModel({ tier: 'crypto', rng: createSeededRandom(3) });
    expect(a).toEqual(b);
    expect(a.takerMatchDelayMs).toBe(150);
  });

  it('defaults to the standard tier', () => {
    expect(buildQueueModel({ rng: createSeededRandom(3) }).takerMatchDelayMs).toBe(0);
  });
});

describe('estimateMakerQueue', () => {
  it('counts the size resting at our exact price as queue ahead', () => {
    const queue = estimateMakerQueue({
      levels: BOOK,
      limitPrice: 0.5,
      cancelVolumeFraction: 0.2,
      cancelLatencyMs: 35,
    });
    expect(queue.queueAheadSize).toBe(100);
    expect(queue.effectiveQueueAheadSize).toBeCloseTo(80, 9);
  });

  it('reports no queue when nothing rests at our price', () => {
    const queue = estimateMakerQueue({
      levels: BOOK,
      limitPrice: 0.51,
      cancelVolumeFraction: 0.2,
      cancelLatencyMs: 35,
    });
    expect(queue.queueAheadSize).toBe(0);
    expect(queue.effectiveQueueAheadSize).toBe(0);
  });

  it('clamps an out-of-band cancellation fraction into the unit interval', () => {
    const queue = estimateMakerQueue({
      levels: BOOK,
      limitPrice: 0.5,
      cancelVolumeFraction: 1.8,
      cancelLatencyMs: -5,
    });
    expect(queue.effectiveQueueAheadSize).toBe(0);
    expect(queue.cancelLatencyMs).toBe(0);
  });
});

describe('simulateMakerFill (back of queue)', () => {
  const queue = estimateMakerQueue({
    levels: BOOK,
    limitPrice: 0.5,
    cancelVolumeFraction: 0.2,
    cancelLatencyMs: 35,
  });

  it('fills nothing while the arriving flow cannot clear the queue ahead', () => {
    // 0.5 shares/ms * 35 ms = 17.5 shares arriving, against 80 shares ahead.
    const fill = simulateMakerFill({ ourSize: 50, queue, aggressiveVolumePerMs: 0.5 });
    expect(fill.queueReached).toBe(false);
    expect(fill.filledSize).toBe(0);
    expect(fill.arrivedDuringCancelWindow).toBeCloseTo(17.5, 9);
    expect(fill.effectiveQueueAheadSize).toBeCloseTo(80, 9);
  });

  it('fills only the flow that clears the queue, not the whole order', () => {
    // 4 shares/ms * 35 ms = 140 arriving, minus 80 ahead = 60 clearable.
    const fill = simulateMakerFill({ ourSize: 50, queue, aggressiveVolumePerMs: 4 });
    expect(fill.queueReached).toBe(true);
    expect(fill.filledSize).toBe(50);
  });

  it('caps the fill at the clearable volume when our order is larger', () => {
    // 3 shares/ms * 35 ms = 105 arriving, minus 80 ahead = 25 clearable of 500.
    const fill = simulateMakerFill({ ourSize: 500, queue, aggressiveVolumePerMs: 3 });
    expect(fill.filledSize).toBeCloseTo(25, 9);
  });

  it('treats the queue-ahead subtraction as the back-of-queue property', () => {
    const noQueue = { ...queue, queueAheadSize: 0, effectiveQueueAheadSize: 0 };
    const withQueue = simulateMakerFill({ ourSize: 50, queue, aggressiveVolumePerMs: 1 });
    const without = simulateMakerFill({ ourSize: 50, queue: noQueue, aggressiveVolumePerMs: 1 });
    expect(without.filledSize).toBeGreaterThan(withQueue.filledSize);
    expect(without.filledSize).toBe(35);
  });
});
