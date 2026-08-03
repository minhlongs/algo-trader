import { describe, it, expect } from 'vitest';
import { estimateTradeImbalance, calcVPIN, calcToxicityZScore, createOrderFlowToxicityTick } from '../order-flow-toxicity';

describe('order-flow-toxicity::estimateTradeImbalance', () => {
  it('is a defined function', () => {
    expect(typeof estimateTradeImbalance).toBe('function');
  });
});

describe('order-flow-toxicity::calcVPIN', () => {
  it('is a defined function', () => {
    expect(typeof calcVPIN).toBe('function');
  });
});

describe('order-flow-toxicity::calcToxicityZScore', () => {
  it('is a defined function', () => {
    expect(typeof calcToxicityZScore).toBe('function');
  });
});

describe('order-flow-toxicity::createOrderFlowToxicityTick', () => {
  it('is a defined function', () => {
    expect(typeof createOrderFlowToxicityTick).toBe('function');
  });
});
