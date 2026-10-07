import { describe, it, expect, beforeEach } from 'vitest';
import {
  computeBinaryOptionProbability,
  CexVelocityDetector,
  standardNormalCdf,
} from '../../../../src/desk/arbitrage/polymarket-statarb/polymarket-statarb-pricing';
import {
  PolymarketStatArbEngine,
} from '../../../../src/desk/arbitrage/polymarket-statarb/polymarket-statarb-engine';

describe('Polymarket StatArb Pricing & Velocity Tests', () => {
  it('should compute normal CDF correctly at standard milestones', () => {
    expect(standardNormalCdf(0)).toBeCloseTo(0.5, 4);
    expect(standardNormalCdf(-1.96)).toBeCloseTo(0.025, 2);
    expect(standardNormalCdf(1.96)).toBeCloseTo(0.975, 2);
  });

  it('should compute binary option probability under Black-Scholes', () => {
    const resATM = computeBinaryOptionProbability({
      spotPrice: 100,
      strikePrice: 100,
      timeToExpiryYears: 0.25,
      volatility: 0.5,
      riskFreeRate: 0.05,
    });
    expect(resATM.binaryCallProbability).toBeGreaterThan(0.4);
    expect(resATM.binaryCallProbability).toBeLessThan(0.6);
    expect(resATM.binaryPutProbability).toBeCloseTo(1 - resATM.binaryCallProbability, 4);

    const resDeepITM = computeBinaryOptionProbability({
      spotPrice: 200,
      strikePrice: 100,
      timeToExpiryYears: 0.25,
      volatility: 0.3,
    });
    expect(resDeepITM.binaryCallProbability).toBeGreaterThan(0.95);
  });

  it('should detect toxic price velocity on rapid CEX price movements', () => {
    const detector = new CexVelocityDetector(5000, 0.002);
    detector.recordTick({ timestampMs: 1000, price: 50000 });
    detector.recordTick({ timestampMs: 2000, price: 50200 });

    const flow = detector.analyzeFlow();
    expect(flow.isToxic).toBe(true);
    expect(flow.skewDirection).toBe('UP');
    expect(flow.velocity).toBeGreaterThan(0.001);
  });
});

describe('PolymarketStatArbEngine Unit Tests', () => {
  let engine: PolymarketStatArbEngine;

  beforeEach(() => {
    engine = new PolymarketStatArbEngine({
      marketId: 'fed-rates-q4',
      strikePrice: 100,
      expiryTimestampMs: Date.now() + 30 * 86400 * 1000,
      riskAversionGamma: 0.5,
      baseSpread: 0.04,
      maxInventory: 100,
      toxicVelocityThreshold: 0.002,
      orderLotSize: 10,
    });
  });

  it('should quote symmetric spreads at zero inventory without toxic flow', () => {
    engine.recordCexTick({ timestampMs: 1000, price: 100 });
    engine.recordCexTick({ timestampMs: 2000, price: 100.01 });

    const quote = engine.calculateQuote(1000);
    expect(quote.bidPrice).toBeLessThan(quote.askPrice);
    expect(quote.bidSize).toBe(10);
    expect(quote.askSize).toBe(10);
    expect(quote.toxicCancel).toBe(false);
  });

  it('should skew quotes downwards when long inventory', () => {
    engine.recordCexTick({ timestampMs: 1000, price: 100 });
    engine.setInventory(80);

    const quote = engine.calculateQuote(1000);
    expect(quote.bidPrice).toBeLessThan(0.5);
  });

  it('should trigger toxic cancel and pull asks when CEX pumps', () => {
    engine.recordCexTick({ timestampMs: 1000, price: 100 });
    engine.recordCexTick({ timestampMs: 2000, price: 102 });

    const quote = engine.calculateQuote(2000);
    expect(quote.toxicCancel).toBe(true);
    expect(quote.askSize).toBe(0);

    const evalRes = engine.evaluateToxicCancel(quote);
    expect(evalRes.shouldCancel).toBe(true);
    expect(evalRes.cancelSide).toBe('SELL');
  });
});
