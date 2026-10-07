import { describe, it, expect } from 'vitest';
import { L3OrderBookEngine } from '../../../../src/desk/simulation/l3-orderbook-engine';
import { KyleLambdaImpactModel } from '../../../../src/desk/simulation/kyle-lambda-impact-model';
import { QueueFillSimulator } from '../../../../src/desk/simulation/queue-fill-simulator';

describe('L3 Microstructure Simulation Suite', () => {
  describe('L3OrderBookEngine', () => {
    it('manages discrete order additions, priority-preserving size reductions and executions', () => {
      const engine = new L3OrderBookEngine();

      // Add two bids at same price
      engine.processEvent({
        eventId: 'e-1',
        orderId: 'bid-1',
        timestampNs: 1000n,
        action: 'ADD',
        side: 'BID',
        price: 0.50,
        size: 100,
      });

      engine.processEvent({
        eventId: 'e-2',
        orderId: 'bid-2',
        timestampNs: 1010n,
        action: 'ADD',
        side: 'BID',
        price: 0.50,
        size: 200,
      });

      // Add one ask
      engine.processEvent({
        eventId: 'e-3',
        orderId: 'ask-1',
        timestampNs: 1020n,
        action: 'ADD',
        side: 'ASK',
        price: 0.52,
        size: 150,
      });

      const snap = engine.getSnapshot();
      expect(snap.bestBid).toBe(0.50);
      expect(snap.bestAsk).toBe(0.52);
      expect(snap.spread).toBeCloseTo(0.02, 3);
      expect(snap.bids[0]?.totalSize).toBe(300);

      // Volume ahead for second bid should be 100
      expect(engine.getVolumeAhead('bid-2')).toBe(100);

      // Size reduction on bid-1 preserves queue priority
      engine.processEvent({
        eventId: 'e-4',
        orderId: 'bid-1',
        timestampNs: 1030n,
        action: 'MODIFY',
        side: 'BID',
        price: 0.50,
        size: 60,
        newSize: 60,
      });
      expect(engine.getVolumeAhead('bid-2')).toBe(60);

      // Aggressive sell execution against head of bid queue
      const execs = engine.processEvent({
        eventId: 'e-5',
        orderId: 'bid-1',
        timestampNs: 1040n,
        action: 'EXECUTE',
        side: 'BID',
        price: 0.50,
        size: 60,
      });

      expect(execs.length).toBe(1);
      expect(execs[0]?.executedSize).toBe(60);
      expect(execs[0]?.aggressorSide).toBe('ASK');
      expect(engine.getVolumeAhead('bid-2')).toBe(0); // bid-2 now at head
    });
  });

  describe('KyleLambdaImpactModel', () => {
    it('estimates permanent Kyle lambda impact and temporary friction', () => {
      const model = new KyleLambdaImpactModel({ minSamples: 5 });

      // Feed observations where positive volume correlates with positive price changes
      for (let i = 1; i <= 10; i++) {
        model.recordObservation({
          signedVolume: i * 100,
          priceChange: i * 0.001,
          timestampMs: 1000 + i * 500,
        });
      }

      const impact = model.calculateImpact(500, 0.50);
      expect(impact.lambda).toBeGreaterThan(0);
      expect(impact.permanentImpactBps).toBeGreaterThan(0);
      expect(impact.temporaryImpactBps).toBeGreaterThan(0);
      expect(impact.totalExpectedSlippageBps).toBeGreaterThan(impact.permanentImpactBps);
      expect(impact.sampleCount).toBe(10);
    });
  });

  describe('QueueFillSimulator', () => {
    it('estimates fill probability under queue volume depletion and transit jitter', () => {
      const simulator = new QueueFillSimulator({
        meanLatencyMs: 15,
        stdDevLatencyMs: 3,
        cancellationRatePerSec: 0.10,
      });

      const fastFill = simulator.simulateFill({
        orderId: 'order-ahead-small',
        price: 0.50,
        size: 50,
        volumeAhead: 20,
        historicalTradeRatePerSec: 100,
        timestampMs: 1000,
      }, 2000);

      expect(fastFill.fillProbability).toBeGreaterThan(0.5);
      expect(fastFill.simulatedTransitLatencyMs).toBeGreaterThan(5);

      const slowFill = simulator.simulateFill({
        orderId: 'order-ahead-deep',
        price: 0.50,
        size: 50,
        volumeAhead: 5000,
        historicalTradeRatePerSec: 10,
        timestampMs: 1000,
      }, 1000);

      expect(slowFill.fillProbability).toBeLessThan(0.1);
      expect(slowFill.isLikelyFilled).toBe(false);
    });
  });
});
