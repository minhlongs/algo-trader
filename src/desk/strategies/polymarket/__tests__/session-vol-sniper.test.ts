import { describe, it, expect } from 'vitest';
import { calcATR, calcAverage, detectSpike, detectMeanReversion, createSessionVolSniperTick } from '../session-vol-sniper';

describe('session-vol-sniper::calcATR', () => {
  it('is a defined function', () => {
    expect(typeof calcATR).toBe('function');
  });
});

describe('session-vol-sniper::calcAverage', () => {
  it('is a defined function', () => {
    expect(typeof calcAverage).toBe('function');
  });
});

describe('session-vol-sniper::detectSpike', () => {
  it('is a defined function', () => {
    expect(typeof detectSpike).toBe('function');
  });
});

describe('session-vol-sniper::detectMeanReversion', () => {
  it('is a defined function', () => {
    expect(typeof detectMeanReversion).toBe('function');
  });
});

describe('session-vol-sniper::createSessionVolSniperTick', () => {
  it('is a defined function', () => {
    expect(typeof createSessionVolSniperTick).toBe('function');
  });
});
