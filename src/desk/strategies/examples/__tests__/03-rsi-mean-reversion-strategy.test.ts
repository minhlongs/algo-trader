import { describe, it, expect } from 'vitest';
import { RsiMeanReversionStrategy } from '../03-rsi-mean-reversion-strategy';

describe('examples::03-rsi-mean-reversion-strategy', () => {
  it('loads RsiMeanReversionStrategy', () => {
    expect(typeof RsiMeanReversionStrategy).toBe('function');
  });
});

