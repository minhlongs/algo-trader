import { describe, it, expect } from 'vitest';
import { MultiLevelOfiEngine } from '../../../../src/desk/alphadynamics/multi-level-ofi-engine';
import { QueueStuffingDetector } from '../../../../src/desk/alphadynamics/queue-stuffing-detector';
import { KalmanAlphaCombiner } from '../../../../src/desk/alphadynamics/kalman-alpha-combiner';

describe('HFT Order Flow Dynamics & Alpha Synthesis Suite', () => {
  describe('MultiLevelOfiEngine', () => {
    it('computes multi-level OFI with continuous exponential decay kernel', () => {
      const engine = new MultiLevelOfiEngine(3, 0.5);

      const snap1 = {
        timestampMs: 1000,
        symbol: 'NVDA',
        bids: [
          { price: 100.0, size: 50 },
          { price: 99.9, size: 100 },
          { price: 99.8, size: 200 },
        ],
        asks: [
          { price: 100.1, size: 60 },
          { price: 100.2, size: 120 },
          { price: 100.3, size: 250 },
        ],
      };

      const res1 = engine.processSnapshot(snap1);
      expect(res1.integratedOfi).toBe(0);

      // Snapshot 2: Buyer aggression at L1 (bid price goes up from 100.0 to 100.1, asks consumed)
      const snap2 = {
        timestampMs: 1050,
        symbol: 'NVDA',
        bids: [
          { price: 100.1, size: 70 }, // cur.price > prev.price -> +70 flow
          { price: 100.0, size: 90 },
          { price: 99.9, size: 150 },
        ],
        asks: [
          { price: 100.2, size: 50 }, // cur.price > prev.price -> -prev.size (-60) ask flow
          { price: 100.3, size: 100 },
          { price: 100.4, size: 200 },
        ],
      };

      const res2 = engine.processSnapshot(snap2);
      expect(res2.levelOfi.length).toBe(3);
      expect(res2.integratedOfi).toBeGreaterThan(0);
      expect(res2.decayWeightedOfi).toBeGreaterThan(0);
    });
  });

  describe('QueueStuffingDetector', () => {
    it('identifies quote stuffing bursts with high cancel-to-trade ratio and burst frequency', () => {
      const detector = new QueueStuffingDetector(1000, 10.0, 50.0);

      // Inject rapid cancels
      let alert;
      for (let i = 0; i < 60; i++) {
        alert = detector.addEvent({
          timestampMs: 1000 + i * 10,
          eventType: 'CANCEL',
          orderId: `ord_${i}`,
          price: 150.0,
          size: 10,
        });
      }

      // 60 events in 600ms -> frequency > 60 Hz, 0 trades -> high ratio
      expect(alert?.isAnomalyDetected).toBe(true);
      expect(alert?.cancelToTradeRatio).toBeGreaterThanOrEqual(10.0);
      expect(alert?.eventFrequencyHz).toBeGreaterThanOrEqual(50.0);
      expect(alert?.isQueueStuffed).toBe(true);
      expect(alert?.burstSeverityScore).toBeGreaterThan(0.5);
    });

    it('returns benign status under normal market trading condition', () => {
      const detector = new QueueStuffingDetector(1000, 10.0, 50.0);

      let alert;
      // Normal flow: 3 trades, 2 cancels
      alert = detector.addEvent({ timestampMs: 1000, eventType: 'TRADE', orderId: 't1', price: 100, size: 10 });
      alert = detector.addEvent({ timestampMs: 1200, eventType: 'CANCEL', orderId: 'c1', price: 100, size: 5 });
      alert = detector.addEvent({ timestampMs: 1400, eventType: 'TRADE', orderId: 't2', price: 100, size: 15 });
      alert = detector.addEvent({ timestampMs: 1600, eventType: 'TRADE', orderId: 't3', price: 100, size: 20 });

      expect(alert?.isAnomalyDetected).toBe(false);
      expect(alert?.isQueueStuffed).toBe(false);
    });
  });

  describe('KalmanAlphaCombiner', () => {
    it('adaptively updates signal weights based on realized price prediction error', () => {
      const combiner = new KalmanAlphaCombiner(3, 1e-4, 1e-2);

      const initialWeights = combiner.getWeights();
      expect(initialWeights).toEqual([1 / 3, 1 / 3, 1 / 3]);

      // Alpha signal 1 strongly predicts price increase (+2.0) while others are zero
      for (let t = 0; t < 10; t++) {
        combiner.update({
          timestampMs: 1000 + t * 100,
          alphaSignalValues: [1.0, 0.0, 0.0],
          realizedPriceChange: 1.0,
        });
      }

      const updatedWeights = combiner.getWeights();
      // Signal 0 weight should have increased significantly relative to others
      expect(updatedWeights[0]).toBeGreaterThan(initialWeights[0]!);
      expect(updatedWeights[1]).toBeLessThan(updatedWeights[0]!);
      expect(updatedWeights[2]).toBeLessThan(updatedWeights[0]!);
    });

    it('throws error when signal length mismatches state dimension', () => {
      const combiner = new KalmanAlphaCombiner(2);
      expect(() =>
        combiner.update({
          timestampMs: 1000,
          alphaSignalValues: [1.0], // mismatch
          realizedPriceChange: 0.5,
        })
      ).toThrow('Expected 2 alpha signals, got 1');
    });
  });
});
