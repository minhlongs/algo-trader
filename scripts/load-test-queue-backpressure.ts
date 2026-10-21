import http from 'k6/http';
import { sleep, check } from 'k6';
import { Counter, Gauge, Rate, Trend } from 'k6/metrics';
import { LOAD_TEST_BASE_URL } from './load-test-config';

// The Worker has no `/api/v1/agents/*` or `/api/v1/queue/*` route, so this
// script measures a real public route and reports backpressure as a derived
// signal (latency under burst) rather than queue depth it cannot observe.
const AGENT_TARGET = '/api/v1/strategies/execute';

const queueDepth = new Gauge('agent_queue_depth');
const queueRejections = new Counter('queue_rejection_total');
const queueWaitTime = new Trend('queue_wait_ms');
const unavailableRoutes = new Counter('unavailable_route_total');

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

  const url = `${LOAD_TEST_BASE_URL}${AGENT_TARGET}`;
  const body = JSON.stringify({
    agent,
    priority,
    strategy: 'burst-probe',
  });

  const start = Date.now();
  const res = http.post(url, body, {
    headers: { 'Content-Type': 'application/json' },
    timeout: '30000',
  });

  const waitTime = Date.now() - start;
  queueWaitTime.add({ priority }, waitTime);

  // Unreachable because the route does not exist: report it rather than
  // letting a 404/405 masquerade as measured backpressure.
  if (res.status === 404 || res.status === 405) {
    unavailableRoutes.add(1);
  }

  const isRejected = res.body?.includes('"status":"rejected"');

  if (isRejected) {
    queueRejections.add({ priority });
  }

  check(res, {
    'response OK': () => res.status === 200 || res.status === 202,
    'not rejected': () => !isRejected,
  });

  sleep(Math.random() * 2);
}
