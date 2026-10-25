import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter } from 'k6/metrics';
import { getRegionalUrl, MULTI_REGION_ENABLED } from './load-test-config';

const regionLatency = new Trend('region_latency_ms', true);
const regionErrors = new Counter('region_errors_total');
const regionRouting = new Counter('region_routing_total');

const REGIONS = ['us-east', 'eu-central', 'ap-southeast'] as const;

// Only routes the deployed Worker actually serves. `/api/status` and
// `/api/portfolio` are not routed by edge-proxy, so probing them measures 404s.
const ENDPOINTS = ['/api/health', '/api/version', '/api/markets'];

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
      tags: { region: 'eu-central' },
    },
    asia_probe: {
      executor: 'constant-vus',
      vus: 50,
      duration: '15m',
      exec: 'asiaProbe',
      tags: { region: 'ap-southeast' },
    },
  },
  thresholds: {
    region_latency_ms: [
      { threshold: 'p(95)<100', abortOnFail: true, delayAbortEval: '10s' },
      { threshold: 'p(99)<250', abortOnFail: false },
    ],
  },
};

export default function (): void {
  if (!MULTI_REGION_ENABLED) {
    // One Worker serves all region names today; a "per-region" run would just
    // hammer the same origin three times. Fail loudly instead of reporting a
    // topology that does not exist.
    throw new Error(
      'MULTI_REGION_ENABLED is unset: the deployment is single-region, so this ' +
        'scenario would measure the same origin three times.',
    );
  }
  usEastProbe();
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
