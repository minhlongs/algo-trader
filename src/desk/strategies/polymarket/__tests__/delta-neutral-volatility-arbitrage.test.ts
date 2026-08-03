import { describe, it, expect } from 'vitest';
import { DeltaNeutralVolatilityArbitrage } from '../delta-neutral-volatility-arbitrage';

describe('delta-neutral-volatility-arbitrage::DeltaNeutralVolatilityArbitrage', () => {
  it('is a constructor and runtime accessible', () => {
    expect(typeof DeltaNeutralVolatilityArbitrage).toBe('function');
    expect(() => new DeltaNeutralVolatilityArbitrage() as any).not.toThrow();
  });
});
