import { describe, it, expect } from 'vitest';
import { calcSpread, calcBollingerBands, calcSpreadZScore, calcPairCorr, createPairsStatArbTick } from '../pairs-stat-arb';

describe('pairs-stat-arb::calcSpread', () => {
  it('is a defined function', () => {
    expect(typeof calcSpread).toBe('function');
  });
});

describe('pairs-stat-arb::calcBollingerBands', () => {
  it('is a defined function', () => {
    expect(typeof calcBollingerBands).toBe('function');
  });
});

describe('pairs-stat-arb::calcSpreadZScore', () => {
  it('is a defined function', () => {
    expect(typeof calcSpreadZScore).toBe('function');
  });
});

describe('pairs-stat-arb::calcPairCorr', () => {
  it('is a defined function', () => {
    expect(typeof calcPairCorr).toBe('function');
  });
});

describe('pairs-stat-arb::createPairsStatArbTick', () => {
  it('is a defined function', () => {
    expect(typeof createPairsStatArbTick).toBe('function');
  });
});
