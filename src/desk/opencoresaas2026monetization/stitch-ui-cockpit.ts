// SPDX-License-Identifier: MIT
/**
 * Stitch UI Cockpit Engine & Design System Facade (2026.3-PRO-MAX)
 * Re-exports themes, SOR Mesh (#13), Regime-Kelly Matrix (#14), and UI/UX Pro Max Auditor.
 */

import { ComplianceAuditLogger, type ChainedAuditRecord } from '../security/audit-logger';
import { StrategyMarketplaceManager } from '../strategies/marketplace';
import { BillingMeter, TIER_ENTITLEMENTS } from './billing-meter';
import type { TierLevel } from './catalog';
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
}
