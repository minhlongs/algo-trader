import { describe, it, expect } from 'vitest';
import { SecuritiesLendingEngine } from '../../../../src/desk/prime/securities-lending-engine';
import { TotalReturnSwapPricer } from '../../../../src/desk/prime/total-return-swap-pricer';
import { RehypothecationGuard } from '../../../../src/desk/prime/rehypothecation-guard';

describe('Prime Brokerage & Synthetic Financing Suite', () => {
  describe('SecuritiesLendingEngine', () => {
    it('manages lendable inventory and calculates non-linear utilization-based borrow rates', () => {
      const engine = new SecuritiesLendingEngine({
        baseFeeBps: 50,
        kinkUtilization: 0.8,
        slope1: 150,
        slope2: 3000,
      });

      engine.registerInventory('AAPL', 8000, 2000); // 10,000 total

      // Utilization 0%
      expect(engine.calculateBorrowRate('AAPL')).toBe(50);

      // Request locate of 4,000 (40% utilization)
      const loc1 = engine.processLocate({
        requestId: 'req-1',
        clientAccountId: 'hedgefund-a',
        symbol: 'AAPL',
        quantity: 4000,
        requestedAtMs: 1_000_000,
        validityMs: 60_000,
      });

      expect(loc1.status).toBe('GRANTED');
      expect(loc1.quantity).toBe(4000);
      // 40% util = 50 + (0.4 / 0.8) * 150 = 50 + 75 = 125 bps
      expect(loc1.rateBps).toBe(125);

      // Request locate of 5,000 (brings to 9,000 / 90% utilization - beyond kink)
      const loc2 = engine.processLocate({
        requestId: 'req-2',
        clientAccountId: 'hedgefund-b',
        symbol: 'AAPL',
        quantity: 5000,
        requestedAtMs: 1_000_100,
        validityMs: 60_000,
      });

      expect(loc2.status).toBe('GRANTED');
      // 90% util: kink base is 50 + 150 = 200. Excess = (0.9 - 0.8)/(1 - 0.8) = 0.5. 200 + 0.5 * 3000 = 1700 bps
      expect(loc2.rateBps).toBe(1700);

      // Request locate exceeding available quantity
      const loc3 = engine.processLocate({
        requestId: 'req-3',
        clientAccountId: 'hedgefund-c',
        symbol: 'AAPL',
        quantity: 2000,
        requestedAtMs: 1_000_200,
        validityMs: 60_000,
      });
      expect(loc3.status).toBe('REJECTED');

      // Release locate and verify pool restoration
      const released = engine.releaseLocate(loc1.locateId);
      expect(released).toBe(true);
      const inventory = engine.getInventory('AAPL');
      expect(inventory?.availableQuantity).toBe(5000);

      // Prune expired locates
      const pruned = engine.pruneExpiredLocates(1_000_100 + 70_000);
      expect(pruned).toBe(1); // loc2 expired
      expect(engine.getInventory('AAPL')?.availableQuantity).toBe(10000);
    });
  });

  describe('TotalReturnSwapPricer', () => {
    it('prices and settles periodic TRS equity appreciation and benchmark financing flows', () => {
      const pricer = new TotalReturnSwapPricer();
      const initialTimestamp = 1_700_000_000_000;

      pricer.createContract({
        contractId: 'trs-eth-1',
        counterpartyId: 'alpha-fund',
        underlyingSymbol: 'ETH/USD',
        notionalQuantity: 100, // 100 ETH
        initialPrice: 3000, // $300,000 notional
        resetFrequencyDays: 30,
        financingSpreadBps: 150, // SOFR + 150 bps
        lastResetPrice: 3000,
        lastResetTimestampMs: initialTimestamp,
      });

      // Price rises to $3200 after 30 days (benchmark rate SOFR = 500 bps / 5%)
      const thirtyDaysMs = initialTimestamp + 30 * 24 * 60 * 60 * 1000;
      const settlement = pricer.settlePeriodicReset(
        'trs-eth-1',
        3200,
        500, // 500 bps benchmark
        thirtyDaysMs
      );

      // Equity PnL = 100 * (3200 - 3000) = +$20,000
      expect(settlement.equityLegPnl).toBe(20000);

      // Financing rate = (500 + 150) / 10000 = 6.50% annualized
      // Notional = 100 * 3000 = $300,000
      // 30 days interest = 300,000 * 0.065 * (30 / 360) = $1,625
      expect(settlement.financingLegDue).toBe(1625);

      // Net settlement = 20,000 - 1,625 = $18,375
      expect(settlement.netSettlementDue).toBe(18375);
      expect(settlement.counterpartyPaymentDirection).toBe('RECEIVE');

      // Verify contract updated last reset price
      const contract = pricer.getContract('trs-eth-1');
      expect(contract?.lastResetPrice).toBe(3200);

      // Mark-to-market when price falls to 3100 15 days later
      const fortyFiveDaysMs = thirtyDaysMs + 15 * 24 * 60 * 60 * 1000;
      const mtm = pricer.calculateMarkToMarket('trs-eth-1', 3100, 500, fortyFiveDaysMs);
      expect(mtm.unrealizedEquityPnl).toBe(-10000); // 100 * (3100 - 3200)
      expect(mtm.accruedFinancingCost).toBe(866.67); // 100 * 3200 * 0.065 * (15/360)
      expect(mtm.netMtMValue).toBe(-10866.67);
    });
  });

  describe('RehypothecationGuard', () => {
    it('enforces Rule 15c3-3 rehypothecation limits and asset class haircuts', () => {
      const guard = new RehypothecationGuard();

      // Client with $1,000,000 margin debit
      const limits = {
        clientAccountId: 'client-1',
        totalClientMarginDebitUsd: 1_000_000,
        maxRehypothecationFactor: 1.4, // 140% = $1,400,000 max pledge
        segregatedExcessReserveUsd: 0,
      };

      const assets = [
        { assetId: 'a1', symbol: 'USD', marketValueUsd: 500_000, assetClass: 'CASH' as const }, // 0% haircut -> 500k
        { assetId: 'a2', symbol: 'US_TREASURY_10Y', marketValueUsd: 500_000, assetClass: 'TREASURY' as const }, // 2% haircut -> 490k
        { assetId: 'a3', symbol: 'NVDA', marketValueUsd: 1_000_000, assetClass: 'EQUITY' as const }, // 15% haircut -> 850k
      ];

      // Total raw = $2.0M. Post-haircut = 500k + 490k + 850k = $1.84M
      const status = guard.evaluateClientCollateral(assets, limits, 1_000_000);

      expect(status.maxPermissiblePledgeUsd).toBe(1_400_000);
      expect(status.eligibleCollateralUsd).toBe(1_840_000);
      expect(status.currentlyPledgedUsd).toBe(1_000_000);
      expect(status.availableToPledgeUsd).toBe(400_000); // 1.4M limit - 1.0M current
      expect(status.isCompliant).toBe(true);

      // Validate new pledge request within headroom
      const validPledge = guard.validateNewPledge(300_000, status);
      expect(validPledge.isApproved).toBe(true);

      // Validate new pledge request exceeding headroom
      const invalidPledge = guard.validateNewPledge(500_000, status);
      expect(invalidPledge.isApproved).toBe(false);
      expect(invalidPledge.reason).toContain('exceeds permissible headroom');
    });
  });
});
