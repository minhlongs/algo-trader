import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { runOpenCoreSaasCommand } from '../../../src/desk/commands/opencore-saas';
import { OrderDispatcher } from '../../../src/desk/execution/order-dispatcher';
import { SubscriberTenantIsolator } from '../../../src/desk/subscriber-tenant-isolator';
import { ComplianceAuditLogger } from '../../../src/desk/security/audit-logger';
import { StrategyMarketplaceManager } from '../../../src/desk/strategies/marketplace';
import { UnifiedIpnWebhookHandler } from '../../../src/billing/ipn-webhook';
import { openCoreRouter } from '../../../src/platform/api/routes/open-core-routes';

const companyConfigPath = path.resolve(__dirname, '../../../.mekong/company.json');
// .mekong/ is gitignored operator state; skip on clean CI checkouts.
const hasCompanyConfig = fs.existsSync(companyConfigPath);

describe('Wave 316: Company Blueprint Sync & Multi-Tenant Monetization Suite', () => {
  it('dispatches orders via OrderDispatcher and tracks signal history', () => {
    const dispatcher = new OrderDispatcher({ initialMode: 'PAPER' });
    const intent = {
      intentId: 'intent-ord-1',
      engineId: 'CROSS_DEX_ARB' as const,
      symbol: 'BTC/USDT',
      venue: 'binance' as const,
      side: 'BUY' as const,
      quantity: 0.5,
      price: 68000,
      urgency: 'HIGH' as const,
      expectedEdgeBps: 15,
      expectedSharpe: 2.5,
      timeToExpiryMs: 5000,
      expiresAt: Date.now() + 5000,
      orderType: 'IOC' as const,
      isRiskReducing: false,
    };

    const result = dispatcher.dispatchOrder(intent);
    expect(result.status).toBe('FILLED');
    expect(dispatcher.getVirtualFillsCount()).toBe(1);
    expect(dispatcher.getSignalHistory()).toHaveLength(1);
  });

  it('validates SubscriberTenantIsolator and ComplianceAuditLogger', () => {
    const isolator = new SubscriberTenantIsolator();
    expect(isolator.createFilter('sub-user-42', 2).clause).toBe('AND subscriber_id = $2');
    expect(() => isolator.verifyAccess('sub-1', 'sub-2', false)).toThrow('cross-tenant access denied');

    const logger = new ComplianceAuditLogger();
    logger.append('tenant-a', 'ORDER_CREATED', 1000);
    logger.append('tenant-a', 'ORDER_FILLED', 1005);
    expect(logger.verifyIntegrity()).toBe(true);
  });

  it('calculates 70/30 creator revenue split in StrategyMarketplace', () => {
    const marketplace = new StrategyMarketplaceManager();
    marketplace.registerListing({
      strategyId: 'strat-almgren-1',
      creatorId: 'quant-whiz-99',
      name: 'Almgren-Chriss Optimal Execution',
      descriptionEn: 'Institutional TWAP/VWAP execution',
      descriptionVi: 'Chiến lược thực thi tổ chức',
      monthlySubscriptionUsd: 100,
      activeSubscribersCount: 10,
      isVerified: true,
    });

    const split = marketplace.calculateMonthlyRevShare('strat-almgren-1');
    expect(split.grossRevenueUsd).toBe(1000);
    expect(split.creatorShareUsd).toBe(700);
    expect(split.platformShareUsd).toBe(300);
  });

  it('handles PayOS IPN webhooks and strictly rejects Polar', async () => {
    const checksumKey = 'test-payos-checksum-key-2026';
    const handler = new UnifiedIpnWebhookHandler({ payosChecksumKey: checksumKey });

    expect(() => handler.handlePolarWebhook()).toThrow('Polar is strictly forbidden');

    const orderData = { orderCode: 98765, amount: 500000, description: 'tenant-viet-88 PREMIUM', currency: 'VND' };
    const signString = Object.keys(orderData).sort().map((k) => `${k}=${String(orderData[k as keyof typeof orderData] ?? '')}`).join('&');
    const signature = crypto.createHmac('sha256', checksumKey).update(signString).digest('hex');

    const result = await handler.handlePayOS({ code: '00', desc: 'Success', data: orderData, signature });
    expect(result.success).toBe(true);
    expect(result.tenantId).toBe('tenant-viet-88');
    expect(result.tier).toBe('PREMIUM');
  });

  it('runs open-core saas CLI commands without error', async () => {
    await expect(runOpenCoreSaasCommand({ steps: true, stepNumber: 1 })).resolves.not.toThrow();
    await expect(runOpenCoreSaasCommand({ audit: true })).resolves.not.toThrow();
    await expect(runOpenCoreSaasCommand({ funnel: true })).resolves.not.toThrow();
  });

  it.skipIf(!hasCompanyConfig)('verifies company blueprint artifacts and 5 phase documents exist on disk', () => {
    const root = path.resolve(__dirname, '../../../');
    expect(fs.existsSync(path.join(root, '.mekong/company.json'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'plans/company-blueprint/plan.md'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'plans/company-blueprint/tasks.md'))).toBe(true);
    for (let i = 1; i <= 5; i++) {
      const pad = String(i).padStart(2, '0');
      const files = fs.readdirSync(path.join(root, 'plans/company-blueprint'));
      const matching = files.find((f) => f.startsWith(`phase-${pad}-`));
      expect(matching).toBeDefined();
    }
    expect(fs.existsSync(path.join(root, 'CODE_OF_CONDUCT.md'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'SECURITY.md'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'CONTRIBUTING.md'))).toBe(true);
    expect(fs.existsSync(path.join(root, '.npmignore'))).toBe(true);
    expect(openCoreRouter.stack.length).toBeGreaterThanOrEqual(2);
  });
});
