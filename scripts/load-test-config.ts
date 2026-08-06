export const LOAD_TEST_BASE_URL = process.env.LOAD_TEST_BASE_URL || 'http://localhost:3000';

export const REGION_HOSTS: Record<string, string> = {
  'us-east': 'us-east.algo-trader.workers.dev',
  'eu-central': 'eu.algo-trader.workers.dev',
  'ap-southeast': 'asia.algo-trader.workers.dev',
  'default': 'algo-trader.workers.dev',
};

export function getRegionalUrl(region: string, endpoint: string): string {
  const host = REGION_HOSTS[region] || REGION_HOSTS['default'];
  return `https://${host}${endpoint}`;
}
