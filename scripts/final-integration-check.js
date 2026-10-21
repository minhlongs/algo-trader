#!/usr/bin/env node
/**
 * Final integration check — verifies the deployed API contract.
 *
 * Endpoints are probed against the API host in `API_BASE_URL` (defaults to the
 * live worker). `shardRing` requires auth, so a 401 is reported as
 * auth-required (expected for an unauthenticated probe) rather than silently
 * counted as a failure — but any other non-2xx still fails the check.
 *
 * Regions are env-driven rather than hardcoded: the deployed topology is a
 * single Worker behind one route until multi-region is actually built.
 */

const https = require('https');

const API_HOST = process.env.API_HOST || 'api.cashclaw.cc';
const REGIONS = process.env.REGIONS ? process.env.REGIONS.split(',') : ['default'];

/** Endpoints that must answer without credentials. */
const CHECKS = {
  health: '/api/health',
  metrics: '/metrics',
  regionHealth: '/api/health',
};

/** Endpoints that require auth — 401 is success for an unauthenticated probe. */
const AUTHED_CHECKS = {
  shardRing: '/api/v1/shard/ring',
};

const REGION_WORKER_NAMES = REGIONS.reduce((acc, _region) => {
  acc[_region] = API_HOST;
  return acc;
}, {});

async function checkEndpoint(region, endpoint) {
  return new Promise((resolve) => {
    const host = REGION_WORKER_NAMES[region];
    const url = `https://${host}${endpoint}`;
    const start = Date.now();

    const req = https.get(url, { timeout: 10000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        resolve({
          region,
          endpoint,
          status: res.statusCode,
          latency: Date.now() - start,
          success: res.statusCode >= 200 && res.statusCode < 300,
          body: data,
        });
      });
    });

    req.on('error', (err) => {
      resolve({
        region,
        endpoint,
        status: 0,
        latency: Date.now() - start,
        success: false,
        error: String(err.message),
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        region,
        endpoint,
        status: 0,
        latency: Date.now() - start,
        success: false,
        error: 'timeout',
      });
    });
  });
}

/** 401 means the route exists and enforces auth — acceptable for a no-credential probe. */
const isAuthRequired = (result) => result.status === 401;

async function runChecks() {
  console.log(`\nFinal integration check (${API_HOST})\n`);

  let allPassed = true;
  const results = [];

  for (const region of REGIONS) {
    console.log(`\nRegion: ${region}`);
    console.log('─'.repeat(60));

    for (const [name, endpoint] of Object.entries(CHECKS)) {
      const result = await checkEndpoint(region, endpoint);
      results.push(result);
      report(name, result);
      if (!result.success) allPassed = false;
    }

    for (const [name, endpoint] of Object.entries(AUTHED_CHECKS)) {
      const result = await checkEndpoint(region, endpoint);
      results.push(result);
      // 401 is an auth failure, not a health failure — surface it distinctly.
      report(name, result, isAuthRequired(result));
      if (!result.success && !isAuthRequired(result)) allPassed = false;
    }
  }

  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log(`Total checks: ${results.length}`);
  const passed = results.filter(r => r.success).length;
  const authRequired = results.filter(r => isAuthRequired(r)).length;
  console.log(`Passed: ${passed}/${results.length}${authRequired ? ` (${authRequired} auth-required)` : ''}`);
  console.log('═'.repeat(60));

  if (allPassed) {
    console.log('\nAll integration checks passed.');
  } else {
    console.log('\nSome checks failed — investigate before deploying.');
    console.log(`Host probed: ${API_HOST}`);
  }

  process.exit(allPassed ? 0 : 1);
}

function report(name, result, authOk) {
  const icon = result.success || authOk ? '✓' : '✗';
  const note = authOk ? '(auth required — expected without credentials)' : '';
  console.log(`  ${icon} ${name.padEnd(25)} ${result.status} ${note}`.trim());
}

runChecks().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
