// SPDX-License-Identifier: MIT
/**
 * Stitch UI 8-Screen Cockpit Engine & Design System Contract (2026.1-STITCH)
 * Implements the 8 core screens, 3 design token themes, and emergency kill-switch
 * specified in plans/company-blueprint/stitch-ui-prd-ideate.md.
 */

import { ComplianceAuditLogger, type ChainedAuditRecord } from '../security/audit-logger';
import { StrategyMarketplaceManager } from '../strategies/marketplace';
import { BillingMeter, TIER_ENTITLEMENTS } from './billing-meter';
import type { TierLevel } from './catalog';

export type StitchThemeId =
  | 'OBSIDIAN_QUANTUM'
  | 'BENTO_RAAS_GLASS'
  | 'NORDIC_MINIMALIST_QUANT';

export interface StitchDesignTokens {
  readonly themeId: StitchThemeId;
  readonly name: string;
  readonly backgroundCanvas: string;
  readonly surfaceCard: string;
  readonly primaryAccent: string;
  readonly secondaryAccent: string;
  readonly dangerAccent: string;
  readonly fontDisplay: string;
  readonly fontMono: string;
  readonly roundnessPx: 4 | 8;
}

export interface StitchScreenSpec {
  readonly screenId: string;
  readonly number: number;
  readonly titleEn: string;
  readonly titleVi: string;
  readonly viewport: 'DESKTOP' | 'MOBILE' | 'RESPONSIVE';
  readonly minTier: TierLevel;
}

export const STITCH_DESIGN_THEMES: Record<StitchThemeId, StitchDesignTokens> = {
  OBSIDIAN_QUANTUM: {
    themeId: 'OBSIDIAN_QUANTUM',
    name: 'Obsidian Quantum (Institutional Cyber-Quant)',
    backgroundCanvas: '#08090C',
    surfaceCard: '#0F1218',
    primaryAccent: '#00F2FE',
    secondaryAccent: '#00E599',
    dangerAccent: '#FF3B30',
    fontDisplay: 'Space Grotesk',
    fontMono: 'JetBrains Mono',
    roundnessPx: 4,
  },
  BENTO_RAAS_GLASS: {
    themeId: 'BENTO_RAAS_GLASS',
    name: 'Bento RaaS Glass (Modern Translucent SaaS)',
    backgroundCanvas: '#0D1117',
    surfaceCard: '#161B22',
    primaryAccent: '#6366F1',
    secondaryAccent: '#10B981',
    dangerAccent: '#FF3B30',
    fontDisplay: 'Plus Jakarta Sans',
    fontMono: 'Geist Mono',
    roundnessPx: 8,
  },
  NORDIC_MINIMALIST_QUANT: {
    themeId: 'NORDIC_MINIMALIST_QUANT',
    name: 'Nordic Minimalist Quant (Clean High-Signal Terminal)',
    backgroundCanvas: '#12151A',
    surfaceCard: '#181D24',
    primaryAccent: '#2563EB',
    secondaryAccent: '#059669',
    dangerAccent: '#FF3B30',
    fontDisplay: 'Geist',
    fontMono: 'Geist Mono',
    roundnessPx: 4,
  },
};

export const STITCH_8_SCREENS: readonly StitchScreenSpec[] = [
  { screenId: 'master-raas-dashboard', number: 1, titleEn: 'Master Cloud RaaS Dashboard', titleVi: 'Bảng Điều Khiển Cloud RaaS Tổng Thể', viewport: 'DESKTOP', minTier: 'BASIC' },
  { screenId: 'institutional-quant-cockpit', number: 2, titleEn: 'Institutional Quant Cockpit & Execution Terminal', titleVi: 'Buồng Lái Định Lượng & Thực Thi Almgren-Chriss', viewport: 'DESKTOP', minTier: 'PREMIUM' },
  { screenId: 'strategy-marketplace-hub', number: 3, titleEn: 'Strategy Marketplace & Creator Hub (70/30)', titleVi: 'Sàn Thuật Toán & Trung Tâm Tác Giả (70/30)', viewport: 'DESKTOP', minTier: 'BASIC' },
  { screenId: 'bilingual-alpha-leaderboard', number: 4, titleEn: 'Bilingual Backtest & Alpha Leaderboard', titleVi: 'Bảng Xếp Hạng Backtest & Alpha Song Ngữ', viewport: 'RESPONSIVE', minTier: 'BASIC' },
  { screenId: 'billing-and-sha256-audit', number: 5, titleEn: 'Multi-Tenant Billing & SHA-256 Audit Chain', titleVi: 'Thanh Toán PayOS/NOWPayments & Chuỗi Kiểm Toán SHA-256', viewport: 'DESKTOP', minTier: 'BASIC' },
  { screenId: 'byok-aes256-onboarding', number: 6, titleEn: 'Zero-Knowledge BYOK Onboarding Wizard', titleVi: 'Trình Thiết Lập Khóa BYOK Mã Hóa AES-256-GCM', viewport: 'RESPONSIVE', minTier: 'BASIC' },
  { screenId: 'mobile-companion-kill-switch', number: 7, titleEn: 'Mobile Companion & Emergency Kill-Switch', titleVi: 'Ứng Dụng Di Động & Ngắt Khẩn Cấp Kill-Switch', viewport: 'MOBILE', minTier: 'ENTERPRISE' },
  { screenId: 'universal-design-system', number: 8, titleEn: 'Universal Component Design System & Style Guide', titleVi: 'Hệ Thống Thiết Kế Component Chuẩn Hóa', viewport: 'DESKTOP', minTier: 'BASIC' },
];

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
}
