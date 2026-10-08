import { describe, it, expect } from 'vitest';
import { FpgaTickEmulator } from '../../../../src/desk/hardware/fpga-tick-emulator';
import { MicrosecondTickProfiler } from '../../../../src/desk/hardware/microsecond-tick-profiler';
import { ZeroCopyParser } from '../../../../src/desk/hardware/zero-copy-parser';

describe('Ultra-Low Latency Hardware & Profiling Suite', () => {
  describe('FpgaTickEmulator', () => {
    it('paces market tick ingestion through deterministic pipeline stages and bounds FIFO depth', () => {
      const emulator = new FpgaTickEmulator({
        targetFrequencyMhz: 200, // 5ns clock period
        pipelineStages: 4,      // 20ns pipeline latency
        fifoDepth: 2,
        clockJitterToleranceNs: 1,
      });

      const tick1 = {
        streamId: 1,
        sequenceNumber: 100,
        symbolCode: 42,
        priceScaled: 100500000n,
        quantityScaled: 1500000n,
        side: 'BID' as const,
        ingressTimestampNs: 1000n,
      };

      const res1 = emulator.ingestTick(tick1);
      expect(res1.isEnqueued).toBe(true);
      expect(res1.queueDepth).toBe(1);

      const res2 = emulator.ingestTick({ ...tick1, sequenceNumber: 101 });
      expect(res2.isEnqueued).toBe(true);
      expect(res2.queueDepth).toBe(2);

      // Drops when FIFO capacity is reached
      const res3 = emulator.ingestTick({ ...tick1, sequenceNumber: 102 });
      expect(res3.isEnqueued).toBe(false);
      expect(res3.queueDepth).toBe(2);

      const processed = emulator.processNextTick(1000n);
      expect(processed.tick).toBeDefined();
      expect(processed.cycleCount).toBe(4);
      expect(processed.egressTimestampNs).toBe(1020n); // 1000n + 20ns

      const stats = emulator.getStats();
      expect(stats.totalIngested).toBe(3);
      expect(stats.dropped).toBe(1);
      expect(stats.clockPeriodNs).toBe(5);
    });
  });

  describe('MicrosecondTickProfiler', () => {
    it('aggregates tick-to-trade latency distributions and computes percentiles accurately', () => {
      const profiler = new MicrosecondTickProfiler(100);

      profiler.recordSample({
        tickIngressNs: 1000n,
        orderDispatchNs: 1450n,
        processingLatencyNs: 450,
        stageDelaysNs: { parse: 100, signal: 200, risk: 150 },
      });

      profiler.recordSample({
        tickIngressNs: 2000n,
        orderDispatchNs: 2750n,
        processingLatencyNs: 750,
        stageDelaysNs: { parse: 120, signal: 400, risk: 230 },
      });

      profiler.recordSample({
        tickIngressNs: 3000n,
        orderDispatchNs: 4200n,
        processingLatencyNs: 1200,
        stageDelaysNs: { parse: 150, signal: 750, risk: 300 },
      });

      const summary = profiler.getSummary();
      expect(summary.count).toBe(3);
      expect(summary.minNs).toBe(450);
      expect(summary.maxNs).toBe(1200);
      expect(summary.p50Ns).toBe(750);
      expect(summary.p99Ns).toBe(1200);
    });
  });

  describe('ZeroCopyParser', () => {
    it('encodes and decodes binary frames with byte-accurate fidelity', () => {
      const parser = new ZeroCopyParser();
      const original = {
        streamId: 7,
        sequenceNumber: 99401,
        symbolCode: 101,
        priceScaled: 68500250000n,
        quantityScaled: 52000000n,
        side: 'ASK' as const,
        ingressTimestampNs: 5000n,
      };

      const binary = parser.serializeFrame(original);
      expect(binary.length).toBe(ZeroCopyParser.FRAME_LENGTH_BYTES);

      const decoded = parser.parseFrame(binary, 0, 5000n);
      expect(decoded).toBeDefined();
      expect(decoded?.streamId).toBe(7);
      expect(decoded?.sequenceNumber).toBe(99401);
      expect(decoded?.symbolCode).toBe(101);
      expect(decoded?.priceScaled).toBe(68500250000n);
      expect(decoded?.quantityScaled).toBe(52000000n);
      expect(decoded?.side).toBe('ASK');
      expect(decoded?.ingressTimestampNs).toBe(5000n);
    });
  });
});
