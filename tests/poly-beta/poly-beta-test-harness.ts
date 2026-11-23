/**
 * Real SQLite (`node:sqlite`) D1 + KV + `TenantPaperEngine` DO Test Harness
 * for `poly-beta-api` adversarial isolation and ledger accounting verification.
 */

import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type {
  PolyBetaD1Database,
  PolyBetaDoNamespace,
  PolyBetaEnv,
  PolyBetaKvNamespace,
  PolyBetaMarketSnapshot,
} from '../../src/platform/poly-beta/poly-beta-types';
import { TenantPaperEngine, type DoStorageLike } from '../../src/platform/poly-beta/tenant-paper-engine-do';

export function createSqliteD1(): { db: PolyBetaD1Database; raw: DatabaseSync } {
  const sqlite = new DatabaseSync(':memory:');
  const migrationSql = readFileSync(
    resolve(__dirname, '../../migrations/poly-beta-d1/0001-poly-beta-ledger.sql'),
    'utf8',
  );
  const inviteMigrationSql = readFileSync(
    resolve(__dirname, '../../migrations/poly-beta-d1/0002-poly-beta-invite-redemptions.sql'),
    'utf8',
  );
  const feedbackMigrationSql = readFileSync(
    resolve(__dirname, '../../migrations/poly-beta-d1/0003-poly-beta-feedback.sql'),
    'utf8',
  );
  sqlite.exec(migrationSql);
  sqlite.exec(inviteMigrationSql);
  sqlite.exec(feedbackMigrationSql);

  const db: PolyBetaD1Database = {
    prepare(query: string) {
      return {
        bind(...values: unknown[]) {
          const params = values.map((v) => (v === undefined ? null : (v as string | number | null)));
          return {
            async first<T = Record<string, unknown>>(): Promise<T | null> {
              const stmt = sqlite.prepare(query);
              const row = stmt.get(...params) as T | undefined;
              return row ?? null;
            },
            async all<T = Record<string, unknown>>(): Promise<{ results: T[] }> {
              const stmt = sqlite.prepare(query);
              const rows = stmt.all(...params) as T[];
              return { results: rows };
            },
            async run(): Promise<{ success: boolean }> {
              const stmt = sqlite.prepare(query);
              stmt.run(...params);
              return { success: true };
            },
          };
        },
      };
    },
    async batch(statements) {
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const out: unknown[] = [];
        for (const stmt of statements) {
          out.push(await stmt.run());
        }
        sqlite.exec('COMMIT');
        return out;
      } catch (err) {
        sqlite.exec('ROLLBACK');
        throw err;
      }
    },
  };
  return { db, raw: sqlite };
}

export function createMemoryKv(): PolyBetaKvNamespace {
  const map = new Map<string, string>();
  return {
    async get(key: string) { return map.get(key) ?? null; },
    async put(key: string, value: string) { map.set(key, value); },
    async delete(key: string) { map.delete(key); },
  };
}

export function createMemoryDoStorage(): DoStorageLike & { getScheduledAlarm(): number | null } {
  const store = new Map<string, unknown>();
  let alarmAt: number | null = null;
  return {
    async get<T = unknown>(key: string) { return store.get(key) as T | undefined; },
    async put(key: string, value: unknown) { store.set(key, value); },
    async deleteAll() { store.clear(); alarmAt = null; },
    async setAlarm(scheduledTime: number | Date) {
      alarmAt = typeof scheduledTime === 'number' ? scheduledTime : scheduledTime.getTime();
    },
    async deleteAlarm() { alarmAt = null; },
    getScheduledAlarm() { return alarmAt; },
  };
}

export function seedMarketSnapshots(nowMs = Date.now()): PolyBetaMarketSnapshot[] {
  return [
    {
      marketId: 'mkt-fed-rate-2026',
      question: 'Will the Federal Reserve cut rates at the December 2026 FOMC meeting?',
      slug: 'fed-rate-cut-dec-2026',
      category: 'Macroeconomics',
      yesTokenId: 'tok_fed_yes',
      noTokenId: 'tok_fed_no',
      bestBid: 0.44,
      bestAsk: 0.46,
      midPrice: 0.45,
      spreadBps: 444,
      feeRateBps: 0,
      tickSize: 0.01,
      minOrderShares: 5,
      source: 'polymarket-gamma-clob',
      sourceTimestampMs: nowMs - 2_000,
      fetchedAtMs: nowMs,
    },
    {
      marketId: 'mkt-eu-inflation-2026',
      question: 'Will Eurozone headline CPI print below 2.2% in Q4 2026?',
      slug: 'eu-cpi-below-2-2-q4-2026',
      category: 'Macroeconomics',
      yesTokenId: 'tok_eu_yes',
      noTokenId: 'tok_eu_no',
      bestBid: 0.58,
      bestAsk: 0.60,
      midPrice: 0.59,
      spreadBps: 339,
      feeRateBps: 0,
      tickSize: 0.01,
      minOrderShares: 5,
      source: 'polymarket-gamma-clob',
      sourceTimestampMs: nowMs - 1_500,
      fetchedAtMs: nowMs,
    },
  ];
}

const DEFAULT_TEST_SIGNUP_EMAILS = [
  'atomic-audit@example.com',
  'branch@example.com',
  ...Array.from({ length: 10 }, (_, i) => `branch${i}@example.com`),
  'branch99@example.com',
  'dev@example.com',
  'secure@example.com',
  'c1-ledger@example.com',
  'risk@example.com',
  'h3-halt@example.com',
  'm4-do@example.com',
  'm4-null@example.com',
  'm4@example.com',
  'guard@example.com',
  'alice@example.com',
  'bob@example.com',
  'stale-check@example.com',
  'trader1@example.com',
  'serial-do@example.com',
  'signed-client@example.com',
  'toxicity-aware-mm-paper@example.com',
  'neg-risk-bundle-paper@example.com',
  'bayesian-fair-value-paper@example.com',
] as const;

const DEFAULT_TEST_SIGNUP_ALLOWLIST = DEFAULT_TEST_SIGNUP_EMAILS.join(',');

export function testInviteTokenForEmail(email: string, salt = 'default'): string {
  return createHash('sha256')
    .update(`poly-beta-test-invite:${salt}:${email.trim().toLowerCase()}`)
    .digest('hex');
}

export function buildTestInvitesJson(
  entries: ReadonlyArray<{ rawToken: string; email: string; expiresAtMs?: number; disabled?: boolean }>,
): string {
  const defaultExpiry = Date.now() + 24 * 3600 * 1000;
  return JSON.stringify(
    entries.map((entry) => ({
      tokenHash: createHash('sha256').update(entry.rawToken).digest('hex'),
      email: entry.email.trim().toLowerCase(),
      expiresAtMs: entry.expiresAtMs ?? defaultExpiry,
      disabled: entry.disabled ?? false,
    })),
  );
}

const DEFAULT_TEST_SIGNUP_INVITES = buildTestInvitesJson(
  DEFAULT_TEST_SIGNUP_EMAILS.flatMap((email) => [
    { rawToken: testInviteTokenForEmail(email, 'default'), email, expiresAtMs: Date.now() + 7 * 24 * 3600 * 1000 },
    { rawToken: testInviteTokenForEmail(email, 'second'), email, expiresAtMs: Date.now() + 7 * 24 * 3600 * 1000 },
  ]),
);

export async function createPolyBetaTestHarness(options?: {
  signupAllowlist?: string | undefined;
  signupInvites?: string | undefined;
  marketDataEnabled?: string | undefined;
  maintenanceMode?: string | undefined;
}) {
  const { db, raw } = createSqliteD1();
  const kv = createMemoryKv();
  const engines = new Map<string, { instance: TenantPaperEngine; storage: ReturnType<typeof createMemoryDoStorage> }>();

  const env: PolyBetaEnv = {
    POLY_BETA_DB: db,
    POLY_BETA_KV: kv,
    TENANT_PAPER_ENGINE: {} as PolyBetaDoNamespace,
    ENVIRONMENT: 'test',
    LIVE_TRADING_ENABLED: 'false',
    ...(options && 'maintenanceMode' in options
      ? (options.maintenanceMode !== undefined ? { MAINTENANCE_MODE: options.maintenanceMode } : {})
      : {}),
    ...(options && 'marketDataEnabled' in options
      ? (options.marketDataEnabled !== undefined ? { MARKET_DATA_ENABLED: options.marketDataEnabled } : {})
      : { MARKET_DATA_ENABLED: 'true' }),
    SIGNUP_GATE_MODE: 'allowlist',
    ...(options && 'signupAllowlist' in options
      ? (options.signupAllowlist !== undefined ? { BETA_SIGNUP_ALLOWLIST: options.signupAllowlist } : {})
      : { BETA_SIGNUP_ALLOWLIST: DEFAULT_TEST_SIGNUP_ALLOWLIST }),
    ...(options && 'signupInvites' in options
      ? (options.signupInvites !== undefined ? { BETA_SIGNUP_INVITES: options.signupInvites } : {})
      : { BETA_SIGNUP_INVITES: DEFAULT_TEST_SIGNUP_INVITES }),
    G1_SOAK_LOCK: 'locked',
    G2_POLY_SHADOW_LOCK: 'locked',
    ALLOWED_ORIGINS: 'https://poly-beta-dashboard.pages.dev,http://localhost:5173',
    POLYMARKET_PUBLIC_GAMMA_URL: 'http://127.0.0.1:1/gamma',
    POLYMARKET_PUBLIC_CLOB_URL: 'http://127.0.0.1:1/clob',
    COMMIT_SHA: 'b778f53a',
  };

  env.TENANT_PAPER_ENGINE = {
    idFromName(name: string) { return name; },
    get(id: unknown) {
      const key = String(id);
      let entry = engines.get(key);
      if (!entry) {
        const storage = createMemoryDoStorage();
        const instance = new TenantPaperEngine({ storage }, env);
        entry = { instance, storage };
        engines.set(key, entry);
      }
      return {
        fetch(input: RequestInfo | URL, init?: RequestInit) {
          const req = input instanceof Request ? input : new Request(String(input), init);
          return entry!.instance.fetch(req);
        },
      };
    },
  };

  await kv.put('markets:public:v1', JSON.stringify(seedMarketSnapshots()));
  return { env, rawSqlite: raw, kv, engines };
}
