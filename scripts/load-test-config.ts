/**
 * Load-test target configuration.
 *
 * `LOAD_TEST_BASE_URL` is the single override; everything else derives from it.
 * The earlier per-region `*.algo-trader.workers.dev` hostnames DO NOT RESOLVE,
 * so region names collapse onto the one deployed Worker rather than inventing
 * hosts that would fail at runtime. See scripts/lib/host-contract.sh.
 */

const configuredBaseUrl = process.env.LOAD_TEST_BASE_URL || 'http://localhost:3000';

/** Origin without a trailing slash, e.g. `https://api.cashclaw.cc`. */
export const LOAD_TEST_BASE_URL = configuredBaseUrl.replace(/\/+$/, '');

export const REGION_HOSTS: Record<string, string> = {
  'us-east': LOAD_TEST_BASE_URL,
  'eu-central': LOAD_TEST_BASE_URL,
  'ap-southeast': LOAD_TEST_BASE_URL,
  'default': LOAD_TEST_BASE_URL,
};

export function getRegionalUrl(region: string, endpoint: string): string {
  const base = REGION_HOSTS[region] || REGION_HOSTS['default'];
  return `${base}${endpoint}`;
}

/**
 * Whether the deployment is genuinely multi-region. False until it is built, so
 * scripts that fan out across "regions" can refuse to fabricate a topology
 * instead of silently probing one origin N times.
 */
export const MULTI_REGION_ENABLED = process.env.MULTI_REGION_ENABLED === '1';
