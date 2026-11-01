/**
 * Staging Environment Preflight Safety Guard — Resolved Wrangler Validator
 */

import {
  PRODUCTION_D1_IDS,
  PRODUCTION_KV_ID,
  type StagingEnvironmentConfig,
  type StagingGuardOptions,
} from './staging-guard-types';

export function validateResolvedWranglerTarget(
  config: StagingEnvironmentConfig,
  options: StagingGuardOptions,
): void {
  const rw = config.resolvedWrangler;
  if (!rw) return;
  const manifest = config.manifest;

  if (rw.targetEnv !== 'staging') {
    throw new Error(
      `[StagingSafetyGuard] RESOLVED WRANGLER MISMATCH: targetEnv is "${rw.targetEnv}", expected "staging"`,
    );
  }

  if (manifest) {
    if (manifest.prohibitedWorkerNames.includes(rw.workerName)) {
      throw new Error(
        `[StagingSafetyGuard] RESOLVED WRANGLER VIOLATION: workerName "${rw.workerName}" matches production worker name.`,
      );
    }
    if (rw.workerName !== manifest.workerName) {
      throw new Error(
        `[StagingSafetyGuard] RESOLVED WRANGLER MISMATCH: workerName "${rw.workerName}" does not match manifest "${manifest.workerName}"`,
      );
    }
    if (manifest.prohibitedAccountIds && rw.accountId && manifest.prohibitedAccountIds.includes(rw.accountId)) {
      throw new Error(
        `[StagingSafetyGuard] RESOLVED WRANGLER VIOLATION: accountId "${rw.accountId}" matches prohibited production account.`,
      );
    }
    if (options.requireAccountId) {
      if (!manifest.requiredAccountId) {
        throw new Error(
          `[StagingSafetyGuard] BLOCKED: No staging Cloudflare account_id has been formally provisioned or recorded in manifest (status: ${manifest.accountStatus || 'BLOCKED'}). Staging mutations are halted.`,
        );
      }
      if (!rw.accountId) {
        throw new Error(
          `[StagingSafetyGuard] RESOLVED WRANGLER VIOLATION: missing accountId for deploy target. Required staging account: "${manifest.requiredAccountId}".`,
        );
      }
      if (rw.accountId !== manifest.requiredAccountId) {
        throw new Error(
          `[StagingSafetyGuard] RESOLVED WRANGLER MISMATCH: accountId "${rw.accountId}" does not match manifest requiredAccountId "${manifest.requiredAccountId}".`,
        );
      }
    }
    if (rw.routes.length > 0) {
      for (const r of rw.routes) {
        if (r.includes('cashclaw.cc') || r.includes('api.cashclaw.cc') || !manifest.allowedRoutes.includes(r)) {
          throw new Error(
            `[StagingSafetyGuard] RESOLVED WRANGLER VIOLATION: staging target cannot define production route "${r}".`,
          );
        }
      }
    }
    if (config.targetHostname) {
      const hostOnly = config.targetHostname.replace(/^https?:\/\//, '').split('/')[0];
      if (!manifest.allowedHostnames.includes(hostOnly)) {
        throw new Error(
          `[StagingSafetyGuard] RESOLVED WRANGLER VIOLATION: targetHostname "${hostOnly}" is not in allowed hostnames list: ${manifest.allowedHostnames.join(', ')}`,
        );
      }
    }
  }

  const prohibitedD1Set = new Set([
    ...PRODUCTION_D1_IDS.map((id) => id.toLowerCase()),
    ...(manifest?.prohibitedD1Ids?.map((id) => id.toLowerCase()) ?? []),
  ]);
  if (rw.d1Databases && rw.d1Databases.length > 0) {
    for (const d1 of rw.d1Databases) {
      if (prohibitedD1Set.has(d1.database_id.toLowerCase().trim())) {
        throw new Error(
          `[StagingSafetyGuard] RESOLVED WRANGLER VIOLATION: d1 binding "${d1.binding}" uses production database_id "${d1.database_id}"`,
        );
      }
      if (config.d1Id && d1.database_id.toLowerCase().trim() !== config.d1Id.toLowerCase().trim()) {
        throw new Error(
          `[StagingSafetyGuard] RESOLVED WRANGLER MISMATCH: env d1Id "${config.d1Id}" does not match resolved wrangler D1 database_id "${d1.database_id}"`,
        );
      }
    }
  }

  const prohibitedKvSet = new Set([
    PRODUCTION_KV_ID.toLowerCase(),
    ...(manifest?.prohibitedKvIds?.map((id) => id.toLowerCase()) ?? []),
  ]);
  if (rw.kvNamespaces && rw.kvNamespaces.length > 0) {
    for (const kv of rw.kvNamespaces) {
      if (prohibitedKvSet.has(kv.id.toLowerCase().trim())) {
        throw new Error(
          `[StagingSafetyGuard] RESOLVED WRANGLER VIOLATION: kv binding "${kv.binding}" uses production id "${kv.id}"`,
        );
      }
      if (config.kvId && kv.id.toLowerCase().trim() !== config.kvId.toLowerCase().trim()) {
        throw new Error(
          `[StagingSafetyGuard] RESOLVED WRANGLER MISMATCH: env kvId "${config.kvId}" does not match resolved wrangler KV id "${kv.id}"`,
        );
      }
    }
  }
}
