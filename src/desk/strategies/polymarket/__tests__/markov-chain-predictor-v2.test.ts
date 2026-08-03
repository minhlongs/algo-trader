import { describe, it, expect } from 'vitest';
import { discretizeChange, buildTransitionMatrix, predictNextState, pricesToStates, createMarkovChainPredictorTick } from '../markov-chain-predictor-v2';

describe('markov-chain-predictor-v2::discretizeChange', () => {
  it('is a defined function', () => {
    expect(typeof discretizeChange).toBe('function');
  });
});

describe('markov-chain-predictor-v2::buildTransitionMatrix', () => {
  it('is a defined function', () => {
    expect(typeof buildTransitionMatrix).toBe('function');
  });
});

describe('markov-chain-predictor-v2::predictNextState', () => {
  it('is a defined function', () => {
    expect(typeof predictNextState).toBe('function');
  });
});

describe('markov-chain-predictor-v2::pricesToStates', () => {
  it('is a defined function', () => {
    expect(typeof pricesToStates).toBe('function');
  });
});

describe('markov-chain-predictor-v2::createMarkovChainPredictorTick', () => {
  it('is a defined function', () => {
    expect(typeof createMarkovChainPredictorTick).toBe('function');
  });
});
