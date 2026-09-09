import { describe, it, expect } from 'vitest';
import * as api from '../research-agent-api';

describe('research-agent-api exports', () => {
  it('exports all expected API functions', () => {
    expect(typeof api.runExperiment).toBe('function');
    expect(typeof api.evaluateWalkForward).toBe('function');
    expect(typeof api.evaluate).toBe('function');
    expect(typeof api.evaluateAlpha).toBe('function');
    expect(typeof api.runAllBaselines).toBe('function');
    expect(typeof api.batchLabel).toBe('function');
    expect(typeof api.classifyRegime).toBe('function');
  });
});
