import { describe, it, expect } from 'vitest';
import { calcDepthRatio, calcDepthZScore, detectMomentum, createOrderbookDepthRatioTick } from '../orderbook-depth-ratio-v2';

describe('orderbook-depth-ratio-v2::calcDepthRatio', () => {
  it('is a defined function', () => {
    expect(typeof calcDepthRatio).toBe('function');
  });
});

describe('orderbook-depth-ratio-v2::calcDepthZScore', () => {
  it('is a defined function', () => {
    expect(typeof calcDepthZScore).toBe('function');
  });
});

describe('orderbook-depth-ratio-v2::detectMomentum', () => {
  it('is a defined function', () => {
    expect(typeof detectMomentum).toBe('function');
  });
});

describe('orderbook-depth-ratio-v2::createOrderbookDepthRatioTick', () => {
  it('is a defined function', () => {
    expect(typeof createOrderbookDepthRatioTick).toBe('function');
  });
});
