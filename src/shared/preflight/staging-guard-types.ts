/**
 * Staging Environment Preflight Safety Guard — Types & Constants
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
