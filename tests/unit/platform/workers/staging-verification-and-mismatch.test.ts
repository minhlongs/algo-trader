import { describe, it, expect } from 'vitest';
import {
  assertStagingEnvironmentSafe,
  StagingManifest,
} from '../../../../src/shared/preflight/staging-guard';
import { execFileSync } from 'child_process';
import { resolve } from 'path';
import { writeFileSync, existsSync, unlinkSync } from 'fs';

const REPO_ROOT = resolve(__dirname, '../../../..');

describe('Staging Verification, Resource Resolution & Mismatch Gates (Fail-Closed)', () => {
  const manifest: StagingManifest = {
    targetEnv: 'staging',
    workerName: 'algo-trader-staging',
    requiredAccountId: 'cf-staging-acct-formal',
    allowedRoutes: [],
    allowedHostnames: ['algo-trader-staging.workers.dev', 'staging-api.cashclaw.internal'],
    prohibitedWorkerNames: ['algo-trader', 'algo-trader-prod', 'algo-trader-production'],
    prohibitedDatabaseNames: ['algo_trader', 'algo_trader_prod', 'algo_trader_production', 'production', 'prod', 'live'],
    prohibitedD1Ids: ['f29559f2-8e0b-461a-bd01-5665581beeee'],
    prohibitedKvIds: ['6c7199c0259b42db943aa13b200d8ea1'],
    prohibitedAccountIds: ['cf-production-account-id'],
    allowedDatabaseHosts: ['localhost', '127.0.0.1', 'postgres', 'staging-db', 'staging-postgres.internal'],
  };

  it('fails closed when targetEnv does not match "staging"', () => {
    expect(() => {
      assertStagingEnvironmentSafe({
        targetEnv: 'production',
        resolvedWrangler: { targetEnv: 'production', workerName: 'algo-trader', routes: [] },
        manifest,
        database: 'algo_trader_staging',
        host: 'staging-db',
        d1Id: 'staging-d1',
        kvId: 'staging-kv',
      }, { validateResolvedWrangler: true, enforceTargetMatching: true });
    }).toThrow(/targetEnv must explicitly be "staging"/);
  });

  it('fails closed when workerName matches prohibited production names', () => {
    expect(() => {
      assertStagingEnvironmentSafe({
        targetEnv: 'staging',
        resolvedWrangler: { targetEnv: 'staging', workerName: 'algo-trader', routes: [] },
        manifest,
        database: 'algo_trader_staging',
        host: 'staging-db',
        d1Id: 'staging-d1',
        kvId: 'staging-kv',
      }, { validateResolvedWrangler: true, enforceTargetMatching: true });
    }).toThrow(/matches production worker name/);
  });

  it('fails closed when resolved routes contain unallowed production custom domain', () => {
    expect(() => {
      assertStagingEnvironmentSafe({
        targetEnv: 'staging',
        resolvedWrangler: { targetEnv: 'staging', workerName: 'algo-trader-staging', routes: ['api.cashclaw.cc/*'] },
        manifest,
        database: 'algo_trader_staging',
        host: 'staging-db',
        d1Id: 'staging-d1',
        kvId: 'staging-kv',
      }, { validateResolvedWrangler: true, enforceTargetMatching: true });
    }).toThrow(/cannot define production route/);
  });

  it('fails closed when resolved D1 uses production D1 ID', () => {
    expect(() => {
      assertStagingEnvironmentSafe({
        targetEnv: 'staging',
        resolvedWrangler: {
          targetEnv: 'staging',
          workerName: 'algo-trader-staging',
          routes: [],
          d1Databases: [{ binding: 'SUBSCRIBERS', database_id: 'f29559f2-8e0b-461a-bd01-5665581beeee' }]
        },
        manifest,
        database: 'algo_trader_staging',
        host: 'staging-db',
        d1Id: 'staging-d1',
        kvId: 'staging-kv',
      }, { validateResolvedWrangler: true, enforceTargetMatching: true });
    }).toThrow(/uses production database_id/);
  });

  it('fails closed when environment D1 ID mismatches resolved wrangler D1 ID', () => {
    expect(() => {
      assertStagingEnvironmentSafe({
        targetEnv: 'staging',
        resolvedWrangler: {
          targetEnv: 'staging',
          workerName: 'algo-trader-staging',
          routes: [],
          d1Databases: [{ binding: 'SUBSCRIBERS', database_id: 'staging-d1-uuid-wrangler' }]
        },
        manifest,
        database: 'algo_trader_staging',
        host: 'staging-db',
        d1Id: 'staging-d1-uuid-env-different',
        kvId: 'staging-kv',
      }, { validateResolvedWrangler: true, enforceTargetMatching: true });
    }).toThrow(/does not match resolved wrangler D1 database_id/);
  });

  it('fails closed when target hostname is not in allowedHostnames manifest', () => {
    expect(() => {
      assertStagingEnvironmentSafe({
        targetEnv: 'staging',
        resolvedWrangler: {
          targetEnv: 'staging',
          workerName: 'algo-trader-staging',
          routes: [],
        },
        manifest,
        targetHostname: 'https://api.cashclaw.cc',
        database: 'algo_trader_staging',
        host: 'staging-db',
        d1Id: 'staging-d1',
        kvId: 'staging-kv',
      }, { validateResolvedWrangler: true, enforceTargetMatching: true });
    }).toThrow(/not in allowed hostnames list/);
  });

  it('fails closed when staging account ID is missing or mismatches required manifest account', () => {
    // 1. Missing account ID
    expect(() => {
      assertStagingEnvironmentSafe({
        targetEnv: 'staging',
        resolvedWrangler: {
          targetEnv: 'staging',
          workerName: 'algo-trader-staging',
          routes: [],
          accountId: null,
        },
        manifest,
        database: 'algo_trader_staging',
        host: 'staging-db',
        d1Id: 'staging-d1',
        kvId: 'staging-kv',
      }, { validateResolvedWrangler: true, enforceTargetMatching: true, requireAccountId: true });
    }).toThrow(/missing accountId for deploy target/);

    // 2. Mismatched account ID
    expect(() => {
      assertStagingEnvironmentSafe({
        targetEnv: 'staging',
        resolvedWrangler: {
          targetEnv: 'staging',
          workerName: 'algo-trader-staging',
          routes: [],
          accountId: 'cf-wrong-account-id',
        },
        manifest,
        database: 'algo_trader_staging',
        host: 'staging-db',
        d1Id: 'staging-d1',
        kvId: 'staging-kv',
      }, { validateResolvedWrangler: true, enforceTargetMatching: true, requireAccountId: true });
    }).toThrow(/does not match manifest requiredAccountId/);

    // 3. Prohibited production account ID
    expect(() => {
      assertStagingEnvironmentSafe({
        targetEnv: 'staging',
        resolvedWrangler: {
          targetEnv: 'staging',
          workerName: 'algo-trader-staging',
          routes: [],
          accountId: 'cf-production-account-id',
        },
        manifest,
        database: 'algo_trader_staging',
        host: 'staging-db',
        d1Id: 'staging-d1',
        kvId: 'staging-kv',
      }, { validateResolvedWrangler: true, enforceTargetMatching: true });
    }).toThrow(/matches prohibited production account/);

    // 4. Manifest missing required staging account blocks deployment
    const unprovisionedManifest = { ...manifest, requiredAccountId: null, accountStatus: 'BLOCKED_PENDING_OWNER_PROVISIONING' };
    expect(() => {
      assertStagingEnvironmentSafe({
        targetEnv: 'staging',
        resolvedWrangler: {
          targetEnv: 'staging',
          workerName: 'algo-trader-staging',
          routes: [],
          accountId: 'some-random-account',
        },
        manifest: unprovisionedManifest,
        database: 'algo_trader_staging',
        host: 'staging-db',
        d1Id: 'staging-d1',
        kvId: 'staging-kv',
      }, { validateResolvedWrangler: true, enforceTargetMatching: true, requireAccountId: true });
    }).toThrow(/BLOCKED: No staging Cloudflare account_id has been formally provisioned/);
  });

  it('accurately parses wrangler target via parse-wrangler-target.py without regex flaws', () => {
    const parserScript = resolve(REPO_ROOT, 'scripts/lib/parse-wrangler-target.py');
    const wranglerPath = resolve(REPO_ROOT, 'wrangler.toml');
    const output = execFileSync('python3', [parserScript, wranglerPath, 'staging'], { encoding: 'utf8' });
    const parsed = JSON.parse(output);

    expect(parsed.targetEnv).toBe('staging');
    expect(parsed.workerName).toBe('algo-trader-staging');
    expect(parsed.routes).toEqual([]);
  });

  describe('Preflight CLI Real Entrypoint with Mocked Mutation CLI', () => {
    const preflightCli = resolve(REPO_ROOT, 'scripts/staging-preflight-check.ts');
    const baseEnv = {
      ...process.env,
      TARGET_ENV: 'staging',
      DB_NAME: 'algo_trader_staging',
      DB_HOST: 'staging-db',
      CLOUDFLARE_D1_DATABASE_ID: '943fd11e-c81a-4342-afa6-7e80aa7a18df',
      CLOUDFLARE_KV_NAMESPACE_ID: '1ef051223fde46629f0af6bf270e8315',
      STAGING_WORKER_URL: 'https://algo-trader-staging.workers.dev',
      LIVE_TRADING_ENABLED: 'false',
      POLYMARKET_TRADING_MODE: 'paper',
    };

    it('Case 1: Fails closed when manifest requiredAccountId is null / unprovisioned (0 mutations)', () => {
      const customManifestPath = resolve(REPO_ROOT, '.tmp-manifest-test-unprovisioned.json');
      const unprovisionedManifest: StagingManifest = {
        ...manifest,
        requiredAccountId: null,
        accountStatus: 'BLOCKED_PENDING_OWNER_PROVISIONING',
      };
      writeFileSync(customManifestPath, JSON.stringify(unprovisionedManifest, null, 2), 'utf8');

      let exitCode = 0;
      let stderr = '';
      try {
        execFileSync('npx', ['tsx', preflightCli], {
          env: { ...baseEnv, STAGING_MANIFEST_PATH: customManifestPath },
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch (err: any) {
        exitCode = err.status ?? 1;
        stderr = (err.stderr || '') + (err.stdout || '');
      } finally {
        if (existsSync(customManifestPath)) unlinkSync(customManifestPath);
      }

      expect(exitCode).not.toBe(0);
      expect(stderr).toContain('BLOCKED: No staging Cloudflare account_id has been formally provisioned');
    });

    it('Case 2: Fails closed when resolved account is missing (manifest has requiredAccountId, but config has none)', () => {
      const customManifestPath = resolve(REPO_ROOT, '.tmp-manifest-test-required.json');
      const testManifest: StagingManifest = {
        ...manifest,
        requiredAccountId: 'cf-staging-formal-123',
      };
      writeFileSync(customManifestPath, JSON.stringify(testManifest, null, 2), 'utf8');

      let exitCode = 0;
      let stderr = '';
      try {
        execFileSync('npx', ['tsx', preflightCli], {
          env: {
            ...baseEnv,
            STAGING_MANIFEST_PATH: customManifestPath,
            CLOUDFLARE_ACCOUNT_ID: '', // explicitly empty
          },
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch (err: any) {
        exitCode = err.status ?? 1;
        stderr = (err.stderr || '') + (err.stdout || '');
      } finally {
        if (existsSync(customManifestPath)) unlinkSync(customManifestPath);
      }

      expect(exitCode).not.toBe(0);
      expect(stderr).toContain('missing accountId for deploy target');
    });

    it('Case 3: Fails closed when account mismatches required staging account', () => {
      const customManifestPath = resolve(REPO_ROOT, '.tmp-manifest-test-mismatch.json');
      const testManifest: StagingManifest = {
        ...manifest,
        requiredAccountId: 'cf-staging-formal-123',
      };
      writeFileSync(customManifestPath, JSON.stringify(testManifest, null, 2), 'utf8');

      let exitCode = 0;
      let stderr = '';
      try {
        execFileSync('npx', ['tsx', preflightCli], {
          env: {
            ...baseEnv,
            STAGING_MANIFEST_PATH: customManifestPath,
            CLOUDFLARE_ACCOUNT_ID: 'cf-wrong-different-account',
          },
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch (err: any) {
        exitCode = err.status ?? 1;
        stderr = (err.stderr || '') + (err.stdout || '');
      } finally {
        if (existsSync(customManifestPath)) unlinkSync(customManifestPath);
      }

      expect(exitCode).not.toBe(0);
      expect(stderr).toContain('does not match manifest requiredAccountId');
    });

    it('Case 4: Passes when account matches required staging account', () => {
      const customManifestPath = resolve(REPO_ROOT, '.tmp-manifest-test-match.json');
      const testManifest: StagingManifest = {
        ...manifest,
        requiredAccountId: 'cf-staging-formal-123',
      };
      writeFileSync(customManifestPath, JSON.stringify(testManifest, null, 2), 'utf8');

      let exitCode = 0;
      let stdout = '';
      try {
        const out = execFileSync('npx', ['tsx', preflightCli], {
          env: {
            ...baseEnv,
            STAGING_MANIFEST_PATH: customManifestPath,
            CLOUDFLARE_ACCOUNT_ID: 'cf-staging-formal-123',
          },
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        stdout = out;
      } catch (err: any) {
        exitCode = err.status ?? 1;
      } finally {
        if (existsSync(customManifestPath)) unlinkSync(customManifestPath);
      }

      expect(exitCode).toBe(0);
      expect(stdout).toContain('All staging preflight safety gates passed');
    });
  });
});
