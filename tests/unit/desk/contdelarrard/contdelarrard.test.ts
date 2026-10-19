/**
 * Unit Tests for Cont & de Larrard (2013) Markovian LOB Model.
 * Strictly zero-mock, real queue depletion analytics, strictly < 150 LOC.
 */

import { describe, it, expect } from 'vitest';
import {
  ContDeLarrardEngine,
  ContDeLarrardParameters,
  OrderFlowSample,
} from '../../../../src/desk/contdelarrard';

describe('Wave 201: Cont & de Larrard (2013) Markovian LOB Suite', () => {
  const engine = new ContDeLarrardEngine();

  const symmetricParams: ContDeLarrardParameters = {
    lambdaBid: 10.0,
    lambdaAsk: 10.0,
    muBid: 12.0,
    muAsk: 12.0,
  };

  it('guarantees exact 50/50 absorption probability for symmetric queue depths', () => {
    const result = engine.evaluate({ bidDepth: 20, askDepth: 20 }, symmetricParams);

    expect(result.priceIncreaseProb).toBe(0.5);
    expect(result.priceDecreaseProb).toBe(0.5);
    expect(result.queueImbalance).toBe(0);
    expect(result.expectedDurationSec).toBeGreaterThan(0);
  });

  it('demonstrates monotonic increase of p_up with bid depth dominance', () => {
    const shallow = engine.evaluate({ bidDepth: 10, askDepth: 30 }, symmetricParams);
    const equal = engine.evaluate({ bidDepth: 20, askDepth: 20 }, symmetricParams);
    const deep = engine.evaluate({ bidDepth: 40, askDepth: 10 }, symmetricParams);

    expect(shallow.priceIncreaseProb).toBeLessThan(equal.priceIncreaseProb);
    expect(equal.priceIncreaseProb).toBeLessThan(deep.priceIncreaseProb);
    expect(deep.priceIncreaseProb).toBeGreaterThan(0.7);
    expect(shallow.priceIncreaseProb).toBeLessThan(0.3);
  });

  it('handles terminal queue boundary absorptions correctly', () => {
    const askDepleted = engine.evaluate({ bidDepth: 15, askDepth: 0 }, symmetricParams);
    expect(askDepleted.priceIncreaseProb).toBe(1.0);
    expect(askDepleted.priceDecreaseProb).toBe(0.0);

    const bidDepleted = engine.evaluate({ bidDepth: 0, askDepth: 15 }, symmetricParams);
    expect(bidDepleted.priceIncreaseProb).toBe(0.0);
    expect(bidDepleted.priceDecreaseProb).toBe(1.0);
  });

  it('incorporates drift asymmetry in price transition dynamics', () => {
    const askFastDrain: ContDeLarrardParameters = {
      lambdaBid: 10.0,
      lambdaAsk: 5.0,
      muBid: 10.0,
      muAsk: 20.0, // Ask depletes much faster than bid
    };

    const res = engine.evaluate({ bidDepth: 20, askDepth: 20 }, askFastDrain);
    // Despite equal depths, price should be more likely to jump up
    expect(res.priceIncreaseProb).toBeGreaterThan(0.55);
    expect(res.askDrift).toBeGreaterThan(res.bidDrift);
  });

  it('calibrates Poisson order arrival and cancellation rates from flow samples', () => {
    const samples: OrderFlowSample[] = [
      { side: 'BID', type: 'LIMIT', timestampSec: 0.1 },
      { side: 'BID', type: 'LIMIT', timestampSec: 0.2 },
      { side: 'BID', type: 'CANCEL', timestampSec: 0.3 },
      { side: 'ASK', type: 'LIMIT', timestampSec: 0.15 },
      { side: 'ASK', type: 'MARKET', timestampSec: 0.4 },
      { side: 'ASK', type: 'MARKET', timestampSec: 0.5 },
    ];

    const calibrated = engine.calibrate(samples, 1.0);
    expect(calibrated.lambdaBid).toBe(2.0);
    expect(calibrated.muBid).toBe(1.0);
    expect(calibrated.lambdaAsk).toBe(1.0);
    expect(calibrated.muAsk).toBe(2.0);
  });

  it('generates consistent 2D absorption probability surfaces', () => {
    const surface = engine.generateProbabilitySurface(5, symmetricParams);
    expect(surface.length).toBe(5);
    expect(surface[0].length).toBe(5);

    // Diagonal elements should all be 0.5
    for (let i = 0; i < 5; i++) {
      expect(surface[i][i]).toBe(0.5);
    }

    // Upper triangle (qa > qb) should have p_up < 0.5
    expect(surface[0][4]).toBeLessThan(0.5);
    // Lower triangle (qb > qa) should have p_up > 0.5
    expect(surface[4][0]).toBeGreaterThan(0.5);
  });
});
