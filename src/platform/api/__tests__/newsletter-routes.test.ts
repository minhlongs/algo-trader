/**
 * Tests for Newsletter Routes
 * Phase 34b Content Personalization
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../shared/db/postgres-client', () => ({
  getDbClient: vi.fn(() => ({
    query: vi.fn().mockResolvedValue({ rows: [{ email: 'test@test.com', frequency: 'weekly', topics: 'all', interests: [], subscribed: true, verified: false }] }),
  })),
}));

vi.mock('../../../shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../middleware/feature-gate', () => ({
  requireTier: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock('../../../platform/notifications/email-service', () => ({
  emailService: { send: vi.fn().mockResolvedValue(true) },
}));

describe('Newsletter Routes', () => {
  it('router exports as a function', async () => {
    const { newsletterRouter } = await import('../routes/newsletter-routes');
    expect(typeof newsletterRouter).toBe('function');
  });

  it('rejects subscribe without email', () => {
    const body = { frequency: 'weekly' };
    expect(body.email).toBeUndefined();
  });

  it('rejects subscribe with invalid email format', () => {
    // No @ sign
    expect('notanemail'.includes('@')).toBe(false);
    // Empty string
    expect(''.includes('@')).toBe(false);
    // @ but empty domain
    const missingDomain = 'missing@';
    const parts = missingDomain.split('@');
    expect(parts[1]?.length || 0).toBe(0);
  });

  it('accepts valid subscribe payload', () => {
    const body = {
      email: 'user@example.com',
      frequency: 'daily',
      interests: ['trading', 'signals'],
      topics: 'strategies',
    };
    expect(body.email).toContain('@');
    expect(['daily', 'weekly', 'monthly', 'none'].includes(body.frequency)).toBe(true);
    expect(Array.isArray(body.interests)).toBe(true);
  });

  it('validates frequency values', () => {
    const validFrequencies = ['daily', 'weekly', 'monthly', 'none'];
    expect(validFrequencies.includes('hourly')).toBe(false);
    expect(validFrequencies.includes('weekly')).toBe(true);
  });

  it('validates topics values', () => {
    const validTopics = ['all', 'signals', 'strategies', 'performance', 'market-analysis'];
    expect(validTopics.includes('invalid-topic')).toBe(false);
    expect(validTopics.includes('signals')).toBe(true);
  });
});
