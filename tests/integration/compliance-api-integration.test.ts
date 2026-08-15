/**
 * Compliance API Integration Test
 *
 * Focused tests for the four compliance HTTP endpoints:
 *   POST /api/compliance/validate
 *   GET  /api/compliance/rules
 *   PUT  /api/compliance/rules/:id/toggle
 *   GET  /api/compliance/audit
 *
 * Uses in-memory Express app + supertest. Module-level mutable state
 * (ruleState, auditLog) is reset between describe blocks via vi.resetModules()
 * + dynamic imports so each block starts with a clean router.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks — registered before any module imports
// ---------------------------------------------------------------------------

vi.mock('../../src/shared/db/postgres-client', () => ({
  getDbClient: vi.fn(() => ({ query: vi.fn() })),
}));

vi.mock('../../src/platform/middleware/feature-gate', () => ({
  requireTier: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));

vi.mock('../../src/shared/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VALID_TRADE = {
  pair: 'BTC/USDT',
  side: 'buy' as const,
  amount: 5,       // 5 BTC
  price: 100,      // $100/BTC => total $500 — well below $10K threshold
  counterparty: 'exchange-a',
};

const BLOCKED_TRADE = {
  pair: 'BTC/USDT',
  side: 'buy' as const,
  amount: 15,      // 15 BTC
  price: 1000,     // $1000/BTC => total $15,000 — exceeds $10K AML threshold
  counterparty: 'exchange-a',
};

// ---------------------------------------------------------------------------
// Helpers — dynamic imports after vi.resetModules() for clean state
// ---------------------------------------------------------------------------

async function freshRouter() {
  vi.resetModules();
  // Re-register mocks after resetModules clears them
  vi.doMock('../../src/shared/db/postgres-client', () => ({
    getDbClient: vi.fn(() => ({ query: vi.fn() })),
  }));
  vi.doMock('../../src/platform/middleware/feature-gate', () => ({
    requireTier: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
  }));
  vi.doMock('../../src/shared/utils/logger', () => ({
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
  }));

  const { complianceRouter } = await import(
    '../../src/platform/api/routes/compliance-routes'
  );
  const { BUILT_IN_RULES } = await import(
    '../../src/desk/arbitrage/compliance/compliance-rules'
  );

  // Lazy require so we can build app inline
  const express = (await import('express')).default;

  const app = express();
  app.use(express.json());
  app.use(complianceRouter);
  app.use((_req: unknown, res: { status: (n: number) => { json: (o: unknown) => unknown } }) =>
    res.status(404).json({ error: 'Not found' }),
  );

  return { app, BUILT_IN_RULES };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Compliance API Integration', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // POST /api/compliance/validate
  // -----------------------------------------------------------------------

  describe('POST /api/compliance/validate', () => {
    it('passes a valid $500 trade through all enabled rules', async () => {
      const { app } = await freshRouter();

      const res = await (await import('supertest')).default(app)
        .post('/api/compliance/validate')
        .send(VALID_TRADE);

      expect(res.status).toBe(200);
      expect(res.body.passed).toBe(true);
      expect(Array.isArray(res.body.results)).toBe(true);

      const failed = res.body.results.filter(
        (r: { passed: boolean }) => r.passed === false,
      );
      expect(failed.length).toBe(0);
    });

    it('blocks a $15K trade via AML transaction-limit rule', async () => {
      const { app } = await freshRouter();

      const res = await (await import('supertest')).default(app)
        .post('/api/compliance/validate')
        .send(BLOCKED_TRADE);

      expect(res.status).toBe(200);
      expect(res.body.passed).toBe(false);

      const failed = res.body.results.filter(
        (r: { passed: boolean }) => r.passed === false,
      );
      expect(failed.length).toBeGreaterThan(0);
      expect(failed[0].ruleId).toMatch(/^AML/);
      expect(typeof failed[0].message).toBe('string');
      expect(failed[0].message.length).toBeGreaterThan(0);
    });

    it('returns 400 for missing required fields', async () => {
      const { app } = await freshRouter();

      const res = await (await import('supertest')).default(app)
        .post('/api/compliance/validate')
        .send({ pair: 'BTC/USDT' }); // missing side, amount, price, counterparty

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it('includes severity and timestamp in each result', async () => {
      const { app } = await freshRouter();

      const res = await (await import('supertest')).default(app)
        .post('/api/compliance/validate')
        .send(VALID_TRADE);

      expect(res.status).toBe(200);
      for (const result of res.body.results) {
        expect(result).toHaveProperty('ruleId');
        expect(result).toHaveProperty('passed');
        expect(result).toHaveProperty('message');
        expect(result).toHaveProperty('severity');
        expect(typeof result.timestamp).toBe('number');
      }
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/compliance/rules
  // -----------------------------------------------------------------------

  describe('GET /api/compliance/rules', () => {
    it('returns all built-in rules with enabled status', async () => {
      const { app, BUILT_IN_RULES } = await freshRouter();

      const res = await (await import('supertest')).default(app).get('/api/compliance/rules');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.rules)).toBe(true);
      expect(res.body.rules.length).toBe(BUILT_IN_RULES.length);

      for (const rule of res.body.rules) {
        expect(typeof rule.id).toBe('string');
        expect(typeof rule.name).toBe('string');
        expect(typeof rule.enabled).toBe('boolean');
      }
    });

    it('rules match the BUILT_IN_RULES ids', async () => {
      const { app, BUILT_IN_RULES } = await freshRouter();

      const res = await (await import('supertest')).default(app).get('/api/compliance/rules');
      const returnedIds = res.body.rules.map((r: { id: string }) => r.id);
      const expectedIds = BUILT_IN_RULES.map((r: { id: string }) => r.id);

      expect(returnedIds).toEqual(expectedIds);
    });

    it('reports correct initial enabled state for each rule', async () => {
      const { app, BUILT_IN_RULES } = await freshRouter();

      const res = await (await import('supertest')).default(app).get('/api/compliance/rules');

      for (const rule of res.body.rules) {
        const original = BUILT_IN_RULES.find((r: { id: string }) => r.id === rule.id);
        expect(original).toBeDefined();
        expect(rule.enabled).toBe(original!.enabled);
      }
    });
  });

  // -----------------------------------------------------------------------
  // PUT /api/compliance/rules/:id/toggle
  // -----------------------------------------------------------------------

  describe('PUT /api/compliance/rules/:id/toggle', () => {
    it('toggles a rule from enabled to disabled', async () => {
      const { app, BUILT_IN_RULES } = await freshRouter();
      const supertest = (await import('supertest')).default;
      const enabledRule = BUILT_IN_RULES.find((r: { enabled: boolean }) => r.enabled);
      expect(enabledRule).toBeDefined();

      const res = await supertest(app)
        .put(`/api/compliance/rules/${enabledRule!.id}/toggle`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(enabledRule!.id);
      expect(res.body.enabled).toBe(false);
      expect(typeof res.body.name).toBe('string');
    });

    it('toggles a rule from disabled back to enabled', async () => {
      const { app, BUILT_IN_RULES } = await freshRouter();
      const supertest = (await import('supertest')).default;
      const enabledRule = BUILT_IN_RULES.find((r: { enabled: boolean }) => r.enabled);
      expect(enabledRule).toBeDefined();

      // First toggle: enabled -> disabled
      await supertest(app).put(`/api/compliance/rules/${enabledRule!.id}/toggle`);

      // Second toggle: disabled -> enabled
      const res = await supertest(app)
        .put(`/api/compliance/rules/${enabledRule!.id}/toggle`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(enabledRule!.id);
      expect(res.body.enabled).toBe(true);
    });

    it('returns 404 for non-existent rule id', async () => {
      const { app } = await freshRouter();

      const res = await (await import('supertest')).default(app)
        .put('/api/compliance/rules/NONEXISTENT-999/toggle');

      expect(res.status).toBe(404);
      expect(res.body.error).toBeDefined();
    });

    it('persists toggle state for subsequent validate calls', async () => {
      const { app } = await freshRouter();
      const supertest = (await import('supertest')).default;

      // Disable the AML transaction limit rule
      await supertest(app).put('/api/compliance/rules/AML-001/toggle');

      // The $15K trade should now pass since AML-001 is disabled
      const res = await supertest(app)
        .post('/api/compliance/validate')
        .send(BLOCKED_TRADE);

      expect(res.status).toBe(200);
      expect(res.body.passed).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/compliance/audit
  // -----------------------------------------------------------------------

  describe('GET /api/compliance/audit', () => {
    it('returns empty audit log initially', async () => {
      const { app } = await freshRouter();

      const res = await (await import('supertest')).default(app).get('/api/compliance/audit');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.entries)).toBe(true);
      expect(res.body.entries.length).toBe(0);
    });

    it('populates audit log after blocked trade', async () => {
      const { app } = await freshRouter();
      const supertest = (await import('supertest')).default;

      // Valid trade passes all rules — no audit entries
      await supertest(app)
        .post('/api/compliance/validate')
        .send(VALID_TRADE);

      // Blocked trade fails AML-001 — creates audit entry
      await supertest(app)
        .post('/api/compliance/validate')
        .send(BLOCKED_TRADE);

      const res = await supertest(app).get('/api/compliance/audit');

      expect(res.status).toBe(200);
      // Only blocked trades produce audit entries (per implementation)
      expect(res.body.entries.length).toBeGreaterThanOrEqual(1);

      for (const entry of res.body.entries) {
        expect(typeof entry.timestamp).toBe('number');
        expect(entry).toHaveProperty('ruleId');
        expect(entry).toHaveProperty('action');
      }
    });

    it('audit entries have correct structure', async () => {
      const { app } = await freshRouter();
      const supertest = (await import('supertest')).default;

      await supertest(app)
        .post('/api/compliance/validate')
        .send(BLOCKED_TRADE);

      const res = await supertest(app).get('/api/compliance/audit');

      expect(res.status).toBe(200);
      expect(res.body.entries.length).toBe(1);

      const entry = res.body.entries[0];
      expect(entry.ruleId).toBe('AML-001');
      expect(entry.action).toBe('blocked');
      expect(entry.pair).toBe('BTC/USDT');
      expect(entry.amount).toBe(15);
      expect(typeof entry.counterparty).toBe('string');
    });
  });
});
