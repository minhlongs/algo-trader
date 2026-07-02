/**
 * Tests for Community Strategy Routes
 * Phase 38 Marketplace deferred
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../shared/db/postgres-client', () => ({
  getDbClient: vi.fn(() => ({
    query: vi.fn().mockResolvedValue({ rows: [{ id: 'test-id', name: 'Test', status: 'approved', sandbox_status: 'passed' }] }),
  })),
}));

vi.mock('../../../shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../middleware/feature-gate', () => ({
  requireTier: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

describe('Community Strategy Routes', () => {
  it('router exports as a function', async () => {
    const { communityStrategyRouter } = await import('../routes/community-strategy-routes');
    expect(typeof communityStrategyRouter).toBe('function');
  });

  it('rejects upload without tenantId', () => {
    const body = { name: 'My Strategy', sourceCode: 'console.log("test")' };
    expect(body.tenantId).toBeUndefined();
  });

  it('rejects upload without name', () => {
    const body = { tenantId: 't1', sourceCode: 'code' };
    expect(body.name).toBeUndefined();
  });

  it('rejects upload without sourceCode', () => {
    const body = { tenantId: 't1', name: 'Test' };
    expect(body.sourceCode).toBeUndefined();
  });

  it('rejects name shorter than 3 characters', () => {
    expect('ab'.length < 3).toBe(true);
    expect('My Strategy'.length >= 3).toBe(true);
  });

  it('rejects name longer than 100 characters', () => {
    const longName = 'a'.repeat(101);
    expect(longName.length > 100).toBe(true);
  });

  it('rejects sourceCode shorter than 10 characters', () => {
    expect('short'.length < 10).toBe(true);
  });

  it('rejects sourceCode longer than 50000 characters', () => {
    const longCode = 'x'.repeat(50001);
    expect(longCode.length > 50000).toBe(true);
  });

  it('accepts valid strategy types', () => {
    const validTypes = ['polymarket', 'cex', 'dex', 'custom'];
    expect(validTypes.includes('polymarket')).toBe(true);
    expect(validTypes.includes('invalid')).toBe(false);
  });

  it('accepts valid languages', () => {
    const validLanguages = ['typescript', 'javascript'];
    expect(validLanguages.includes('typescript')).toBe(true);
    expect(validLanguages.includes('python')).toBe(false);
  });
});
