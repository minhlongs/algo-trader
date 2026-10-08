import { describe, expect, it } from 'vitest';
import { ContStoikovEngine } from '../../../../src/desk/contstoikov/cont-stoikov-engine';
import { ContStoikovQueue } from '../../../../src/desk/contstoikov/cont-stoikov-queue';
import { ContStoikovRates } from '../../../../src/desk/contstoikov/cont-stoikov-types';

describe('ContStoikovEngine Suite (Desk 88)', () => {
  const engine = new ContStoikovEngine();

  const standardRates: ContStoikovRates = {
    orderArrivalRate: 10.0,
    orderCancelRate: 0.5,
    marketExecutionRate: 4.0,
  };

  it('should verify queue front has higher fill probability than queue back', () => {
    const frontProb = ContStoikovQueue.calculateAbsorptionProbability(1, 10, standardRates);
    const midProb = ContStoikovQueue.calculateAbsorptionProbability(5, 10, standardRates);
    const backProb = ContStoikovQueue.calculateAbsorptionProbability(10, 10, standardRates);

    expect(frontProb.prob).toBeGreaterThan(midProb.prob);
    expect(midProb.prob).toBeGreaterThan(backProb.prob);
    expect(frontProb.expectedTime).toBeLessThan(backProb.expectedTime);
  });

  it('should estimate fill probability and expected waiting time', () => {
    const result = engine.estimateFillProbability(
      { queuePosition: 3, queueDepth: 20 },
      standardRates
    );

    expect(result.fillProbability).toBeGreaterThan(0.0);
    expect(result.fillProbability).toBeLessThanOrEqual(1.0);
    expect(result.expectedTimeSec).toBeGreaterThan(0.0);
    expect(result.queuePosition).toBe(3);
    expect(result.queueDepth).toBe(20);
  });

  it('should throw on invalid position, depth or rates', () => {
    expect(() =>
      engine.estimateFillProbability(
        { queuePosition: 15, queueDepth: 10 },
        standardRates
      )
    ).toThrow('Position cannot exceed total queue depth');

    expect(() =>
      engine.estimateFillProbability(
        { queuePosition: 0, queueDepth: 10 },
        standardRates
      )
    ).toThrow('Position and depth must be strictly positive');
  });
});
