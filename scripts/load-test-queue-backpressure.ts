import http from 'k6/http';
import { sleep, check } from 'k6';
import { Counter, Gauge, Rate } from 'k6/metrics';

const queueDepth = new Gauge('agent_queue_depth');
const queueRejections = new Counter('queue_rejection_total');
const queueWaitTime = new Trend('queue_wait_ms');

const AGENTS = 19;
const PRIORITIES = ['critical', 'normal', 'background'];

export const options = {
  scenarios: {
    burst_load: {
      executor: 'constant-vus',
      vus: 200,
      duration: '10m',
      exec: 'burstRequests',
    },
  },
  thresholds: {
    queue_rejection_total: ['rate<0.05'], // <5% rejection
    queue_wait_ms: ['p(95)<1000'], // <1s wait
  },
};

function randomAgent(): string {
  return `agent-${Math.floor(Math.random() * AGENTS)}`;
}

function randomPriority(): string {
  return PRIORITIES[Math.floor(Math.random() * PRIORITIES.length)];
}

export function burstRequests(): void {
  const agent = randomAgent();
  const priority = randomPriority();

  const url = `https://algo-trader.workers.dev/api/v1/agents/${agent}/execute`;
  const body = JSON.stringify({
    priority,
    input: { text: 'Test input for queue backpressure' },
  });

  const start = Date.now();
  const res = http.post(url, body, {
    headers: { 'Content-Type': 'application/json' },
    timeout: '30000',
  });

  const waitTime = Date.now() - start;
  queueWaitTime.add({ priority }, waitTime);

  // Check if queued or rejected
  const isQueued = res.body?.includes('"status":"queued"');
  const isRejected = res.body?.includes('"status":"rejected"');

  if (isRejected) {
    queueRejections.add({ priority });
  }

  // Report current queue depth (if stats endpoint exists)
  const depthRes = http.get('https://algo-trader.workers.dev/api/v1/queue/stats');
  if (depthRes.status === 200) {
    try {
      const stats = JSON.parse(depthRes.body);
      if (stats.depth) {
        for (const [p, depth] of Object.entries(stats.depth)) {
          queueDepth.add({ priority: p }, depth);
        }
      }
    } catch {
      // ignore parse errors
    }
  }

  check(res, {
    'response OK': () => res.status === 200 || res.status === 202,
    'not rejected': () => !isRejected,
  });

  sleep(Math.random() * 2);
}
