import { describe, it, expect } from 'vitest';
import {
  shouldTakeProfit, shouldStopLoss, isExpired, isInCooldown,
  calcUnrealizedPnl, checkPositionExits,
} from '../strategy-position-manager';

function pos(o: Partial<{ side: 'yes'|'no'; entryPrice: number; sizeUsdc: number; openedAt: number; tokenId: string }> = {}): any {
  return { tokenId: o.tokenId ?? 't1', conditionId: 'c1', side: o.side ?? 'yes', entryPrice: o.entryPrice ?? 0.5, sizeUsdc: o.sizeUsdc ?? 100, orderId: 'o1', openedAt: o.openedAt ?? Date.now() };
}

describe('strategy-position-manager::shouldTakeProfit', () => {
  it('YES at +5%', () => expect(shouldTakeProfit(0.5, 0.525, 'yes', 0.05)).toBe(true));
  it('YES below threshold', () => expect(shouldTakeProfit(0.5, 0.52, 'yes', 0.05)).toBe(false));
  it('NO at -5%', () => expect(shouldTakeProfit(0.5, 0.475, 'no', 0.05)).toBe(true));
  it('NO not triggered on small move', () => expect(shouldTakeProfit(0.5, 0.49, 'no', 0.05)).toBe(false));
});

describe('strategy-position-manager::shouldStopLoss', () => {
  it('YES at -8% triggers SL', () => expect(shouldStopLoss(0.5, 0.46, 'yes', 0.08)).toBe(true));
  it('YES not triggered on small drop', () => expect(shouldStopLoss(0.5, 0.49, 'yes', 0.04)).toBe(false));
  it('NO at +8% triggers SL with slPct=0.08', () => expect(shouldStopLoss(0.5, 0.56, 'no', 0.08)).toBe(true));
  it('NO not triggered on small rise with 6% rise and 8% SL', () => expect(shouldStopLoss(0.5, 0.53, 'no', 0.08)).toBe(false));
});

describe('strategy-position-manager::isExpired', () => {
  it('not expired when within window', () => {
    const now = Date.now();
    expect(isExpired(now, 60000)).toBe(false);
  });
  it('expired when beyond maxHoldMs', () => {
    const past = Date.now() - 120000;
    expect(isExpired(past, 60000)).toBe(true);
  });
  it('exactly at boundary is expired', () => {
    const boundary = Date.now() - 60001;
    expect(isExpired(boundary, 60000)).toBe(true);
  });
  it('zero maxHoldMs expires immediately in past', () => {
    const past = Date.now() - 1000;
    expect(isExpired(past, 0)).toBe(true);
  });
});

describe('strategy-position-manager::isInCooldown', () => {
  it('false when no previous trade time', () => {
    expect(isInCooldown(undefined, 60000)).toBe(false);
  });
  it('false when cooldown elapsed', () => {
    const old = Date.now() - 120000;
    expect(isInCooldown(old, 60000)).toBe(false);
  });
  it('true when within cooldown window', () => {
    const recent = Date.now() - 30000;
    expect(isInCooldown(recent, 60000)).toBe(true);
  });
});

describe('strategy-position-manager::calcUnrealizedPnl', () => {
  it('YES profit when price rises', () => {
    expect(calcUnrealizedPnl(pos({ side: 'yes', entryPrice: 0.4, currentPrice: 0.7, sizeUsdc: 100 }), 0.7)).toBeCloseTo(75, 5);
  });
  it('YES loss when price falls', () => {
    expect(calcUnrealizedPnl(pos({ side: 'yes', entryPrice: 0.7, currentPrice: 0.3, sizeUsdc: 100 }), 0.3)).toBeCloseTo(-57.14, 1);
  });
  it('NO profit when price falls', () => {
    expect(calcUnrealizedPnl(pos({ side: 'no', entryPrice: 0.4, currentPrice: 0.1 }), 0.1)).toBeGreaterThan(0);
  });
  it('zero PnL at entry', () => {
    expect(calcUnrealizedPnl(pos({ side: 'yes', entryPrice: 0.5, currentPrice: 0.5 }), 0.5)).toBeCloseTo(0, 5);
  });
});

describe('strategy-position-manager::checkPositionExits', () => {
  it('returns positions to close and keep', () => {
    const positions = [
      pos({ side: 'yes', entryPrice: 0.5, openedAt: Date.now() - 3600000 }),
      pos({ side: 'yes', entryPrice: 0.5, openedAt: Date.now() - 3600000, tokenId: 't2' }),
    ];
    const priceMap = new Map([['t1', 0.6], ['t2', 0.6]]);
    const result = checkPositionExits(positions, (p: any) => priceMap.get(p.tokenId) ?? 0.5, {
      tpPct: 0.05, slPct: 0.05, maxHoldMs: 7200000, strategyName: 'test',
    });
    expect(result.toClose.length + result.toKeep.length).toBe(2);
  });
});
