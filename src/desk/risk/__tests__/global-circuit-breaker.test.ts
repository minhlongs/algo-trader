import { describe, expect, it } from 'vitest';
import { GlobalCircuitBreaker } from '../global-circuit-breaker';

describe('global-circuit-breaker 5-Tier State Machine & Triggers', () => {
  it('remains in NORMAL tier during low drawdown (< 5%) and correlation <= 0.85', () => {
    const cb = new GlobalCircuitBreaker(100000);
    const s = cb.evaluate(98000, 0.3);
    expect(s.tier).toBe('NORMAL');
    expect(cb.getTier()).toBe('NORMAL');
    expect(cb.getSizingMultiplier()).toBe(1.0);
    expect(cb.getLiquidationFraction()).toBe(0.0);
  });

  it('transitions to ALERT tier upon 5% drawdown or high correlation (> 0.85)', () => {
    const cb = new GlobalCircuitBreaker(100000);
    const s = cb.evaluate(94000);
    expect(s.tier).toBe('ALERT');
    expect(s.peakToTroughDrawdown).toBeCloseTo(0.06, 2);
    expect(cb.getSizingMultiplier()).toBe(0.75);
  });

  it('transitions to ALERT tier upon correlation spike even at 0% drawdown', () => {
    const cb = new GlobalCircuitBreaker(100000);
    const s = cb.evaluate(100000, 0.851);
    expect(s.tier).toBe('ALERT');
    expect(s.reason).toContain('Correlation spike');
  });

  it('transitions to REDUCE tier upon 10% drawdown', () => {
    const cb = new GlobalCircuitBreaker(100000);
    const s = cb.evaluate(89000);
    expect(s.tier).toBe('REDUCE');
    expect(cb.getSizingMultiplier()).toBe(0.5);
    expect(cb.getLiquidationFraction()).toBe(0.25);
  });

  it('transitions to HALT tier upon 15% drawdown', () => {
    const cb = new GlobalCircuitBreaker(100000);
    const s = cb.evaluate(84000);
    expect(s.tier).toBe('HALT');
    expect(cb.getSizingMultiplier()).toBe(0.0);
    expect(cb.getLiquidationFraction()).toBe(0.5);
  });

  it('transitions to HARD_STOP terminal tier upon 20% drawdown breach', () => {
    const cb = new GlobalCircuitBreaker(100000);
    const s = cb.evaluate(79000);
    expect(s.tier).toBe('HARD_STOP');
    expect(s.reason).toContain('Terminal drawdown breach');
    expect(cb.getSizingMultiplier()).toBe(0.0);
    expect(cb.getLiquidationFraction()).toBe(1.0);
  });

  it('boundary: exact drawdown percentages map to correct tiers', () => {
    const cb = new GlobalCircuitBreaker(100000);
    expect(cb.evaluate(95000).tier).toBe('ALERT'); // 5.0%
    expect(cb.evaluate(90000).tier).toBe('REDUCE'); // 10.0%
    expect(cb.evaluate(85000).tier).toBe('HALT'); // 15.0%
    expect(cb.evaluate(80000).tier).toBe('HARD_STOP'); // 20.0%
  });

  it('high water mark ratchets up when NAV increases', () => {
    const cb = new GlobalCircuitBreaker(100000);
    cb.evaluate(120000);
    expect(cb.getHighWaterMark()).toBe(120000);
    // Drawdown from 120000 to 110000 is 10k/120k = 8.33% -> ALERT
    const s = cb.evaluate(110000);
    expect(s.tier).toBe('ALERT');
    expect(s.peakToTroughDrawdown).toBeCloseTo(0.0833, 2);
  });

  it('resets high water mark and tier cleanly on manual reset', () => {
    const cb = new GlobalCircuitBreaker(100000);
    cb.evaluate(75000);
    expect(cb.getTier()).toBe('HARD_STOP');

    cb.reset(100000);
    expect(cb.getTier()).toBe('NORMAL');
    expect(cb.getHighWaterMark()).toBe(100000);
  });
});
