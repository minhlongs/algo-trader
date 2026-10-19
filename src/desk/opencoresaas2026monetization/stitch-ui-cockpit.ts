// SPDX-License-Identifier: MIT
/**
 * Stitch UI Cockpit Engine & Design System Facade (2026.5-PRO-MAX)
 * Re-exports themes, SOR Mesh (#13), Regime-Kelly (#14), Hawkes Radar (#15), Queue Cockpit (#16), and Auditor.
 */

import { ComplianceAuditLogger, type ChainedAuditRecord } from '../security/audit-logger';
import { StrategyMarketplaceManager } from '../strategies/marketplace';
import { BillingMeter, TIER_ENTITLEMENTS } from './billing-meter';
import type { TierLevel } from './catalog';
import { buildAvellanedaLipkinCockpitSnapshot } from './stitch-avellaneda-lipkin-telemetry';
import { buildBlackLittermanRiskParitySnapshot } from './stitch-black-litterman-risk-parity-telemetry';
import { buildHawkesOrderFlowRadarSnapshot } from './stitch-hawkes-radar-telemetry';
import { buildLiquidityImpactSnapshot } from './stitch-liquidity-impact-telemetry';
import { buildQueueReactiveCockpitSnapshot } from './stitch-queue-reactive-telemetry';
import { buildStatArbGlostenMilgromSnapshot } from './stitch-statarb-glosten-milgrom-telemetry';
import {
  buildRegimeKellyCockpitSnapshot,
  type MarketRegimeState,
} from './stitch-regime-kelly-telemetry';
import {
  buildSorMeshConsoleSnapshot,
  type SorSplitterAlgorithm,
} from './stitch-sor-mesh-telemetry';
import {
  STITCH_8_SCREENS,
  STITCH_DESIGN_THEMES,
  type StitchThemeId,
} from './stitch-ui-themes';

export * from './stitch-ui-themes';
export * from './stitch-sor-mesh-telemetry';
export * from './stitch-regime-kelly-telemetry';
export * from './stitch-avellaneda-lipkin-telemetry';
export * from './stitch-black-litterman-risk-parity-telemetry';
export * from './stitch-hawkes-radar-telemetry';
export * from './stitch-liquidity-impact-telemetry';
export * from './stitch-queue-reactive-telemetry';
export * from './stitch-statarb-glosten-milgrom-telemetry';
export * from './ui-ux-pro-max-auditor';

export class StitchUiCockpitEngine {
  private readonly meter = new BillingMeter();
  private readonly marketplace = new StrategyMarketplaceManager();
  private readonly auditLogger = new ComplianceAuditLogger();
  private killSwitchActive = false;

  public getCockpitSnapshot(tenantId: string, tier: TierLevel, theme: StitchThemeId = 'OBSIDIAN_QUANTUM') {
    const quota = this.meter.checkQuota(tenantId, tier, 0);
    return {
      version: '2026.1-STITCH',
      tenantId,
      tier,
      theme: STITCH_DESIGN_THEMES[theme],
      screens: STITCH_8_SCREENS,
      tierEntitlements: TIER_ENTITLEMENTS[tier],
      mcuQuota: quota,
      killSwitchActive: this.killSwitchActive,
      billingProviders: { primary: 'NOWPayments (USDT)', secondary: 'PayOS (VietQR VND)', blocked: ['Polar'] },
      auditChainIntegrity: this.auditLogger.verifyIntegrity(),
    };
  }

  public triggerEmergencyKillSwitch(tenantId: string, reason: string): { halted: boolean; auditRecord: ChainedAuditRecord; auditValid: boolean } {
    this.killSwitchActive = true;
    const auditRecord = this.auditLogger.append(tenantId, `EMERGENCY_KILL_SWITCH:${reason}`);
    return {
      halted: this.killSwitchActive,
      auditRecord,
      auditValid: this.auditLogger.verifyIntegrity(),
    };
  }

  public getMarketplace(): StrategyMarketplaceManager {
    return this.marketplace;
  }

  public getSorMeshSnapshot(
    algorithm: SorSplitterAlgorithm = 'ALMGREN_CHRISS_OPTIMAL',
    parentOrderNotionalUsd = 2500000,
  ) {
    return buildSorMeshConsoleSnapshot(algorithm, parentOrderNotionalUsd);
  }

  public getRegimeKellySnapshot(
    activeRegime: MarketRegimeState = 'NORMAL_LIQUID',
    portfolioEquityUsd = 1248500,
  ) {
    return buildRegimeKellyCockpitSnapshot(activeRegime, portfolioEquityUsd);
  }

  public getHawkesRadarSnapshot(inventoryUnits = 4.5, riskAversionGamma = 0.15) {
    return buildHawkesOrderFlowRadarSnapshot(inventoryUnits, riskAversionGamma);
  }

  public getQueueReactiveSnapshot(bestBidQueueSizeLots = 18.4, bestAskQueueSizeLots = 9.6) {
    return buildQueueReactiveCockpitSnapshot(bestBidQueueSizeLots, bestAskQueueSizeLots);
  }

  public getAvellanedaLipkinSnapshot(
    inventoryUnits = 4.5,
    riskAversionGamma = 0.5,
    volatilitySigma = 0.05,
    midPrice = 100,
  ) {
    return buildAvellanedaLipkinCockpitSnapshot(inventoryUnits, riskAversionGamma, volatilitySigma, midPrice);
  }

  public getStatArbGlostenMilgromSnapshot(informedTraderShareAlpha = 0.3, priorProbHighMu = 0.6) {
    return buildStatArbGlostenMilgromSnapshot(informedTraderShareAlpha, priorProbHighMu);
  }

  public getBlackLittermanRiskParitySnapshot(riskAversionLambda = 1.2, tau = 0.05) {
    return buildBlackLittermanRiskParitySnapshot(riskAversionLambda, tau);
  }

  public getLiquidityImpactSnapshot(totalShares = 100000, riskAversion = 0.001) {
    return buildLiquidityImpactSnapshot(totalShares, riskAversion);
  }
}
