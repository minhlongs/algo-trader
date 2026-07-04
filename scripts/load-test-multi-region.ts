import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter } from 'k6/metrics';

const regionLatency = new Trend('region_latency_ms', true);
const regionErrors = new Counter('region_errors_total');
const regionRouting = new Counter('region_routing_total');

const REGIONS = ['us-east', 'eu-central', 'ap-southeast'] as const;
const ENDPOINTS = ['/api/health', '/api/status', '/api/portfolio'];

export const options = {
  scenarios: {
    us_east_probe: {
      executor: 'constant-vus',
      vus: 50,
      duration: '15m',
      exec: 'usEastProbe',
      tags: { region: 'us-east' },
    },
    eu_probe: {
      executor: 'constant-vus',
      vus: 50,
      duration: '15m',
      exec: 'euProbe',
      tags: { region: 'eu' },
    },
    asia_probe: {
      executor: 'constant-vus',
      vus: 50,
      duration: '15m',
      exec: 'asiaProbe',
      tags: { region: 'asia' },
    },
  },
  thresholds: {
    region_latency_ms: [
      { threshold: 'p(95)<100', abortOnFail: true, delayAbortEval: '10s' },
      { threshold: 'p(99)<250', abortOnFail: false },
    ],
  },
};

function getRegionalUrl(region: string, endpoint: string): string {
  const regionHosts: Record<string, string> = {
    'us-east': 'us-east.algo-trader.workers.dev',
    'eu-central': 'eu.algo-trader.workers.dev',
    'ap-southeast': 'asia.algo-trader.workers.dev',
  };
  return `https://${regionHosts[region]}${endpoint}`;
}

export function usEastProbe() {
  runRegionProbe('us-east');
}

export function euProbe() {
  runRegionProbe('eu-central');
}

export function asiaProbe() {
  runRegionProbe('ap-southeast');
}

function runRegionProbe(region: string): void {
  for (const endpoint of ENDPOINTS) {
    const url = getRegionalUrl(region, endpoint);
    const start = Date.now();

    const res = http.get(url, {
      headers: { 'X-Region-Test': 'true' },
      timeout: '10000',
    });

    const latency = Date.now() - start;
    regionLatency.add({ region }, latency);
    regionRouting.add({ region, endpoint });

    const success = check(res, {
      [`${region} ${endpoint} OK`]: () => res.status === 200,
      [`${region} latency < 200ms`]: () => latency < 200,
    });

    if (!success) {
      regionErrors.add({ region, endpoint });
    }
  }

  sleep(1); // 1 request per second per VU
}
