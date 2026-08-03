import { describe, it, expect } from 'vitest';
import { calcBookImbalance, calcPriceVelocity, calcVolumeTrend, calcCompositeScore, determineSignal, createWeightedSentimentAggregatorTick } from '../weighted-sentiment-aggregator-v2';

describe('weighted-sentiment-aggregator-v2::calcBookImbalance', () => {
  it('is a defined function', () => {
    expect(typeof calcBookImbalance).toBe('function');
  });
});

describe('weighted-sentiment-aggregator-v2::calcPriceVelocity', () => {
  it('is a defined function', () => {
    expect(typeof calcPriceVelocity).toBe('function');
  });
});

describe('weighted-sentiment-aggregator-v2::calcVolumeTrend', () => {
  it('is a defined function', () => {
    expect(typeof calcVolumeTrend).toBe('function');
  });
});

describe('weighted-sentiment-aggregator-v2::calcCompositeScore', () => {
  it('is a defined function', () => {
    expect(typeof calcCompositeScore).toBe('function');
  });
});

describe('weighted-sentiment-aggregator-v2::determineSignal', () => {
  it('is a defined function', () => {
    expect(typeof determineSignal).toBe('function');
  });
});

describe('weighted-sentiment-aggregator-v2::createWeightedSentimentAggregatorTick', () => {
  it('is a defined function', () => {
    expect(typeof createWeightedSentimentAggregatorTick).toBe('function');
  });
});
