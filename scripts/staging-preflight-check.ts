#!/usr/bin/env ts-node
/**
 * Staging Preflight Safety Check CLI
 *
 * Verifies that the staging configuration does not touch production resources
 * (PostgreSQL, D1, KV, domains) and that live trading is strictly disabled.
 *
 * Uses parse-wrangler-target.py to accurately resolve target configuration
 * without naive regex parsing, and validates against staging-manifest.json.
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { execFileSync } from 'child_process';
import {
  assertStagingEnvironmentSafe,
  ResolvedWranglerConfig,
  StagingManifest,
} from '../src/shared/preflight/staging-guard';

const REPO_ROOT = resolve(__dirname, '..');

export function runStagingPreflight(options?: {
  manifestPath?: string;
  wranglerPath?: string;
}): { success: boolean; errors: string[] } {
  const errors: string[] = [];

  console.log('[StagingPreflight] Starting fail-closed preflight safety check...');

  const wranglerPath = options?.wranglerPath || resolve(REPO_ROOT, 'wrangler.toml');
  const manifestPath = options?.manifestPath || resolve(REPO_ROOT, 'staging-manifest.json');
  const parserScript = resolve(REPO_ROOT, 'scripts/lib/parse-wrangler-target.py');

  if (!existsSync(wranglerPath)) {
    errors.push('wrangler.toml not found');
    return { success: false, errors };
  }

  let manifest: StagingManifest | undefined;
  if (existsSync(manifestPath)) {
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    } catch (e) {
      errors.push(`Failed to parse staging-manifest.json: ${e}`);
    }
  } else {
    errors.push('staging-manifest.json not found');
  }

  // 1. Resolve wrangler configuration via python parser
  let resolvedConfig: ResolvedWranglerConfig | null = null;
  const targetEnv = process.env.TARGET_ENV || process.env.CF_WORKER_ENV || 'staging';

  try {
    const output = execFileSync('python3', [parserScript, wranglerPath, targetEnv], {
      encoding: 'utf8',
    });
    resolvedConfig = JSON.parse(output);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    errors.push(`Failed to parse wrangler target configuration: ${errorMsg}`);
    return { success: false, errors };
  }

  // 2. Validate resolved configuration & environment variables
  try {
    const targetUrl = process.env.STAGING_WORKER_URL || process.env.WORKER_URL || 'https://algo-trader-staging.agencyos-openclaw.workers.dev';
    const d1Id = process.env.CLOUDFLARE_D1_DATABASE_ID ?? resolvedConfig?.d1Databases?.[0]?.database_id;
    const kvId = process.env.CLOUDFLARE_KV_NAMESPACE_ID ?? resolvedConfig?.kvNamespaces?.[0]?.id;
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID ?? (resolvedConfig?.accountId || undefined);
    assertStagingEnvironmentSafe({
      targetEnv,
      workerName: resolvedConfig?.workerName,
      routes: resolvedConfig?.routes,
      database: process.env.DB_NAME,
      host: process.env.DB_HOST,
      d1Id,
      kvId,
      accountId,
      liveTradingEnabled: process.env.LIVE_TRADING_ENABLED,
      polymarketTradingMode: process.env.POLYMARKET_TRADING_MODE,
      resolvedWrangler: resolvedConfig || undefined,
      manifest,
      targetHostname: targetUrl,
    }, {
      requireDbFields: true,
      requireCloudflareIds: true,
      requireAccountId: true,
      enforceTargetMatching: true,
      validateResolvedWrangler: true,
    });
    console.log('[StagingPreflight] Environment variables, resolved wrangler target, and manifest verified clean against production.');
  } catch (err) {
    errors.push(String(err));
  }

  if (errors.length > 0) {
    console.error('[StagingPreflight] ❌ PREFLIGHT CHECKS FAILED:');
    for (const err of errors) {
      console.error(`  - ${err}`);
    }
    return { success: false, errors };
  }

  console.log('[StagingPreflight] ✅ All staging preflight safety gates passed.');
  return { success: true, errors: [] };
}

if (require.main === module) {
  const result = runStagingPreflight({
    manifestPath: process.env.STAGING_MANIFEST_PATH,
    wranglerPath: process.env.WRANGLER_CONFIG_PATH,
  });
  if (!result.success) {
    process.exit(1);
  }
}
