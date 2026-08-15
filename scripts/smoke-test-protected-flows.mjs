#!/usr/bin/env node
/**
 * Smoke Test — Protected Flows
 *
 * Verifies the 3 protected flows respond correctly on a live deployment:
 *   1. Setup Wizard (credentials endpoint)
 *   2. NOWPayments IPN (webhook endpoint)
 *   3. Telegram Bot (webhook endpoint)
 *   4. Health check (baseline — always should work)
 *
 * Exit 0  — all checks pass
 * Exit 1  — one or more checks fail
 *
 * Usage:
 *   node scripts/smoke-test-protected-flows.mjs                       # default: https://api.cashclaw.cc
 *   PRODUCTION_URL=https://staging.example.com node scripts/smoke-test-protected-flows.mjs
 */

const BASE = process.env.PRODUCTION_URL || 'https://api.cashclaw.cc';
const TIMEOUT_MS = 10_000;

const checks = [
  {
    name: 'Health check',
    method: 'GET',
    path: '/health',
    expectStatus: [200],
    note: 'Baseline — should always respond',
  },
  {
    name: 'Setup Wizard (credentials)',
    method: 'GET',
    path: '/api/v1/subscriber/credentials',
    expectStatus: [200, 403, 501],
    note: '200/403 = configured; 501 = endpoint alive (tenant context needed at runtime)',
  },
  {
    name: 'NOWPayments IPN webhook',
    method: 'POST',
    path: '/api/webhooks/nowpayments',
    expectStatus: [400, 401, 403],
    body: '{}',
    note: '401/403 without HMAC = endpoint alive and protecting',
  },
  {
    name: 'Telegram bot webhook',
    method: 'POST',
    path: '/api/telegram/webhook',
    expectStatus: [200, 400, 403, 503],
    body: '{"update_id":0}',
    note: '503 = worker configured but Telegram token may not be set',
  },
];

let passed = 0;
let failed = 0;
const results = [];

async function runCheck(check) {
  const url = `${BASE}${check.path}`;
  const opts = {
    method: check.method,
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  };
  if (check.body) opts.body = check.body;

  try {
    const res = await fetch(url, opts);
    const ok = check.expectStatus.includes(res.status);
    const status = `HTTP ${res.status}`;
    if (ok) {
      passed++;
      results.push(`  ✓ ${check.name}: ${status}`);
    } else {
      failed++;
      results.push(`  ✗ ${check.name}: ${status} — expected ${check.expectStatus.join('|')}`);
    }
  } catch (err) {
    failed++;
    const msg = err.name === 'TimeoutError' ? `timeout (${TIMEOUT_MS}ms)` : err.message;
    results.push(`  ✗ ${check.name}: ${msg}`);
  }
}

console.log(`\n🔒 Smoke Test — Protected Flows\n   Target: ${BASE}\n`);

for (const c of checks) {
  await runCheck(c);
}

console.log(results.join('\n'));
console.log(`\n   ${passed}/${checks.length} passed, ${failed} failed\n`);

if (failed > 0) {
  console.log('❌ SMOKE TEST FAILED — review above failures before deploying to production.\n');
  process.exit(1);
} else {
  console.log('✅ ALL SMOKE TESTS PASSED — protected flows are operational.\n');
  process.exit(0);
}
