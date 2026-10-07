/**
 * Dynamic Cross-Asset Portfolio Margin Engine
 * SPAN-like scenario evaluation across bounded binary prediction outcomes and volatility shocks.
 *
 * @module desk/clearing/portfolio-margin-engine
 */

import type {
  BinaryPositionScenario,
  LiquidationTier,
  MarginEngineConfig,
  PortfolioMarginMetrics,
} from './portfolio-margin-types';

export class PortfolioMarginEngine {
  private readonly safetyBufferPct: number;
  private readonly maintenanceRatio: number;
  private readonly warningThresholdPct: number;

  // SPAN scenario moves: [-15%, -10%, -5%, 0%, +5%, +10%, +15%]
  private readonly priceShocks = [-0.15, -0.10, -0.05, 0.0, 0.05, 0.10, 0.15];

  public constructor(config: MarginEngineConfig = {}) {
    this.safetyBufferPct = config.safetyBufferPct ?? 0.15;
    this.maintenanceRatio = config.maintenanceRatio ?? 0.70;
    this.warningThresholdPct = config.warningThresholdPct ?? 0.80;
  }

  public calculatePortfolioMargin(
    positions: readonly BinaryPositionScenario[],
    totalEquityUsd: number
  ): PortfolioMarginMetrics {
    if (positions.length === 0) {
      return {
        totalEquityUsd,
        initialMarginReqUsd: 0,
        maintenanceMarginReqUsd: 0,
        marginUtilizationPct: 0,
        maxAllowableLeverage: 10,
        liquidationTier: 'NORMAL',
        worstCaseLossUsd: 0,
      };
    }

    let worstCaseLoss = 0;

    // Evaluate loss surface across all scenario shocks
    for (const shock of this.priceShocks) {
      let scenarioLoss = 0;
      for (const pos of positions) {
        // Shift price bounded by [0.001, 0.999]
        const shockedPrice = Math.max(0.001, Math.min(0.999, pos.markPrice * (1 + shock)));
        const deltaPrice = shockedPrice - pos.markPrice;

        // PnL delta = YES pnl + NO pnl
        const pnl = pos.yesShares * deltaPrice + pos.noShares * (-deltaPrice);
        if (pnl < 0) {
          scenarioLoss += Math.abs(pnl);
        }
      }
      if (scenarioLoss > worstCaseLoss) {
        worstCaseLoss = scenarioLoss;
      }
    }

    // Initial Margin = Worst Case Loss * (1 + safety buffer)
    const initialMarginReqUsd = Math.round(worstCaseLoss * (1 + this.safetyBufferPct));
    const maintenanceMarginReqUsd = Math.round(initialMarginReqUsd * this.maintenanceRatio);

    const marginUtilizationPct = totalEquityUsd > 0
      ? Math.round((maintenanceMarginReqUsd / totalEquityUsd) * 1000) / 10
      : 100;

    // Determine liquidation tier
    let liquidationTier: LiquidationTier = 'NORMAL';
    if (totalEquityUsd <= maintenanceMarginReqUsd) {
      liquidationTier = 'HARD_LIQUIDATION';
    } else if (marginUtilizationPct >= 90) {
      liquidationTier = 'SOFT_DELEVERAGING';
    } else if (marginUtilizationPct >= this.warningThresholdPct * 100) {
      liquidationTier = 'WARNING';
    }

    // Dynamic leverage cap inversely proportional to utilization
    const maxAllowableLeverage = Math.max(1, Math.min(10, Math.round(100 / Math.max(10, marginUtilizationPct))));

    return {
      totalEquityUsd,
      initialMarginReqUsd,
      maintenanceMarginReqUsd,
      marginUtilizationPct,
      maxAllowableLeverage,
      liquidationTier,
      worstCaseLossUsd: Math.round(worstCaseLoss),
    };
  }
}
