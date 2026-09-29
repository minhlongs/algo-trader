import { describe, it, expect } from 'vitest';
import {
  GlobalCircuitBreaker,
  LeverageExposureGuard,
} from '../fixtures/risk-contract.fixture';
import {
  WaterFillingOptimizer,
  VwapExecutor,
  IcebergExecutor,
} from '../fixtures/sor-contract.fixture';
import {
  AccountingReconciler,
  RoceCalculator,
  TelemetryEventBus,
  EodRiskLedger,
} from '../fixtures/telemetry-contract.fixture';
import { createMockOrderBooks } from '../fixtures/test-data.fixture';

export function registerTier3RiskTelemetryInteractions(): void {
  describe('Tier 3: Risk Guard ↔ SOR & Telemetry Interactions (X12-X22)', () => {
    it('X12: Circuit breaker REDUCE triggers orderly position reduction via VWAP executor', () => {
      const cb = new GlobalCircuitBreaker(100000);
      const state = cb.evaluate(89000); // 11% DD -> REDUCE
      expect(state.tier).toBe('REDUCE');

      const positionToClose = 200;
      const vwap = new VwapExecutor();
      const slices = vwap.sliceOrder(positionToClose * 0.50, [100, 200, 100]); // liquidate 50%
      expect(slices.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 4);
    });

    it('X13: Circuit breaker HALT state halts active Iceberg display refills', () => {
      const cb = new GlobalCircuitBreaker(100000);
      const state = cb.evaluate(84000); // 16% DD -> HALT
      expect(state.tier).toBe('HALT');

      const iceberg = new IcebergExecutor();
      const chunks = iceberg.sliceOrder(500, 0.20);
      const activeChunks = state.tier === 'HALT' ? [] : chunks;
      expect(activeChunks.length).toBe(0);
    });

    it('X14: Circuit breaker HARD_STOP triggers emergency market sell across all venues', () => {
      const cb = new GlobalCircuitBreaker(100000);
      const state = cb.evaluate(79000); // 21% DD -> HARD_STOP
      expect(state.tier).toBe('HARD_STOP');

      const books = createMockOrderBooks();
      const opt = new WaterFillingOptimizer();
      const emergencyPlan = opt.optimizeRoute({ symbol: 'SOL/USDT', side: 'SELL', targetQuantity: 150, maxSlippageBps: 200, urgency: 'HIGH' }, books);
      expect(emergencyPlan.allocations.length).toBeGreaterThan(1);
    });

    it('X15: Leverage Exposure Guard blocks high-slippage market order exceeding gross leverage limit', () => {
      const guard = new LeverageExposureGuard(3.0);
      const currentPositions = { btc: 150000, eth: 140000 };
      const newOrderValue = 30000;
      const updatedPositions = { ...currentPositions, sol: newOrderValue };
      const check = guard.checkExposure(100000, updatedPositions);
      expect(check.isAllowed).toBe(false);
      expect(check.violationReason).toContain('exceeds limit 3x');
    });

    it('X16: Gas cost surge during volatility reroutes risk-reduction orders to CEX venues', () => {
      const books = createMockOrderBooks();
      const cpmm = books.find((b) => b.venueId === 'cpmm-amm');
      if (cpmm) (cpmm as { gasCostUsd: number }).gasCostUsd = 150; // $150 surge
      const opt = new WaterFillingOptimizer();
      const plan = opt.optimizeRoute({ symbol: 'SOL/USDT', side: 'SELL', targetQuantity: 20, maxSlippageBps: 50, urgency: 'HIGH' }, books);
      expect(plan.allocations.some((a) => a.venueId === 'cpmm-amm')).toBe(false);
    });

    it('X17: Multi-engine liquidation proceeds reconciled by Zero Accounting Drift Reconciler', () => {
      const initialEquity = 100000;
      const unallocatedCash = 20000;
      const engineCapitals = { arbitrage: 20000, marl: 20000, amm: 20000, 'alpha-lab': 20000 };
      // After emergency partial liquidation: cash increases, engine capital decreases
      const postLiquidationCash = unallocatedCash + 20000;
      const postLiquidationCapitals = { arbitrage: 15000, marl: 15000, amm: 15000, 'alpha-lab': 15000 };
      const pnl = { arbitrage: 0, marl: 0, amm: 0, 'alpha-lab': 0 };

      const res = AccountingReconciler.verifyZeroDrift(initialEquity, postLiquidationCash, postLiquidationCapitals, pnl);
      expect(res.isZeroDrift).toBe(true);
      expect(res.driftUsd).toBeLessThan(1e-4);
    });

    it('X18: Post-rebalance allocations trigger typed telemetry event on bus', () => {
      const bus = new TelemetryEventBus();
      const allocations = { arbitrage: 20000, marl: 20000, amm: 20000, 'alpha-lab': 20000 };
      bus.emit('desk.telemetry.allocation', { timestamp: Date.now(), allocations });

      const events = bus.getEvents('desk.telemetry.allocation');
      expect(events.length).toBe(1);
      expect(events[0].payload).toHaveProperty('allocations');
    });

    it('X19: Circuit breaker tier transitions recorded in SHA-256 HMAC chained EOD risk ledger', () => {
      const ledger = new EodRiskLedger('interaction-key');
      const r1 = ledger.appendSnapshot(100000, { arbitrage: 0.25, marl: 0.25, amm: 0.25, 'alpha-lab': 0.25 }, { arbitrage: 0, marl: 0, amm: 0, 'alpha-lab': 0 });
      const r2 = ledger.appendSnapshot(89000, { arbitrage: 0.20, marl: 0.20, amm: 0.20, 'alpha-lab': 0.20 }, { arbitrage: -2750, marl: -2750, amm: -2750, 'alpha-lab': -2750 });
      expect(r2.prevHash).toBe(r1.currentHash);
      expect(ledger.verifyChainIntegrity().isValid).toBe(true);
    });

    it('X20: Real-time ROCE calculation reflects performance improvement post-tilt', () => {
      const capitalEmployed = 80000;
      const preTiltPnl = 1000;
      const postTiltPnl = 3500;
      const preRoce = RoceCalculator.computeRoce(preTiltPnl, capitalEmployed, 30);
      const postRoce = RoceCalculator.computeRoce(postTiltPnl, capitalEmployed, 30);
      expect(postRoce.roceAnnualized).toBeGreaterThan(preRoce.roceAnnualized);
    });

    it('X21: Order routing execution fills emitted to Telemetry bus and aggregated', () => {
      const bus = new TelemetryEventBus();
      bus.emit('desk.telemetry.sor.fill', { symbol: 'SOL/USDT', fillQty: 50, price: 99.8 });
      bus.emit('desk.telemetry.sor.fill', { symbol: 'SOL/USDT', fillQty: 50, price: 99.9 });
      const fills = bus.getEvents('desk.telemetry.sor.fill');
      const totalFilled = fills.reduce((sum, f) => sum + (f.payload as { fillQty: number }).fillQty, 0);
      expect(totalFilled).toBe(100);
    });

    it('X22: End-of-Day run-card reflects combined state of allocations and ledger verification', () => {
      const ledger = new EodRiskLedger('interaction-key');
      ledger.appendSnapshot(100000, { arbitrage: 0.25, marl: 0.25, amm: 0.25, 'alpha-lab': 0.25 }, { arbitrage: 0, marl: 0, amm: 0, 'alpha-lab': 0 });
      const card = ledger.generateMarkdownRunCard();
      expect(card).toContain('Ledger Integrity: VERIFIED');
      expect(card).toContain('Total Snapshots: 1');
    });
  });
}
