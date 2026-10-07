import { describe, it, expect } from 'vitest';
import { EdgeOrderRouter } from '../../../../src/desk/edge/edge-order-router';
import { WsStreamMultiplexer } from '../../../../src/desk/edge/ws-stream-multiplexer';
import { MicrosecondCircuitBreaker } from '../../../../src/desk/edge/microsecond-circuit-breaker';

describe('Edge HFT Gateway & Multiplexer Suite', () => {
  describe('EdgeOrderRouter', () => {
    it('selects the lowest effective latency colocation cluster', () => {
      const router = new EdgeOrderRouter({ defaultRegion: 'tokyo' });

      router.updateLatency({
        region: 'tokyo',
        rttMs: 45,
        packetLossPct: 0.1,
        lastUpdatedMs: 1000,
      });

      router.updateLatency({
        region: 'frankfurt',
        rttMs: 85,
        packetLossPct: 0.0,
        lastUpdatedMs: 1000,
      });

      const decision = router.routeOrder();
      expect(decision.selectedRegion).toBe('tokyo');
      expect(decision.estimatedRttMs).toBe(45);
      expect(decision.fallbackRegion).toBe('frankfurt');
    });
  });

  describe('WsStreamMultiplexer', () => {
    it('detects sequence gaps and monitors buffer backpressure', () => {
      const mux = new WsStreamMultiplexer(10);

      const r1 = mux.ingestMessage({
        venue: 'Binance',
        streamId: 'btcusdt@depth',
        sequenceNumber: 1,
        payload: '{}',
        arrivalTimestampNs: 1000n,
      });
      expect(r1.isSequenceValid).toBe(true);

      // Sequence gap: jumps from 1 to 4
      const r2 = mux.ingestMessage({
        venue: 'Binance',
        streamId: 'btcusdt@depth',
        sequenceNumber: 4,
        payload: '{}',
        arrivalTimestampNs: 1010n,
      });
      expect(r2.isSequenceValid).toBe(false);
      expect(r2.gapSize).toBe(2);

      const stats = mux.getStats();
      expect(stats.sequenceGapsDetected).toBe(1);
      expect(stats.totalMessagesProcessed).toBe(2);
    });
  });

  describe('MicrosecondCircuitBreaker', () => {
    it('escalates tiered kill-switch levels under elevated rejection rates', () => {
      const breaker = new MicrosecondCircuitBreaker({
        errorWindowSize: 10,
        l1RejectionPctThreshold: 10,
        l2RejectionPctThreshold: 30,
      });

      expect(breaker.getState().level).toBe('L0_NORMAL');

      // Record several errors to breach L1 and L2
      breaker.recordExecution(false, 10, 1000);
      breaker.recordExecution(false, 15, 1010);
      breaker.recordExecution(false, 20, 1020);
      breaker.recordExecution(false, 25, 1030);

      const state = breaker.getState();
      expect(state.isTriggered).toBe(true);
      expect(state.level).toBe('L2_CANCEL_ONLY');
      expect(state.rejectionRatePct).toBeGreaterThanOrEqual(30);
    });
  });
});
