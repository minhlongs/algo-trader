import http from 'k6/http';
import { sleep, check } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { getRegionalUrl } from './load-test-config';

const failoverLatency = new Trend('failover_recovery_ms');
const failoverErrors = new Counter('failover_errors_total');
const regionSwitches = new Counter('region_switch_total');

const PRIMARY_REGION = 'us-east';
const SECONDARY_REGION = 'eu-central';
const ENDPOINT = '/api/health';

export const options = {
  stages: [
    { duration: '5m', target: 100 }, // Baseline
    { duration: '2m', target: 0 },   // Trigger kill (simulated)
    { duration: '5m', target: 100 }, // Recovery
  ],
  thresholds: {
    failover_recovery_ms: ['p(95)<30000'], // 30s recovery target
  },
};

let currentRegion = PRIMARY_REGION;
let failoverTriggered = false;

export default function() {
  // Health check against the deployed origin. The health payload reports
  // status "ok"; asserting on "healthy" never matches.
  const url = getRegionalUrl(currentRegion, ENDPOINT);

  const start = Date.now();
  const res = http.get(url, { timeout: '5000' });
  const latency = Date.now() - start;

  const success = check(res, {
    'health check OK': () => res.status === 200,
    'response reports status ok': () => (res.body ?? '').includes('"status":"ok"'),
  });

  if (!success) {
    failoverErrors.add({ region: currentRegion });

    // Trigger failover (simulated - in reality this is automatic via edge-proxy)
    if (!failoverTriggered) {
      console.log(`[Failover] ${currentRegion} unhealthy, switching to ${SECONDARY_REGION}`);
      currentRegion = SECONDARY_REGION;
      failoverTriggered = true;
      regionSwitches.add({ from: PRIMARY_REGION, to: SECONDARY_REGION });

      // Measure recovery time
      const recoveryStart = Date.now();
      while (true) {
        const healthRes = http.get(getRegionalUrl(SECONDARY_REGION, ENDPOINT));
        if (healthRes.status === 200) {
          failoverLatency.add(Date.now() - recoveryStart);
          break;
        }
        sleep(1);
        if (Date.now() - recoveryStart > 60000) break; // 60s timeout
      }
    }
  }

  sleep(1);
}
