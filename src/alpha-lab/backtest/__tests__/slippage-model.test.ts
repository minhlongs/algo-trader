import { describe, it, expect } from 'vitest';
import { AlmgrenChrissModel } from '../slippage-model';

describe('AlmgrenChrissModel Market Impact', () => {
  it('returns 0 slippage when daily volume or order volume is non-positive', () => {
    const model = new AlmgrenChrissModel();
    expect(model.calculateSlippage(100, 0)).toBe(0);
    expect(model.calculateSlippage(100, -10)).toBe(0);
    expect(model.calculateSlippage(0, 1000)).toBe(0);
    expect(model.calculateSlippage(-5, 1000)).toBe(0);
  });

  it('calculates linear permanent and square root temporary slippage with defaults', () => {
    const model = new AlmgrenChrissModel();
    // orderVolume: 100, dailyVolume: 10000 => participationRate: 0.01
    // default permanent: 0.1 * 0.01 = 0.001
    // default temporary: 0.5 * sqrt(0.01) = 0.5 * 0.1 = 0.05
    // total: 0.051
    const slippage = model.calculateSlippage(100, 10000);
    expect(slippage).toBeCloseTo(0.051, 5);
  });

  it('supports numeric constructor argument for backward compatibility', () => {
    const model = new AlmgrenChrissModel(0.2, 0.4);
    expect(model.getPermanentImpact()).toBe(0.2);
    expect(model.getTemporaryImpact()).toBe(0.4);

    const slippage = model.calculateSlippage(100, 10000);
    // 0.2 * 0.01 + 0.4 * 0.1 = 0.002 + 0.04 = 0.042
    expect(slippage).toBeCloseTo(0.042, 5);
  });

  it('scales slippage with custom volatility parameter', () => {
    const model = new AlmgrenChrissModel({ permanentImpact: 0.1, temporaryImpact: 0.5, volatility: 2.0 });
    const normalSlippage = model.calculateSlippage(100, 10000, 1.0);
    const highVolSlippage = model.calculateSlippage(100, 10000, 2.0);

    expect(highVolSlippage).toBeCloseTo(normalSlippage * 2, 5);
  });

  it('computes detailed slippage breakdown correctly', () => {
    const model = new AlmgrenChrissModel({ permanentImpact: 0.05, temporaryImpact: 0.2 });
    const breakdown = model.calculateBreakdown(250, 10000);

    expect(breakdown.participationRate).toBe(0.025);
    expect(breakdown.permanentSlippage).toBeCloseTo(0.05 * 0.025, 5);
    expect(breakdown.temporarySlippage).toBeCloseTo(0.2 * Math.sqrt(0.025), 5);
    expect(breakdown.totalSlippage).toBeCloseTo(
      breakdown.permanentSlippage + breakdown.temporarySlippage,
      5
    );
  });

  it('returns empty breakdown for invalid volumes', () => {
    const model = new AlmgrenChrissModel();
    const empty = model.calculateBreakdown(0, 0);
    expect(empty.totalSlippage).toBe(0);
    expect(empty.participationRate).toBe(0);
  });
});
