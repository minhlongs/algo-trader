import { describe, it, expect } from 'vitest';
import { SmaCrossoverStrategy } from '../02-sma-crossover-strategy';

describe('examples::02-sma-crossover-strategy', () => {
  it('loads SmaCrossoverStrategy', () => {
    expect(typeof SmaCrossoverStrategy).toBe('function');
  });
});

