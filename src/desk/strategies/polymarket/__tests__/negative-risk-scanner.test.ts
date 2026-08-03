import { describe, it, expect } from 'vitest';
import { getBestAsk, getBestBid, usdcToTokens, calcExitValue, createNegativeRiskScannerTick } from '../negative-risk-scanner';

describe('negative-risk-scanner::getBestAsk', () => {
  it('is a defined function', () => {
    expect(typeof getBestAsk).toBe('function');
  });
});

describe('negative-risk-scanner::getBestBid', () => {
  it('is a defined function', () => {
    expect(typeof getBestBid).toBe('function');
  });
});

describe('negative-risk-scanner::usdcToTokens', () => {
  it('is a defined function', () => {
    expect(typeof usdcToTokens).toBe('function');
  });
});

describe('negative-risk-scanner::calcExitValue', () => {
  it('is a defined function', () => {
    expect(typeof calcExitValue).toBe('function');
  });
});

describe('negative-risk-scanner::createNegativeRiskScannerTick', () => {
  it('is a defined function', () => {
    expect(typeof createNegativeRiskScannerTick).toBe('function');
  });
});
