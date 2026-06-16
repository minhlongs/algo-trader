import http from 'k6/http';
import { sleep, check } from 'k6';
import { Counter, Trend } from 'k6/metrics';

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
  // Simulate health check
  const url = `https://${currentRegion}.algo-trader.workers.dev${ENDPOINT}`;

  const start = Date.now();
  const res = http.get(url, { timeout: '5000' });
  const latency = Date.now() - start;

  const success = check(res, {
    'health check OK': () => res.status === 200,
    'response contains healthy': () => res.body?.includes('healthy'),
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
        const healthRes = http.get(`https://${SECONDARY_REGION}.algo-trader.workers.dev${ENDPOINT}`);
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
