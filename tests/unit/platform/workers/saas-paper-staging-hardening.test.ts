/**
 * SaaS/Paper Staging Hardening & B2/B3 Integration Tests (Red Phase)
 *
 * Covers:
 * 1. B2: Health route D1 binding probe (checks.d1 reflects env.SUBSCRIBERS and live query)
 * 2. B2: D1 schema for paper_trades_v3 matches persistence write & ledger read
 * 3. B3: Unified migration runner contract (shared/db vs db/migration-runner)
 * 4. B3: D1 migrations directory isolation in wrangler.toml & valid SQLite DDL
 * 5. NOWPayments: 11-column vs 11-value binding in worker processConfirmedPayment
 * 6. Telegram: Webhook secret token validation & outbound mock guard
 * 7. Tenant config: Auth requirement and tenant isolation guard
 * 8. Staging safety: assertStagingEnvironmentSafe blocks production targets
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, existsSync, readdirSync, writeFileSync, unlinkSync } from 'fs';
import { resolve } from 'path';
import { execSync } from 'child_process';

import { handleHealthRoute, handleTenantConfigSave } from '../../../../src/platform/workers/edge-proxy-inline-routes';
import { handleTelegramWebhook } from '../../../../src/platform/workers/api/telegram-bot';
import { sendTelegramMessage } from '../../../../src/platform/workers/api/telegram-bot-dispatch';
import { processConfirmedPayment } from '../../../../src/platform/workers/api/webhooks-nowpayments-helpers';
import type { Env as WorkerEnv } from '../../../../src/platform/workers/edge-proxy-types';
import { assertStagingEnvironmentSafe } from '../../../helpers/test-db-safety-guard';
import { runStagingPreflight } from '../../../../scripts/staging-preflight-check';

const REPO_ROOT = resolve(__dirname, '../../../..');

describe('SaaS/Paper Staging Hardening (TDD Test Suite)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. B2: Health route checks.d1 binding & probe', () => {
    it('reports d1 as "configured" and readiness as "ready" when env.SUBSCRIBERS probe succeeds for both subscriptions and paper_trades_v3', async () => {
      const mockEnv = {
        ENVIRONMENT: 'staging',
        CACHE: { get: vi.fn(), put: vi.fn() },
        SUBSCRIBERS: {
          prepare: vi.fn().mockImplementation((query: string) => ({
            first: vi.fn().mockImplementation(async () => {
              if (query.includes('SELECT 1')) return { ready: 1 };
              if (query.includes('subscriptions')) return { count: 5 };
              if (query.includes('paper_trades_v3')) return { count: 12 };
              return null;
            }),
          })),
        },
      } as unknown as WorkerEnv;

      const res = await handleHealthRoute(mockEnv, false);
      expect(res.status).toBe(200);
      const body = await res.json() as {
        status: string;
        checks: { d1: string; kv: string };
        readiness: { d1: string; schema: string; details: { subscriptions: boolean; paperTrades: boolean } };
      };

      expect(body.status).toBe('ok');
      expect(body.checks.d1).toBe('configured');
      expect(body.readiness.d1).toBe('ready');
      expect(body.readiness.schema).toBe('ready');
      expect(body.readiness.details.subscriptions).toBe(true);
      expect(body.readiness.details.paperTrades).toBe(true);
    });

    it('reports status 503 and schema as "degraded" when paper_trades_v3 table is missing even if subscriptions is ready', async () => {
      const mockEnv = {
        ENVIRONMENT: 'staging',
        CACHE: { get: vi.fn(), put: vi.fn() },
        SUBSCRIBERS: {
          prepare: vi.fn().mockImplementation((query: string) => ({
            first: vi.fn().mockImplementation(async () => {
              if (query.includes('SELECT 1')) return { ready: 1 };
              if (query.includes('subscriptions')) return { count: 5 };
              if (query.includes('paper_trades_v3')) throw new Error('no such table: paper_trades_v3');
              return null;
            }),
          })),
        },
      } as unknown as WorkerEnv;

      const res = await handleHealthRoute(mockEnv, false);
      expect(res.status).toBe(503);
      const body = await res.json() as {
        status: string;
        readiness: { d1: string; schema: string; details: { subscriptions: boolean; paperTrades: boolean } };
      };

      expect(body.status).toBe('degraded');
      expect(body.readiness.schema).toBe('degraded');
      expect(body.readiness.details.subscriptions).toBe(true);
      expect(body.readiness.details.paperTrades).toBe(false);
    });

    it('reports status 503, readiness.d1 as "query_failed" and schema as "degraded" when D1 probe throws', async () => {
      const mockEnv = {
        ENVIRONMENT: 'staging',
        CACHE: { get: vi.fn(), put: vi.fn() },
        SUBSCRIBERS: {
          prepare: vi.fn().mockReturnValue({
            first: vi.fn().mockRejectedValue(new Error('D1 connection reset')),
          }),
        },
      } as unknown as WorkerEnv;

      const res = await handleHealthRoute(mockEnv, false);
      expect(res.status).toBe(503);
      const body = await res.json() as {
        checks: { d1: string };
        readiness: { d1: string; schema: string };
      };

      expect(body.checks.d1).toBe('configured');
      expect(body.readiness.d1).toBe('query_failed');
      expect(body.readiness.schema).toBe('degraded');
    });

    it('reports d1 as "missing", readiness as "unbound" and HTTP 503 when neither env.SUBSCRIBERS nor env.DB is provided', async () => {
      const mockEnv = {
        ENVIRONMENT: 'staging',
        CACHE: { get: vi.fn(), put: vi.fn() },
      } as unknown as WorkerEnv;

      const res = await handleHealthRoute(mockEnv, false);
      expect(res.status).toBe(503); // Missing D1 binding fails readiness
      const body = await res.json() as {
        checks: { d1: string };
        readiness: { d1: string; schema: string };
      };
      expect(body.checks.d1).toBe('missing');
      expect(body.readiness.d1).toBe('missing');
      expect(body.readiness.schema).toBe('unbound');
    });
  });

  describe('2. B2: D1 schema execution on empty DB and prior schema revision', () => {
    it('executes full D1 migration chain (0001 -> 0002 -> 0003) sequentially on an empty SQLite database with 0 errors', () => {
      const d1Dir = resolve(REPO_ROOT, 'migrations/d1');
      expect(existsSync(d1Dir), 'migrations/d1 directory must exist').toBe(true);

      const d1Files = readdirSync(d1Dir).filter(f => f.endsWith('.sql')).sort();
      expect(d1Files.length).toBeGreaterThanOrEqual(3);

      // Concatenate all migrations and execute on in-memory SQLite via sqlite3 CLI stdin
      const allSql = d1Files.map(f => readFileSync(resolve(d1Dir, f), 'utf8')).join('\n');

      expect(() => {
        execSync('sqlite3 :memory:', { input: allSql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
      }).not.toThrow();
    });

    it('executes full D1 migration chain twice on the same DB to verify idempotent upgrades', () => {
      const d1Dir = resolve(REPO_ROOT, 'migrations/d1');
      const d1Files = readdirSync(d1Dir).filter(f => f.endsWith('.sql')).sort();
      const allSql = d1Files.map(f => readFileSync(resolve(d1Dir, f), 'utf8')).join('\n');

      // Run twice in succession
      const doubleSql = `${allSql}\n-- Second run:\n${allSql}`;

      expect(() => {
        execSync('sqlite3 :memory:', { input: doubleSql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
      }).not.toThrow();
    });
  });

  describe('3. B3: Unified PostgreSQL Migration Runner & D1 Isolation', () => {
    it('shared/db/migration-runner exports the same MIGRATIONS and runMigrations as src/db/migration-runner', async () => {
      const mainRunner = await import('../../../../src/db/migration-runner');
      const sharedRunner = await import('../../../../src/shared/db/migration-runner');

      expect((sharedRunner as any).MIGRATIONS).toBeDefined();
      expect((sharedRunner as any).MIGRATIONS.length).toBe(mainRunner.MIGRATIONS.length);
      expect((sharedRunner as any).runMigrations).toBeDefined();
    });

    it('wrangler.toml points migrations_dir to migrations/d1 and env.staging has isolated settings', () => {
      const wranglerPath = resolve(REPO_ROOT, 'wrangler.toml');
      const content = readFileSync(wranglerPath, 'utf8');

      expect(content).toMatch(/migrations_dir\s*=\s*"migrations\/d1"/);
      expect(content).toMatch(/\[env\.staging\]/);
      expect(content).toMatch(/routes\s*=\s*\[\]/);
    });

    it('all files in migrations/d1/ are valid SQLite DDL and contain NO PostgreSQL-only features', () => {
      const d1Dir = resolve(REPO_ROOT, 'migrations/d1');
      if (!existsSync(d1Dir)) return;

      const d1Files = readdirSync(d1Dir).filter(f => f.endsWith('.sql'));

      for (const file of d1Files.sort()) {
        const sql = readFileSync(resolve(d1Dir, file), 'utf8');
        expect(sql).not.toMatch(/TIMESTAMPTZ/i);
        expect(sql).not.toMatch(/UUID\s+PRIMARY/i);
        expect(sql).not.toMatch(/DO\s+\$\$/i);
        expect(sql).not.toMatch(/SERIAL\s+PRIMARY/i);
        expect(sql).not.toMatch(/JSONB/i);
      }
    });
  });

  describe('4. NOWPayments Worker 11-column vs 11-placeholder SQL integrity', () => {
    it('executes processConfirmedPayment with matching column count and placeholder count', async () => {
      let executedSql = '';
      let boundValues: unknown[] = [];

      const d1Mock = {
        prepare: (sql: string) => {
          executedSql = sql;
          return {
            bind: (...args: unknown[]) => {
              boundValues = args;
              return {
                run: async () => ({ meta: { changes: 1 } }),
              };
            },
          };
        },
      };

      const cacheStore = new Map<string, string>();
      cacheStore.set('invoice:ord_123', JSON.stringify({ userId: 'user_test', tier: 'PRO' }));
      const kvMock = {
        get: async (key: string) => cacheStore.get(key) ?? null,
        put: async (key: string, val: string) => { cacheStore.set(key, val); },
      };

      const ipn = {
        payment_id: 12345,
        payment_status: 'confirmed',
        pay_address: '0x123',
        price_amount: 99,
        price_currency: 'usd',
        pay_amount: 99,
        amount_received: 99,
        order_id: 'ord_123',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      await expect(processConfirmedPayment(d1Mock as any, kvMock as any, ipn)).resolves.not.toThrow();

      // Verify the INSERT statement structure
      const placeholderMatches = executedSql.match(/\?/g);
      expect(placeholderMatches).toBeDefined();
      expect(placeholderMatches!.length).toBe(11);
      expect(boundValues.length).toBe(11);
      expect(boundValues[1]).toBe('user_test');
      expect(boundValues[2]).toBe('PRO');
      expect(boundValues[3]).toBe('active');
    });
  });

  describe('5. Telegram Webhook Secret & Outbound Mock Guard', () => {
    it('rejects webhook requests with 401 when TELEGRAM_WEBHOOK_SECRET is configured and secret header is missing or wrong', async () => {
      const env = {
        TELEGRAM_BOT_TOKEN: 'test_token',
        TELEGRAM_WEBHOOK_SECRET: 'super-secret-telegram-token',
        CACHE: { get: vi.fn(), put: vi.fn() },
      } as unknown as WorkerEnv;

      const reqMissing = new Request('https://api.cashclaw.cc/api/telegram/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ update_id: 1 }),
      });

      const resMissing = await handleTelegramWebhook(reqMissing, env as any);
      expect(resMissing.status).toBe(401);

      const reqWrong = new Request('https://api.cashclaw.cc/api/telegram/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-Bot-Api-Secret-Token': 'wrong-secret',
        },
        body: JSON.stringify({ update_id: 1 }),
      });

      const resWrong = await handleTelegramWebhook(reqWrong, env as any);
      expect(resWrong.status).toBe(401);
    });

    it('does not make external HTTP calls when TELEGRAM_MOCK is "true"', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      await sendTelegramMessage('token', 12345, 'test message', undefined, { TELEGRAM_MOCK: 'true' } as any);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('6. Tenant Config Authentication & Isolation (Fail-Closed KV)', () => {
    it('rejects with 401 and performs 0 KV writes when JWT_SECRET is completely missing', async () => {
      const cachePut = vi.fn();
      const env = {
        CACHE: { put: cachePut },
      } as unknown as WorkerEnv;

      const req = new Request('https://api.cashclaw.cc/api/tenants/t_123/config', {
        method: 'POST',
        headers: { Authorization: 'Bearer some-token' },
        body: JSON.stringify({ theme: 'dark' }),
      });

      const res = await handleTenantConfigSave(req, env, '/api/tenants/t_123/config');
      expect(res.status).toBe(401);
      expect(cachePut).toHaveBeenCalledTimes(0);
    });

    it('rejects with 401 and performs 0 KV writes when Authorization header is missing', async () => {
      const cachePut = vi.fn();
      const env = {
        JWT_SECRET: 'jwt-staging-secret',
        CACHE: { put: cachePut },
      } as unknown as WorkerEnv;

      const req = new Request('https://api.cashclaw.cc/api/tenants/t_123/config', {
        method: 'POST',
        body: JSON.stringify({ theme: 'dark' }),
      });

      const res = await handleTenantConfigSave(req, env, '/api/tenants/t_123/config');
      expect(res.status).toBe(401);
      expect(cachePut).toHaveBeenCalledTimes(0);
    });

    it('rejects with 401 and performs 0 KV writes when bearer token is invalid or tampered', async () => {
      const cachePut = vi.fn();
      const env = {
        JWT_SECRET: 'jwt-staging-secret',
        CACHE: { put: cachePut },
      } as unknown as WorkerEnv;

      const req = new Request('https://api.cashclaw.cc/api/tenants/t_123/config', {
        method: 'POST',
        headers: { Authorization: 'Bearer invalid.token.signature' },
        body: JSON.stringify({ theme: 'dark' }),
      });

      const res = await handleTenantConfigSave(req, env, '/api/tenants/t_123/config');
      expect(res.status).toBe(401);
      expect(cachePut).toHaveBeenCalledTimes(0);
    });

    it('rejects cross-tenant config updates with 403 and performs 0 KV writes', async () => {
      const { createJwt } = await import('../../../../src/platform/workers/crypto-utils');
      const token = await createJwt({ sub: 'user@example.com', tenantId: 't_user', tier: 'PRO', role: 'user' }, 'jwt-secret');
      const cachePut = vi.fn();

      const env = {
        JWT_SECRET: 'jwt-secret',
        CACHE: { put: cachePut },
      } as unknown as WorkerEnv;

      const req = new Request('https://api.cashclaw.cc/api/tenants/t_other/config', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ theme: 'dark' }),
      });

      const res = await handleTenantConfigSave(req, env, '/api/tenants/t_other/config');
      expect(res.status).toBe(403);
      expect(cachePut).toHaveBeenCalledTimes(0);
    });

    it('successfully saves config to KV with 200 when authenticated for the matching tenant', async () => {
      const { createJwt } = await import('../../../../src/platform/workers/crypto-utils');
      const token = await createJwt({ sub: 'user@example.com', tenantId: 't_owner', tier: 'PRO', role: 'user' }, 'jwt-secret');
      const cachePut = vi.fn().mockResolvedValue(undefined);

      const env = {
        JWT_SECRET: 'jwt-secret',
        CACHE: { put: cachePut },
      } as unknown as WorkerEnv;

      const req = new Request('https://api.cashclaw.cc/api/tenants/t_owner/config', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ theme: 'dark', alertLevel: 'high' }),
      });

      const res = await handleTenantConfigSave(req, env, '/api/tenants/t_owner/config');
      expect(res.status).toBe(200);
      expect(cachePut).toHaveBeenCalledTimes(1);
      expect(cachePut).toHaveBeenCalledWith('config:t_owner', JSON.stringify({ theme: 'dark', alertLevel: 'high' }));
    });
  });

  describe('7. Staging Environment Safety Guard in Preflight & Migration', () => {
    it('assertStagingEnvironmentSafe throws when configuration references production DB, KV, D1 or live trading', () => {
      expect(() => {
        assertStagingEnvironmentSafe({
          database: 'algo_trader_prod',
          host: 'localhost',
        });
      }).toThrow(/REJECTED UNSAFE STAGING/);

      expect(() => {
        assertStagingEnvironmentSafe({
          database: 'algo_trader_staging',
          host: 'localhost',
          d1Id: 'f29559f2-8e0b-461a-bd01-5665581beeee', // Production D1 ID
        });
      }).toThrow(/REJECTED UNSAFE STAGING/);

      expect(() => {
        assertStagingEnvironmentSafe({
          database: 'algo_trader_staging',
          host: 'localhost',
          kvId: '6c7199c0259b42db943aa13b200d8ea1', // Production KV ID
        });
      }).toThrow(/REJECTED UNSAFE STAGING/);

      expect(() => {
        assertStagingEnvironmentSafe({
          database: 'algo_trader_staging',
          host: 'localhost',
          liveTradingEnabled: 'true',
        });
      }).toThrow(/REJECTED UNSAFE STAGING/);
    });

    it('assertStagingEnvironmentSafe enforces mandatory fields under requireDbFields option', () => {
      expect(() => {
        assertStagingEnvironmentSafe({
          database: '',
          host: 'localhost',
        }, { requireDbFields: true });
      }).toThrow(/Missing required "database" field/);

      expect(() => {
        assertStagingEnvironmentSafe({
          database: 'algo_trader_staging',
          host: '',
        }, { requireDbFields: true });
      }).toThrow(/Missing required "host" field/);
    });

    it('runStagingPreflight CLI passes on clean staging config and fails on production config', () => {
      const origEnv = { ...process.env };
      const tmpManifestPath = resolve(REPO_ROOT, '.tmp-saas-hardening-manifest.json');
      const provisionedManifest = {
        targetEnv: 'staging',
        workerName: 'algo-trader-staging',
        requiredAccountId: 'cf-staging-test-acct',
        accountStatus: 'PROVISIONED',
        allowedRoutes: [],
        allowedHostnames: ['algo-trader-staging.workers.dev', 'algo-trader-staging.agencyos-openclaw.workers.dev'],
        prohibitedWorkerNames: ['algo-trader', 'algo-trader-prod'],
        prohibitedDatabaseNames: ['algo_trader', 'algo_trader_prod'],
        prohibitedD1Ids: ['f29559f2-8e0b-461a-bd01-5665581beeee'],
        prohibitedKvIds: ['6c7199c0259b42db943aa13b200d8ea1'],
        prohibitedAccountIds: ['cf-production-account-id'],
        allowedDatabaseHosts: ['localhost'],
      };
      writeFileSync(tmpManifestPath, JSON.stringify(provisionedManifest, null, 2), 'utf8');

      try {
        process.env.DB_NAME = 'algo_trader_staging';
        process.env.DB_HOST = 'localhost';
        process.env.CLOUDFLARE_D1_DATABASE_ID = '943fd11e-c81a-4342-afa6-7e80aa7a18df';
        process.env.CLOUDFLARE_KV_NAMESPACE_ID = '1ef051223fde46629f0af6bf270e8315';
        process.env.CLOUDFLARE_ACCOUNT_ID = 'cf-staging-test-acct';
        process.env.LIVE_TRADING_ENABLED = 'false';
        process.env.POLYMARKET_TRADING_MODE = 'paper';

        const cleanResult = runStagingPreflight({ manifestPath: tmpManifestPath });
        expect(cleanResult.success).toBe(true);
        expect(cleanResult.errors).toHaveLength(0);

        // Test production DB conflict
        process.env.DB_NAME = 'algo_trader_prod';
        const prodResult = runStagingPreflight({ manifestPath: tmpManifestPath });
        expect(prodResult.success).toBe(false);
        expect(prodResult.errors.length).toBeGreaterThan(0);
      } finally {
        process.env = origEnv;
        if (existsSync(tmpManifestPath)) unlinkSync(tmpManifestPath);
      }
    });

    it('runStagingPreflight CLI fails when mandatory staging environment variables are missing', () => {
      const origEnv = { ...process.env };
      const tmpManifestPath = resolve(REPO_ROOT, '.tmp-saas-hardening-manifest-missing.json');
      const provisionedManifest = {
        targetEnv: 'staging',
        workerName: 'algo-trader-staging',
        requiredAccountId: 'cf-staging-test-acct',
        accountStatus: 'PROVISIONED',
        allowedRoutes: [],
        allowedHostnames: ['algo-trader-staging.workers.dev', 'algo-trader-staging.agencyos-openclaw.workers.dev'],
        prohibitedWorkerNames: ['algo-trader', 'algo-trader-prod'],
        prohibitedDatabaseNames: ['algo_trader', 'algo_trader_prod'],
        prohibitedD1Ids: ['f29559f2-8e0b-461a-bd01-5665581beeee'],
        prohibitedKvIds: ['6c7199c0259b42db943aa13b200d8ea1'],
        prohibitedAccountIds: ['cf-production-account-id'],
        allowedDatabaseHosts: ['localhost'],
      };
      writeFileSync(tmpManifestPath, JSON.stringify(provisionedManifest, null, 2), 'utf8');

      try {
        process.env.CLOUDFLARE_ACCOUNT_ID = 'cf-staging-test-acct';
        delete process.env.DB_NAME;
        delete process.env.DB_HOST;
        delete process.env.CLOUDFLARE_D1_DATABASE_ID;
        delete process.env.CLOUDFLARE_KV_NAMESPACE_ID;

        const missingResult = runStagingPreflight({ manifestPath: tmpManifestPath });
        expect(missingResult.success).toBe(false);
        expect(missingResult.errors.length).toBeGreaterThan(0);
        expect(missingResult.errors.some(e => e.includes('Missing required "database" field'))).toBe(true);
      } finally {
        process.env = origEnv;
        if (existsSync(tmpManifestPath)) unlinkSync(tmpManifestPath);
      }
    });

    it('assertStagingEnvironmentSafe succeeds on cleanly isolated staging config', () => {
      expect(() => {
        assertStagingEnvironmentSafe({
          database: 'algo_trader_staging',
          host: 'localhost',
          d1Id: 'algo-trader-db-staging',
          kvId: 'algo-trader-cache-staging',
          liveTradingEnabled: 'false',
          polymarketTradingMode: 'paper',
        });
      }).not.toThrow();
    });

    it('assertStagingEnvironmentSafe rejects invalid target, prod worker name or prod routes under enforceTargetMatching', () => {
      // Invalid targetEnv
      expect(() => {
        assertStagingEnvironmentSafe({
          targetEnv: 'production',
          workerName: 'algo-trader-staging',
          routes: [],
        }, { enforceTargetMatching: true });
      }).toThrow(/REJECTED UNSAFE TARGET: targetEnv must explicitly be "staging"/);

      // Production worker name
      expect(() => {
        assertStagingEnvironmentSafe({
          targetEnv: 'staging',
          workerName: 'algo-trader',
          routes: [],
        }, { enforceTargetMatching: true });
      }).toThrow(/REJECTED UNSAFE TARGET: workerName "algo-trader" matches production worker name/);

      // Production route
      expect(() => {
        assertStagingEnvironmentSafe({
          targetEnv: 'staging',
          workerName: 'algo-trader-staging',
          routes: ['api.cashclaw.cc/*'],
        }, { enforceTargetMatching: true });
      }).toThrow(/REJECTED UNSAFE ROUTE: staging target cannot define production route/);
    });

    it('health route fails with 503 when required columns are missing from subscriptions or paper_trades_v3', async () => {
      const mockEnv = {
        ENVIRONMENT: 'staging',
        CACHE: { get: vi.fn(), put: vi.fn() },
        SUBSCRIBERS: {
          prepare: vi.fn().mockImplementation((query: string) => ({
            first: vi.fn().mockImplementation(async () => {
              if (query.includes('SELECT 1')) return { ready: 1 };
              if (query.includes('subscriptions')) {
                // Missing column error
                throw new Error('no such column: tier');
              }
              if (query.includes('paper_trades_v3')) return { count: 1 };
              return null;
            }),
          })),
        },
      } as unknown as WorkerEnv;

      const res = await handleHealthRoute(mockEnv, false);
      expect(res.status).toBe(503);
      const body = await res.json() as {
        status: string;
        error?: string;
        readiness: { schema: string; details: { subscriptions: boolean; columns: { subscriptions: boolean } } };
      };
      expect(body.status).toBe('degraded');
      expect(body.readiness.schema).toBe('degraded');
      expect(body.readiness.details.subscriptions).toBe(false);
      expect(body.readiness.details.columns.subscriptions).toBe(false);
      expect(body.error).toContain('subscriptions schema verification failed');
    });
  });
});
