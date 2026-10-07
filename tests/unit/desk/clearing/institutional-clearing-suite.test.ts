import { describe, it, expect } from 'vitest';
import { DvpSettlementRelayer } from '../../../../src/desk/clearing/dvp-settlement-relayer';
import { PortfolioMarginEngine } from '../../../../src/desk/clearing/portfolio-margin-engine';
import { CounterpartyCreditSentinel } from '../../../../src/desk/clearing/counterparty-credit-sentinel';

describe('Institutional Settlement, Margin & Credit Suite', () => {
  describe('DvpSettlementRelayer', () => {
    it('executes atomic swaps on confirmation and refunds on receipt failure or timeout', () => {
      const relayer = new DvpSettlementRelayer(2);

      const intent = {
        tradeId: 'dvp-trade-1',
        makerLeg: { party: 'MAKER' as const, assetAddress: '0xctf', tokenId: '1', amountUnits: 500 },
        takerLeg: { party: 'TAKER' as const, assetAddress: '0xusdc', amountUnits: 250 },
        expiryTimestampMs: 5000,
        nonce: 1,
      };

      const registered = relayer.registerIntent(intent);
      expect(registered.phase).toBe('ESCROW_LOCKED');

      // Valid on-chain receipts settle the trade
      const settled = relayer.confirmSettlement(
        'dvp-trade-1',
        { txHash: '0x1', confirmations: 2, status: 'SUCCESS', blockNumber: 100, timestampMs: 3000 },
        { txHash: '0x2', confirmations: 2, status: 'SUCCESS', blockNumber: 100, timestampMs: 3000 },
        3100
      );
      expect(settled.phase).toBe('SETTLED');
      expect(settled.isCompleted).toBe(true);

      // New trade expiring past deadline triggers automatic refund
      relayer.registerIntent({ ...intent, tradeId: 'dvp-trade-expired', expiryTimestampMs: 4000 });
      const refunded = relayer.confirmSettlement(
        'dvp-trade-expired',
        { txHash: '0x3', confirmations: 2, status: 'SUCCESS', blockNumber: 101, timestampMs: 4100 },
        { txHash: '0x4', confirmations: 2, status: 'SUCCESS', blockNumber: 101, timestampMs: 4100 },
        4200
      );
      expect(refunded.phase).toBe('REFUNDED');
      expect(refunded.isRollbackApplied).toBe(true);
    });
  });

  describe('PortfolioMarginEngine', () => {
    it('evaluates SPAN binary scenario surface and computes tiered margin requirements', () => {
      const engine = new PortfolioMarginEngine({ safetyBufferPct: 0.10, maintenanceRatio: 0.70 });

      const positions = [
        { marketId: 'm-1', yesShares: 1000, noShares: 0, markPrice: 0.50, impliedVol: 0.20 },
        { marketId: 'm-2', yesShares: 0, noShares: 500, markPrice: 0.40, impliedVol: 0.30 },
      ];

      const metrics = engine.calculatePortfolioMargin(positions, 2000);
      expect(metrics.worstCaseLossUsd).toBeGreaterThan(0);
      expect(metrics.initialMarginReqUsd).toBeGreaterThan(metrics.worstCaseLossUsd);
      expect(metrics.maintenanceMarginReqUsd).toBeLessThan(metrics.initialMarginReqUsd);
      expect(metrics.liquidationTier).toBe('NORMAL');

      // Stressed under-capitalized account triggers liquidation tier
      const stressed = engine.calculatePortfolioMargin(positions, 10);
      expect(stressed.liquidationTier).toBe('HARD_LIQUIDATION');
    });
  });

  describe('CounterpartyCreditSentinel', () => {
    it('evaluates bilateral PFE, collateral haircuts and detects margin calls', () => {
      const sentinel = new CounterpartyCreditSentinel();

      const profile = {
        counterpartyId: 'otc-fund-alpha',
        creditRatingGrade: 'A' as const,
        collateralHeldUsd: 15_000,
        collateralAssetType: 'USDC' as const,
        isWrongWayRiskExposed: false,
      };

      const trades = [
        { tradeId: 't-1', markToMarketUsd: 2000, notionalUsd: 50_000, annualizedVol: 0.20, timeToMaturityDays: 30 },
        { tradeId: 't-2', markToMarketUsd: -500, notionalUsd: 30_000, annualizedVol: 0.25, timeToMaturityDays: 60 },
      ];

      const exposure = sentinel.evaluateCounterparty(profile, trades);
      expect(exposure.currentExposureUsd).toBe(1500);
      expect(exposure.potentialFutureExposure99Usd).toBeGreaterThan(exposure.currentExposureUsd);
      expect(exposure.effectiveHaircutPct).toBe(2.0); // 2% for USDC
      expect(exposure.netCollateralValueUsd).toBe(14_700);
      expect(exposure.isMarginCallTriggered).toBe(false);

      // Wrong way risk escalation with volatile collateral
      const stressedProfile = {
        ...profile,
        collateralAssetType: 'VOLATILE_TOKEN' as const,
        isWrongWayRiskExposed: true,
      };
      const stressedExposure = sentinel.evaluateCounterparty(stressedProfile, trades);
      expect(stressedExposure.effectiveHaircutPct).toBe(40.0); // 25% + 15% WWR
    });
  });
});
