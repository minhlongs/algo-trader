import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { UnifiedIpnWebhookHandler } from '../../../src/billing/ipn-webhook';
import { runOpenCoreSaasCommand } from '../../../src/desk/commands/opencore-saas';
import {
  BillingMeter,
  LicenseGate,
  STITCH_8_SCREENS,
  STITCH_DESIGN_THEMES,
  StitchUiCockpitEngine,
} from '../../../src/desk/opencoresaas2026monetization';

describe('Wave 326: Stitch 8-Screen UI Cockpit & E2E Monetization Suite', () => {
  it('verifies all 8 Stitch UI PRD screens and 3 design token themes', () => {
    expect(STITCH_8_SCREENS).toHaveLength(8);
    expect(STITCH_8_SCREENS.map((s) => s.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(STITCH_DESIGN_THEMES.OBSIDIAN_QUANTUM.backgroundCanvas).toBe('#08090C');
    expect(STITCH_DESIGN_THEMES.BENTO_RAAS_GLASS.roundnessPx).toBe(8);
    expect(STITCH_DESIGN_THEMES.NORDIC_MINIMALIST_QUANT.primaryAccent).toBe('#2563EB');

    const engine = new StitchUiCockpitEngine();
    const snapshot = engine.getCockpitSnapshot('tenant-vn-01', 'ENTERPRISE', 'OBSIDIAN_QUANTUM');
    expect(snapshot.version).toBe('2026.1-STITCH');
    expect(snapshot.screens).toHaveLength(8);
    expect(snapshot.billingProviders.blocked).toContain('Polar');
    expect(snapshot.auditChainIntegrity).toBe(true);
  });

  it('executes Flow 2: 70/30 Strategy Marketplace + PayOS VietQR IPN + Polar hard block', async () => {
    const engine = new StitchUiCockpitEngine();
    const marketplace = engine.getMarketplace();
    marketplace.registerListing({
      strategyId: 'strat-rough-vol-321',
      creatorId: 'creator-mekong-01',
      name: 'Gatheral Rough Vol Arb',
      descriptionVi: 'Chiến lược biến động thô H < 0.5',
      descriptionEn: 'Rough volatility H < 0.5 statistical arbitrage',
      monthlySubscriptionUsd: 100,
      activeSubscribersCount: 9,
      isVerified: true,
    });
    marketplace.recordSubscriberAdd('strat-rough-vol-321');
    const revShare = marketplace.calculateMonthlyRevShare('strat-rough-vol-321');
    expect(revShare.grossRevenueUsd).toBe(1000);
    expect(revShare.creatorShareUsd).toBe(700);
    expect(revShare.platformShareUsd).toBe(300);

    const payosKey = 'payos-e2e-secret-2026';
    const ipn = new UnifiedIpnWebhookHandler({ payosChecksumKey: payosKey });
    const data = {
      accountNumber: '1903888999',
      amount: 1250000,
      currency: 'VND',
      description: 'tenant-vn-01 ENTERPRISE',
      orderCode: 326001,
    };
    const sorted = Object.keys(data)
      .sort()
      .map((k) => `${k}=${String(data[k as keyof typeof data])}`)
      .join('&');
    const signature = crypto.createHmac('sha256', payosKey).update(sorted).digest('hex');

    const activation = await ipn.handlePayOS({ code: '00', desc: 'success', data, signature });
    expect(activation.success).toBe(true);
    expect(activation.tier).toBe('ENTERPRISE');
    expect(() => ipn.handlePolarWebhook()).toThrow(/Polar is strictly forbidden/);
  });

  it('executes Flow 3: Emergency Kill-Switch with SHA-256 Audit Chain + LicenseGate/BillingMeter E2E', async () => {
    const engine = new StitchUiCockpitEngine();
    const killRes = engine.triggerEmergencyKillSwitch('tenant-vn-01', 'Flash crash circuit breaker');
    expect(killRes.halted).toBe(true);
    expect(killRes.auditRecord.sequenceNumber).toBe(1);
    expect(killRes.auditValid).toBe(true);

    const gate = new LicenseGate('e2e-license-secret-2026');
    const token = gate.signToken({
      tenantId: 'tenant-vn-01',
      tier: 'PREMIUM',
      issuedAt: Date.now() - 1000,
      expiresAt: Date.now() + 86400_000,
      maxStrategies: 10,
      maxRps: 100,
    });
    expect(gate.verifyToken(token, 'PREMIUM').isValid).toBe(true);
    expect(gate.verifyToken(token, 'MASTER').statusCode).toBe(402);

    const meter = new BillingMeter();
    meter.recordConsumption('tenant-basic-99', 1000);
    const blocked = meter.checkQuota('tenant-basic-99', 'BASIC', 1);
    expect(blocked.isAllowed).toBe(false);
    expect(blocked.statusCode).toBe(402);

    await runOpenCoreSaasCommand({ audit: true, funnel: true });
  });
});
