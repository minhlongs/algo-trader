import { describe, it, expect } from 'vitest';
import { calcReturns, calcVariance, calcVarianceRatio, classifyRegime, detectSwitch, updateEma, createRegimeSwitchDetectorTick } from '../regime-switch-detector-v2';

describe('regime-switch-detector-v2::calcReturns', () => {
  it('is a defined function', () => {
    expect(typeof calcReturns).toBe('function');
  });
});

describe('regime-switch-detector-v2::calcVariance', () => {
  it('is a defined function', () => {
    expect(typeof calcVariance).toBe('function');
  });
});

describe('regime-switch-detector-v2::calcVarianceRatio', () => {
  it('is a defined function', () => {
    expect(typeof calcVarianceRatio).toBe('function');
  });
});

describe('regime-switch-detector-v2::classifyRegime', () => {
  it('is a defined function', () => {
    expect(typeof classifyRegime).toBe('function');
  });
});

describe('regime-switch-detector-v2::detectSwitch', () => {
  it('is a defined function', () => {
    expect(typeof detectSwitch).toBe('function');
  });
});

describe('regime-switch-detector-v2::updateEma', () => {
  it('is a defined function', () => {
    expect(typeof updateEma).toBe('function');
  });
});

describe('regime-switch-detector-v2::createRegimeSwitchDetectorTick', () => {
  it('is a defined function', () => {
    expect(typeof createRegimeSwitchDetectorTick).toBe('function');
  });
});
