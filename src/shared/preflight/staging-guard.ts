/**
 * Staging Environment Preflight Safety Guard
 *
 * Enforces fail-closed isolation across staging runs, migrations, and deployments.
 * Prevents accidental connection to production PostgreSQL, production Cloudflare D1,
 * production Cloudflare KV, or live market execution.
 */

export interface ResolvedWranglerConfig {
  targetEnv: string;
  workerName: string;
  accountId?: string | null;
  routes: string[];
  d1Databases?: Array<{ binding: string; database_id: string; database_name?: string }>;
  kvNamespaces?: Array<{ binding: string; id: string }>;
  vars?: Record<string, string>;
}

export interface StagingManifest {
  targetEnv: string;
  workerName: string;
  requiredAccountId?: string | null;
  accountStatus?: string;
  allowedRoutes: string[];
  allowedHostnames: string[];
  prohibitedWorkerNames: string[];
  prohibitedDatabaseNames: string[];
  prohibitedD1Ids: string[];
  prohibitedKvIds: string[];
  prohibitedAccountIds?: string[];
  allowedDatabaseHosts: string[];
}

export interface StagingEnvironmentConfig {
  database?: string;
  host?: string;
  d1Id?: string;
  kvId?: string;
  accountId?: string;
  liveTradingEnabled?: string | boolean;
  polymarketTradingMode?: string;
  targetEnv?: string;
  workerName?: string;
  routes?: string[];
  resolvedWrangler?: ResolvedWranglerConfig;
  manifest?: StagingManifest;
  targetHostname?: string;
}

export interface StagingGuardOptions {
  /** If true, requires database and host to be non-empty and present */
  requireDbFields?: boolean;
  /** If true, requires d1Id and kvId to be explicitly declared */
  requireCloudflareIds?: boolean;
  /** If true, requires accountId to be explicitly declared and verified */
  requireAccountId?: boolean;
  /** If true, enforces strict wrangler environment target matching */
  enforceTargetMatching?: boolean;
  /** If true, validates resolved wrangler config against manifest and env */
  validateResolvedWrangler?: boolean;
}

export const PRODUCTION_D1_ID = 'f29559f2-8e0b-461a-bd01-5665581beeee';
export const PRODUCTION_D1_IDS = [
  PRODUCTION_D1_ID,
  '472e48f7-2196-4fb5-9a26-180ad134e15b',
];
export const PRODUCTION_KV_ID = '6c7199c0259b42db943aa13b200d8ea1';
export const PRODUCTION_WORKER_NAMES = [
  'algo-trader',
  'algo-trader-prod',
  'algo-trader-production',
];
export const PRODUCTION_DB_NAMES = [
  'algo_trader',
  'algo_trader_prod',
  'algo_trader_production',
  'production',
  'prod',
];

export const ALLOWED_STAGING_HOSTS = [
  'localhost',
  '127.0.0.1',
  '::1',
  'postgres',
  'staging-db',
  'staging-postgres.internal',
  'postgres.staging',
];

/**
 * Validates that the staging environment configuration is strictly isolated
 * from production resources and does not allow live market mutations.
 *
 * @throws Error if configuration references production targets or lacks mandatory fields.
 */
export function assertStagingEnvironmentSafe(
  config: StagingEnvironmentConfig,
  options: StagingGuardOptions = {},
): void {
  // 0. Target environment & worker name matching
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

  // 0.1 Validate resolved wrangler configuration against manifest and env
  if (options.validateResolvedWrangler && config.resolvedWrangler) {
    const rw = config.resolvedWrangler;
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
      // Account verification against manifest
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
      // Routes check
      if (rw.routes.length > 0) {
        for (const r of rw.routes) {
          if (r.includes('cashclaw.cc') || r.includes('api.cashclaw.cc') || !manifest.allowedRoutes.includes(r)) {
            throw new Error(
              `[StagingSafetyGuard] RESOLVED WRANGLER VIOLATION: staging target cannot define production route "${r}".`,
            );
          }
        }
      }
      // Hostname check
      if (config.targetHostname) {
        const hostOnly = config.targetHostname.replace(/^https?:\/\//, '').split('/')[0];
        if (!manifest.allowedHostnames.includes(hostOnly)) {
          throw new Error(
            `[StagingSafetyGuard] RESOLVED WRANGLER VIOLATION: targetHostname "${hostOnly}" is not in allowed hostnames list: ${manifest.allowedHostnames.join(', ')}`,
          );
        }
      }
    }

    // Verify D1 and KV bindings in resolved wrangler if present
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

  // 1. Mandatory field checks for DB
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

  // 2. Database name checks
  if (config.database) {
    const dbLower = config.database.toLowerCase().trim();
    if (prohibitedDbNames.has(dbLower) || dbLower.includes('prod') || dbLower.includes('live')) {
      throw new Error(
        `[StagingSafetyGuard] REJECTED UNSAFE STAGING: database "${config.database}" points to production target.`,
      );
    }
  }

  // 3. Host checks
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

  // 4. Cloudflare D1 checks
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

  // 5. Cloudflare KV checks
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

  // 6. Live trading safety
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
