import { describe, it, expect } from 'vitest';
import { BasePolymarketStrategy } from '../base-polymarket-strategy';

describe('base-polymarket-strategy::BasePolymarketStrategy', () => {
  it('is a constructor (abstract class)', () => {
    expect(typeof BasePolymarketStrategy).toBe('function');
  });
});
