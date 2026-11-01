/**
 * Staging Environment Preflight Safety Guard
 *
 * Enforces fail-closed isolation across staging runs, migrations, and deployments.
 * Prevents accidental connection to production PostgreSQL, production Cloudflare D1,
 * production Cloudflare KV, or live market execution.
 */

import {
  ALLOWED_STAGING_HOSTS,
  PRODUCTION_D1_ID,
  PRODUCTION_D1_IDS,
  PRODUCTION_DB_NAMES,
  PRODUCTION_KV_ID,
  PRODUCTION_WORKER_NAMES,
  type ResolvedWranglerConfig,
  type StagingEnvironmentConfig,
  type StagingGuardOptions,
  type StagingManifest,
} from './staging-guard-types';
import { validateResolvedWranglerTarget } from './staging-guard-wrangler';

export {
  ALLOWED_STAGING_HOSTS,
  PRODUCTION_D1_ID,
  PRODUCTION_D1_IDS,
  PRODUCTION_DB_NAMES,
  PRODUCTION_KV_ID,
  PRODUCTION_WORKER_NAMES,
  type ResolvedWranglerConfig,
  type StagingEnvironmentConfig,
  type StagingGuardOptions,
  type StagingManifest,
};

/**
 * Validates that the staging environment configuration is strictly isolated
 * from production resources and does not allow live market mutations.
 */
export function assertStagingEnvironmentSafe(
  config: StagingEnvironmentConfig,
  options: StagingGuardOptions = {},
): void {
  if (options.enforceTargetMatching) {
    if (!config.targetEnv || config.targetEnv.toLowerCase().trim() !== 'staging') {
      throw new Error(
        `[StagingSafetyGuard] REJECTED UNSAFE TARGET: targetEnv must explicitly be "staging", got "${config.targetEnv}".`,
      );
    }
    if (config.workerName && PRODUCTION_WORKER_NAMES.includes(config.workerName.toLowerCase().trim())) {
      throw new Error(
        `[StagingSafetyGuard] REJECTED UNSAFE TARGET: workerName "${config.workerName}" matches production worker name.`,
      );
    }
    if (config.routes && config.routes.length > 0) {
      for (const route of config.routes) {
        if (route.includes('cashclaw.cc') || route.includes('api.cashclaw.cc')) {
          throw new Error(
            `[StagingSafetyGuard] REJECTED UNSAFE ROUTE: staging target cannot define production route "${route}".`,
          );
        }
      }
    }
  }

  if (options.validateResolvedWrangler && config.resolvedWrangler) {
    validateResolvedWranglerTarget(config, options);
  }

  const manifest = config.manifest;
  const prohibitedDbNames = new Set([
    ...PRODUCTION_DB_NAMES.map((n) => n.toLowerCase()),
    ...(manifest?.prohibitedDatabaseNames?.map((n) => n.toLowerCase()) ?? []),
  ]);
  const allowedDbHosts = new Set([
    ...ALLOWED_STAGING_HOSTS.map((h) => h.toLowerCase()),
    ...(manifest?.allowedDatabaseHosts?.map((h) => h.toLowerCase()) ?? []),
  ]);
  const prohibitedD1Ids = new Set([
    ...PRODUCTION_D1_IDS.map((id) => id.toLowerCase()),
    ...(manifest?.prohibitedD1Ids?.map((id) => id.toLowerCase()) ?? []),
  ]);
  const prohibitedKvIds = new Set([
    PRODUCTION_KV_ID.toLowerCase(),
    ...(manifest?.prohibitedKvIds?.map((id) => id.toLowerCase()) ?? []),
  ]);

  if (options.requireDbFields) {
    if (!config.database || typeof config.database !== 'string' || !config.database.trim()) {
      throw new Error(
        '[StagingSafetyGuard] REJECTED UNSAFE STAGING: Missing required "database" field.',
      );
    }
    if (!config.host || typeof config.host !== 'string' || !config.host.trim()) {
      throw new Error(
        '[StagingSafetyGuard] REJECTED UNSAFE STAGING: Missing required "host" field.',
      );
    }
  }

  if (config.database) {
    const dbLower = config.database.toLowerCase().trim();
    if (prohibitedDbNames.has(dbLower) || dbLower.includes('prod') || dbLower.includes('live')) {
      throw new Error(
        `[StagingSafetyGuard] REJECTED UNSAFE STAGING: database "${config.database}" points to production target.`,
      );
    }
  }

  if (config.host) {
    const hostLower = config.host.toLowerCase().trim();
    if (
      hostLower.includes('cashclaw.cc') ||
      hostLower.includes('prod') ||
      hostLower.includes('live') ||
      !allowedDbHosts.has(hostLower)
    ) {
      throw new Error(
        `[StagingSafetyGuard] REJECTED UNSAFE STAGING: host "${config.host}" points to production target or is not in allowed staging hosts.`,
      );
    }
  }

  if (options.requireCloudflareIds && (!config.d1Id || !config.d1Id.trim())) {
    throw new Error(
      '[StagingSafetyGuard] REJECTED UNSAFE STAGING: Missing required "d1Id" field.',
    );
  }

  if (config.d1Id && prohibitedD1Ids.has(config.d1Id.toLowerCase().trim())) {
    throw new Error(
      `[StagingSafetyGuard] REJECTED UNSAFE STAGING: d1Id "${config.d1Id}" matches production Cloudflare D1 database.`,
    );
  }

  if (options.requireCloudflareIds && (!config.kvId || !config.kvId.trim())) {
    throw new Error(
      '[StagingSafetyGuard] REJECTED UNSAFE STAGING: Missing required "kvId" field.',
    );
  }

  if (config.kvId && prohibitedKvIds.has(config.kvId.toLowerCase().trim())) {
    throw new Error(
      `[StagingSafetyGuard] REJECTED UNSAFE STAGING: kvId "${config.kvId}" matches production Cloudflare KV namespace.`,
    );
  }

  if (
    config.liveTradingEnabled === true ||
    config.liveTradingEnabled === 'true' ||
    config.liveTradingEnabled === '1'
  ) {
    throw new Error(
      `[StagingSafetyGuard] REJECTED UNSAFE STAGING: liveTradingEnabled is active on staging.`,
    );
  }

  if (config.polymarketTradingMode === 'live') {
    throw new Error(
      `[StagingSafetyGuard] REJECTED UNSAFE STAGING: polymarketTradingMode is live on staging.`,
    );
  }
}
