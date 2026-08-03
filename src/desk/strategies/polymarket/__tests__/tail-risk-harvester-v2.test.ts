import { describe, it, expect } from 'vitest';
import { isExtremePrice, calcReversionRate, calcPremium, calcExpectedValue, createTailRiskHarvesterTick } from '../tail-risk-harvester-v2';

describe('tail-risk-harvester-v2::isExtremePrice', () => {
  it('is a defined function', () => {
    expect(typeof isExtremePrice).toBe('function');
  });
});

describe('tail-risk-harvester-v2::calcReversionRate', () => {
  it('is a defined function', () => {
    expect(typeof calcReversionRate).toBe('function');
  });
});

describe('tail-risk-harvester-v2::calcPremium', () => {
  it('is a defined function', () => {
    expect(typeof calcPremium).toBe('function');
  });
});

describe('tail-risk-harvester-v2::calcExpectedValue', () => {
  it('is a defined function', () => {
    expect(typeof calcExpectedValue).toBe('function');
  });
});

describe('tail-risk-harvester-v2::createTailRiskHarvesterTick', () => {
  it('is a defined function', () => {
    expect(typeof createTailRiskHarvesterTick).toBe('function');
  });
});
