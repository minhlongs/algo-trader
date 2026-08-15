/**
 * Sprint 4 Route Mounting Integration Test
 *
 * Verifies that 5 newly wired route groups respond correctly (not 404),
 * with proper content-type and basic response shape.
 *
 * Route groups tested:
 *   1. /api/v1/risk/*           — risk-routes.ts
 *   2. /api/positions/*         — positions.ts
 *   3. /api/backtest/*          — backtest.ts
 *   4. /api/v1/referral/*       — referral-routes.ts
 *   5. /api/v1/api-keys/*       — api-keys.ts
 *
 * Uses in-memory Express app + supertest. Module-level mocks ensure
 * all route handlers can execute without real DB or external services.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import supertest from 'supertest';

// ---------------------------------------------------------------------------
// Module-level mocks — registered before any route imports
// ---------------------------------------------------------------------------

vi.mock('../../src/shared/db/postgres-client', () => ({
  getDbClient: vi.fn(() => ({ query: vi.fn() })),
}));

vi.mock('../../src/platform/middleware/feature-gate', () => ({
  requireTier: vi.fn(
    () => (_req: unknown, _res: unknown, next: () => void) => next(),
  ),
}));

vi.mock('../../src/shared/utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../src/platform/risk/risk-engine', () => {
  return {
    RiskEngine: class MockRiskEngine {
      async getDrawdownStatus() {
        return {
          maxDrawdown: 0.05,
          currentDrawdown: 0.02,
          alerts: [],
        };
      }
      async computeVaR() {
        return { var95: 0.03, cvar95: 0.04 };
      }
      async invalidateCache() {
        return undefined;
      }
      async invalidateUserCache() {
        return undefined;
      }
    },
  };
});

vi.mock('../../src/platform/risk/types', () => ({
  RISK_FEATURE_FLAG: 'ENABLE_RISK_ENGINE',
}));

vi.mock('../../src/desk/risk/position-manager', () => ({
  PositionManager: class MockPositionManager {
    async closePosition() {
      return 150;
    }
  },
}));

vi.mock('../../src/platform/referral/referral-service', () => ({
  referralService: {
    getReferralStats: vi.fn().mockResolvedValue({
      totalClicks: 100,
      conversions: 10,
      earnings: 500,
    }),
    getReferralCode: vi.fn().mockResolvedValue('REF-ABC123'),
    registerReferralCode: vi.fn().mockResolvedValue('REF-NEW456'),
    trackReferralClick: vi.fn().mockResolvedValue({ tracked: true }),
    getCommissions: vi.fn().mockResolvedValue({ commissions: [], total: 0 }),
    validateReferralCode: vi.fn().mockResolvedValue({ valid: true }),
  },
}));

vi.mock('../../src/platform/api/schemas/referral.schemas', () => ({
  trackClickSchema: {
    safeParse: (d: unknown) => ({ success: true, data: d }),
  },
  generateCodeSchema: {
    safeParse: (d: unknown) => ({ success: true, data: d }),
  },
  validateReferralSchema: {
    safeParse: (d: unknown) => ({ success: true, data: d }),
  },
  paginationSchema: {
    safeParse: (d: unknown) => ({ success: true, data: d }),
  },
  commissionStatusSchema: {
    safeParse: (d: unknown) => ({ success: true, data: d }),
  },
}));

vi.mock('../../src/shared/tenant', () => ({
  resolveTenant: vi.fn().mockReturnValue({
    tenantId: 'test-tenant-001',
    role: 'admin',
  }),
  validateTenantId: vi.fn().mockReturnValue(true),
}));

vi.mock('../../src/platform/api/routes/marketplace-strategy-helpers', () => ({
  getTenantId: vi.fn().mockReturnValue('test-tenant-001'),
  getUserId: vi.fn().mockReturnValue('test-user-001'),
}));

vi.mock('../../src/platform/auth/api-key-helpers', () => ({
  generateApiKey: vi.fn().mockResolvedValue({
    id: 'key-001',
    fullKey: 'sk-test-abc123xyz',
    keyPrefix: 'sk-test',
    keyHash: 'hash123',
    tenantId: 'test-tenant-001',
    label: 'Test Key',
    createdAt: new Date('2026-01-01'),
  }),
  listApiKeys: vi.fn().mockResolvedValue([
    {
      id: 'key-001',
      label: 'Test Key',
      keyPrefix: 'sk-test',
      lastUsedAt: null,
      createdAt: new Date('2026-01-01'),
      revokedAt: null,
      expiresAt: null,
    },
  ]),
  revokeApiKey: vi.fn().mockResolvedValue(true),
}));

// ---------------------------------------------------------------------------
// Helpers — fresh app per describe block via dynamic import
// ---------------------------------------------------------------------------

async function createApp(routerPath: string, extraEnv?: Record<string, string>) {
  vi.resetModules();

  // Set env vars before importing route modules (some check process.env at load time)
  if (extraEnv) {
    Object.assign(process.env, extraEnv);
  }

  // Re-register all mocks after resetModules clears them
  vi.doMock('../../src/shared/db/postgres-client', () => ({
    getDbClient: vi.fn(() => ({ query: vi.fn() })),
  }));
  vi.doMock('../../src/platform/middleware/feature-gate', () => ({
    requireTier: vi.fn(
      () => (_req: unknown, _res: unknown, next: () => void) => next(),
    ),
  }));
  vi.doMock('../../src/shared/utils/logger', () => ({
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
  }));
  vi.doMock('../../src/platform/risk/risk-engine', () => ({
    RiskEngine: class MockRiskEngine {
      async getDrawdownStatus() {
        return {
          maxDrawdown: 0.05,
          currentDrawdown: 0.02,
          alerts: [],
        };
      }
      async computeVaR() {
        return { var95: 0.03, cvar95: 0.04 };
      }
      async invalidateCache() {
        return undefined;
      }
      async invalidateUserCache() {
        return undefined;
      }
    },
  }));
  vi.doMock('../../src/platform/risk/types', () => ({
    RISK_FEATURE_FLAG: 'ENABLE_RISK_ENGINE',
  }));
  vi.doMock('../../src/desk/risk/position-manager', () => ({
    PositionManager: class MockPositionManager {
      async closePosition() {
        return 150;
      }
    },
  }));
  vi.doMock('../../src/platform/referral/referral-service', () => ({
    referralService: {
      getReferralStats: vi.fn().mockResolvedValue({
        totalClicks: 100,
        conversions: 10,
        earnings: 500,
      }),
      getReferralCode: vi.fn().mockResolvedValue('REF-ABC123'),
      registerReferralCode: vi.fn().mockResolvedValue('REF-NEW456'),
      trackReferralClick: vi.fn().mockResolvedValue({ tracked: true }),
      getCommissions: vi
        .fn()
        .mockResolvedValue({ commissions: [], total: 0 }),
      validateReferralCode: vi.fn().mockResolvedValue({ valid: true }),
    },
  }));
  vi.doMock('../../src/platform/api/schemas/referral.schemas', () => ({
    trackClickSchema: {
      safeParse: (d: unknown) => ({ success: true, data: d }),
    },
    generateCodeSchema: {
      safeParse: (d: unknown) => ({ success: true, data: d }),
    },
    validateReferralSchema: {
      safeParse: (d: unknown) => ({ success: true, data: d }),
    },
    paginationSchema: {
      safeParse: (d: unknown) => ({ success: true, data: d }),
    },
    commissionStatusSchema: {
      safeParse: (d: unknown) => ({ success: true, data: d }),
    },
  }));
  vi.doMock('../../src/shared/tenant', () => ({
    resolveTenant: vi.fn().mockReturnValue({
      tenantId: 'test-tenant-001',
      role: 'admin',
    }),
    validateTenantId: vi.fn().mockReturnValue(true),
  }));
  vi.doMock(
    '../../src/platform/api/routes/marketplace-strategy-helpers',
    () => ({
      getTenantId: vi.fn().mockReturnValue('test-tenant-001'),
      getUserId: vi.fn().mockReturnValue('test-user-001'),
    }),
  );
  vi.doMock('../../src/platform/auth/api-key-helpers', () => ({
    generateApiKey: vi.fn().mockResolvedValue({
      id: 'key-001',
      fullKey: 'sk-test-abc123xyz',
      keyPrefix: 'sk-test',
      keyHash: 'hash123',
      tenantId: 'test-tenant-001',
      label: 'Test Key',
      createdAt: new Date('2026-01-01'),
    }),
    listApiKeys: vi.fn().mockResolvedValue([
      {
        id: 'key-001',
        label: 'Test Key',
        keyPrefix: 'sk-test',
        lastUsedAt: null,
        createdAt: new Date('2026-01-01'),
        revokedAt: null,
        expiresAt: null,
      },
    ]),
    revokeApiKey: vi.fn().mockResolvedValue(true),
  }));

  const mod = await import(routerPath);
  const routerKey = Object.keys(mod).find((k) => k !== 'default');
  const router = routerKey ? mod[routerKey] : mod.default;

  const app = express();
  app.use(express.json());

  // Inject tenant/user context required by route handlers
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).tenant = { id: 'test-tenant-001' };
    (req as any).user = { id: 'test-user-001', tenantId: 'test-tenant-001' };
    next();
  });

  app.use(router);

  // Catch-all 404 for unmatched routes
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found' });
  });

  return app;
}

// ===================================================================
// Tests
// ===================================================================

describe('Sprint 4 — Risk Routes', () => {
  let app: express.Express;

  beforeEach(async () => {
    app = await createApp('../../src/platform/api/routes/risk-routes', {
      ENABLE_RISK_ENGINE: 'true',
    });
  });

  it('GET /drawdown returns 200 with drawdown status', async () => {
    const res = await supertest(app).get('/drawdown');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('maxDrawdown');
    expect(res.body).toHaveProperty('currentDrawdown');
  });

  it('POST /var returns 200 with VaR result', async () => {
    const res = await supertest(app).post('/var').send({
      positions: [
        { symbol: 'BTC/USDT', currentValue: 5000, returns: [0.01, -0.02, 0.015] },
        { symbol: 'ETH/USDT', currentValue: 3000, returns: [0.02, -0.01, 0.03] },
      ],
    });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('var95');
  });

  it('POST /var with empty body returns 400 validation error', async () => {
    const res = await supertest(app).post('/var').send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('DELETE /cache returns 200 on success', async () => {
    const res = await supertest(app).delete('/cache');

    expect(res.status).toBe(200);
  });
});

describe('Sprint 4 — Positions Routes', () => {
  let app: express.Express;

  beforeEach(async () => {
    app = await createApp('../../src/platform/api/routes/positions');
  });

  it('POST /:id/close with valid body returns success', async () => {
    const res = await supertest(app)
      .post('/pos-123/close')
      .send({ symbol: 'BTC/USDT', exchange: 'binance', exitPrice: 65000 });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('pnl');
  });

  it('POST /:id/close with missing fields returns 400', async () => {
    const res = await supertest(app)
      .post('/pos-123/close')
      .send({ symbol: 'BTC/USDT' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('GET / returns 404 (no GET route defined)', async () => {
    const res = await supertest(app).get('/');

    expect(res.status).toBe(404);
  });
});

describe('Sprint 4 — Backtest Routes', () => {
  let app: express.Express;

  beforeEach(async () => {
    app = await createApp('../../src/platform/api/routes/backtest');
  });

  it('GET /results returns 200 with results array', async () => {
    const res = await supertest(app).get('/results');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /results/:id for nonexistent ID returns 404', async () => {
    const res = await supertest(app).get('/results/nonexistent-id');

    expect(res.status).toBe(404);
  });

  it('POST /submit with valid config returns 201', async () => {
    const res = await supertest(app).post('/submit').send({
      pair: 'BTC/USDT',
      timeframe: '1h',
      strategyName: 'arb-spread-v1',
      days: 30,
    });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('jobId');
    expect(res.body).toHaveProperty('status', 'completed');
  });
});

describe('Sprint 4 — Referral Routes', () => {
  let app: express.Express;

  beforeEach(async () => {
    app = await createApp('../../src/platform/api/routes/referral-routes');
  });

  it('GET /stats returns 200 with referral stats', async () => {
    const res = await supertest(app).get('/stats');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body.data).toHaveProperty('totalClicks');
  });

  it('GET /my-code returns 200 with referral code', async () => {
    const res = await supertest(app).get('/my-code');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(typeof res.body.data).toBe('string');
  });

  it('POST /generate-code returns 201', async () => {
    const res = await supertest(app).post('/generate-code').send({});

    expect(res.status).toBe(201);
    // generate-code returns the code string directly
    expect(typeof res.body).toBe('string');
  });

  it('POST /track-click with code in query returns 201', async () => {
    const res = await supertest(app)
      .post('/track-click?code=REF-ABC123')
      .send({ ip: '127.0.0.1', userAgent: 'test-agent' });

    expect(res.status).toBe(201);
  });

  it('GET /commissions returns 200', async () => {
    const res = await supertest(app).get('/commissions');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
  });

  it('GET /nonexistent returns 404', async () => {
    const res = await supertest(app).get('/nonexistent');

    expect(res.status).toBe(404);
  });
});

describe('Sprint 4 — API Keys Routes', () => {
  let app: express.Express;

  beforeEach(async () => {
    app = await createApp('../../src/platform/api/routes/api-keys');
  });

  it('GET / returns 200 with key list', async () => {
    const res = await supertest(app).get('/');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0]).toHaveProperty('id');
    expect(res.body.data[0]).toHaveProperty('keyPrefix');
  });

  it('POST / with valid label returns 201', async () => {
    const res = await supertest(app)
      .post('/')
      .send({ label: 'My Trading Key' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('fullKey');
    expect(res.body).toHaveProperty('keyPrefix');
  });

  it('DELETE /:id returns 200 when key revoked', async () => {
    const res = await supertest(app).delete('/key-001');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('revoked', true);
  });
});
