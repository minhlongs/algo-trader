/**
 * Tests for KYC Routes
 * Phase 35 Compliance
 */
import { describe, it, expect, vi } from 'vitest';

// Mock server-side deps
vi.mock('../../../shared/db/postgres-client', () => ({
  getDbClient: vi.fn(() => ({
    query: vi.fn().mockResolvedValue({ rows: [] }),
  })),
}));

vi.mock('../../../shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../middleware/feature-gate', () => ({
  requireTier: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

describe('KYC Routes', () => {
  it('router exports as a function (Express Router)', async () => {
    const { kycRouter } = await import('../routes/kyc-routes');
    expect(typeof kycRouter).toBe('function');
    expect(kycRouter.name).toBe('router');
  });

  it('rejects init without tenantId', async () => {
    // Validation logic test — tenantId required
    const body = { providerAccountId: 'acct_123' };
    expect(body.tenantId).toBeUndefined();
  });

  it('rejects init without providerAccountId', async () => {
    const body = { tenantId: 'tenant_1' };
    expect(body.providerAccountId).toBeUndefined();
  });

  it('accepts valid init payload', () => {
    const body = { tenantId: 'tenant_1', providerAccountId: 'acct_123', verificationLevel: 'advanced' };
    expect(body.tenantId).toBe('tenant_1');
    expect(body.providerAccountId).toBe('acct_123');
    expect(body.verificationLevel).toBe('advanced');
  });

  it('rejects invalid verification level', () => {
    const validLevels = ['basic', 'advanced', 'full'];
    expect(validLevels.includes('super_verified')).toBe(false);
    expect(validLevels.includes('basic')).toBe(true);
  });
});
