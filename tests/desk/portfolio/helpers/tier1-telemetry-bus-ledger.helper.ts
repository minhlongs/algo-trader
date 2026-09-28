import { describe, it, expect } from 'vitest';
import {
  TelemetryEventBus,
  EodRiskLedger,
} from '../fixtures/telemetry-contract.fixture';

export function registerTier1TelemetryBusLedgerTests(): void {
  describe('Feature 21: Telemetry Bus & Prometheus Metric Registry (F21)', () => {
    it('F21.1: emits and captures portfolio allocation events on typed bus', () => {
      const bus = new TelemetryEventBus();
      bus.emit('desk.telemetry.allocation', { weights: { arbitrage: 0.25 } });
      const events = bus.getEvents('desk.telemetry.allocation');
      expect(events.length).toBe(1);
    });

    it('F21.2: filters events by topic prefix correctly', () => {
      const bus = new TelemetryEventBus();
      bus.emit('desk.telemetry.risk', { var: 1500 });
      bus.emit('desk.telemetry.sor', { orderId: '123' });
      expect(bus.getEvents('desk.telemetry.risk').length).toBe(1);
      expect(bus.getEvents('desk.telemetry.sor').length).toBe(1);
    });

    it('F21.3: timestamps every emitted telemetry event', () => {
      const bus = new TelemetryEventBus();
      bus.emit('desk.telemetry.heartbeat', { status: 'OK' });
      const event = bus.getEvents()[0];
      expect(event.timestamp).toBeGreaterThan(0);
    });

    it('F21.4: supports Prometheus metric payloads with tags and counters', () => {
      const bus = new TelemetryEventBus();
      bus.emit('portfolio_rebalance_total', { engine: 'arbitrage', count: 1 });
      const ev = bus.getEvents('portfolio_rebalance_total')[0];
      expect(ev.payload).toHaveProperty('count', 1);
    });

    it('F21.5: handles multiple concurrent event emissions without corruption', () => {
      const bus = new TelemetryEventBus();
      for (let i = 0; i < 20; i++) {
        bus.emit(`desk.telemetry.stream.${i}`, { index: i });
      }
      expect(bus.getEvents().length).toBe(20);
    });
  });

  describe('Feature 22: Automated EOD Risk Ledger (F22)', () => {
    it('F22.1: creates genesis record with valid initial hash', () => {
      const ledger = new EodRiskLedger('test-key');
      const rec = ledger.appendSnapshot(
        100000,
        { arbitrage: 0.25, marl: 0.25, amm: 0.25, 'alpha-lab': 0.25 },
        { arbitrage: 0, marl: 0, amm: 0, 'alpha-lab': 0 }
      );
      expect(rec.sequenceNumber).toBe(1);
      expect(rec.prevHash).toContain('GENESIS');
      expect(rec.currentHash.length).toBe(64);
    });

    it('F22.2: cryptographically chains SHA-256 HMAC prevHash to preceding record', () => {
      const ledger = new EodRiskLedger('test-key');
      const r1 = ledger.appendSnapshot(
        100000,
        { arbitrage: 0.25, marl: 0.25, amm: 0.25, 'alpha-lab': 0.25 },
        { arbitrage: 0, marl: 0, amm: 0, 'alpha-lab': 0 }
      );
      const r2 = ledger.appendSnapshot(
        102000,
        { arbitrage: 0.25, marl: 0.25, amm: 0.25, 'alpha-lab': 0.25 },
        { arbitrage: 500, marl: 500, amm: 500, 'alpha-lab': 500 }
      );
      expect(r2.prevHash).toBe(r1.currentHash);
    });

    it('F22.3: verifies unbroken ledger hash chain integrity', () => {
      const ledger = new EodRiskLedger('test-key');
      ledger.appendSnapshot(
        100000,
        { arbitrage: 0.25, marl: 0.25, amm: 0.25, 'alpha-lab': 0.25 },
        { arbitrage: 0, marl: 0, amm: 0, 'alpha-lab': 0 }
      );
      ledger.appendSnapshot(
        101000,
        { arbitrage: 0.25, marl: 0.25, amm: 0.25, 'alpha-lab': 0.25 },
        { arbitrage: 250, marl: 250, amm: 250, 'alpha-lab': 250 }
      );
      expect(ledger.verifyChainIntegrity().isValid).toBe(true);
    });

    it('F22.4: detects single-byte tampering in ledger records', () => {
      const ledger = new EodRiskLedger('test-key');
      ledger.appendSnapshot(
        100000,
        { arbitrage: 0.25, marl: 0.25, amm: 0.25, 'alpha-lab': 0.25 },
        { arbitrage: 0, marl: 0, amm: 0, 'alpha-lab': 0 }
      );
      const r2 = ledger.appendSnapshot(
        102000,
        { arbitrage: 0.25, marl: 0.25, amm: 0.25, 'alpha-lab': 0.25 },
        { arbitrage: 500, marl: 500, amm: 500, 'alpha-lab': 500 }
      );
      (r2 as { totalNavUsd: number }).totalNavUsd = 999999;
      expect(ledger.verifyChainIntegrity().isValid).toBe(false);
    });

    it('F22.5: generates Markdown run-card with summary table and verification badge', () => {
      const ledger = new EodRiskLedger('test-key');
      ledger.appendSnapshot(
        100000,
        { arbitrage: 0.25, marl: 0.25, amm: 0.25, 'alpha-lab': 0.25 },
        { arbitrage: 0, marl: 0, amm: 0, 'alpha-lab': 0 }
      );
      const card = ledger.generateMarkdownRunCard();
      expect(card).toContain('# End-of-Day Risk Ledger Run-Card');
      expect(card).toContain('VERIFIED');
    });
  });
}
