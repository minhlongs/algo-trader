import { describe, it, expect } from 'vitest';
import { RiskManagedKellyStrategy } from '../05-risk-managed-kelly-strategy';

describe('examples::05-risk-managed-kelly-strategy', () => {
  it('loads RiskManagedKellyStrategy', () => {
    expect(typeof RiskManagedKellyStrategy).toBe('function');
  });
});

