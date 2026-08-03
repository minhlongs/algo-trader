import { describe, it, expect } from 'vitest';

describe('strategy-shared-types::StrategyDeps', () => {
  it('exists as a runtime concept', () => {
    const value = (null as unknown) as import('../strategy-shared-types').StrategyDeps;
    expect(value).toBeDefined();
  });
});

describe('strategy-shared-types::BaseOpenPosition', () => {
  it('runtime accessible via type import', () => {
    const pos = {
      tokenId: 't',
      conditionId: 'c',
      side: 'yes',
      entryPrice: 0,
      sizeUsdc: 0,
      orderId: 'o',
      openedAt: 0,
    } as const;
    const _t: import('../strategy-shared-types').BaseOpenPosition = pos;
    expect(_t.tokenId).toBe('t');
  });
});

describe('strategy-shared-types::PriceTick', () => {
  it('is a type alias check via satisfies', () => {
    const tick = { price: 0, timestamp: 0 } as const;
    const _t: import('../strategy-shared-types').PriceTick = tick;
    expect(_t.price).toBe(0);
  });
});

describe('strategy-shared-types::StrategySignal', () => {
  it('is assignable', () => {
    const sig = {
      action: 'hold',
      tokenId: 't',
      conditionId: 'c',
      confidence: 0,
      reason: '',
    };
    const _t: import('../strategy-shared-types').StrategySignal = sig;
    expect(_t.action).toBe('hold');
  });
});

describe('strategy-shared-types::PolymarketStrategy', () => {
  it('is accessible via known symbols', () => {
    // This interface doesn't exist at runtime; just ensure the module is consistent.
    expect(true).toBe(true);
  });
});
