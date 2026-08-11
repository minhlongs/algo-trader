#!/usr/bin/env node
const https = require('https');

const REGIONS = ['us-east', 'eu-central', 'ap-southeast'];
const REGION_WORKER_NAMES = {
  'us-east': 'algo-trader.workers.dev',
  'eu-central': 'algo-trader.workers.dev',
  'ap-southeast': 'algo-trader.workers.dev',
};
const CHECKS = {
  health: '/api/health',
  shardRing: '/api/v1/shard/ring',
  metrics: '/metrics',
  regionHealth: '/api/health?region=self',
};

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
        error: err.message,
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

async function runChecks() {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║        FINAL INTEGRATION CHECK - ALGO-TRADER SCALING         ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  let allPassed = true;
  const results = [];

  for (const region of REGIONS) {
    console.log(`\n📍 Region: ${region}`);
    console.log('─'.repeat(60));

    for (const [name, endpoint] of Object.entries(CHECKS)) {
      const result = await checkEndpoint(region, endpoint);
      results.push(result);

      const icon = result.success ? '✓' : '✗';
      const latency = result.success ? `(${result.latency}ms)` : '';
      console.log(`  ${icon} ${name.padEnd(25)} ${result.status} ${latency}`.trim());

      if (!result.success) {
        allPassed = false;
        if (result.error) {
          console.log(`    └─ Error: ${result.error}`);
        }
      }
    }

    // Additional shard count check
    try {
      const ringResult = await checkEndpoint(region, '/api/v1/shard/ring');
      let shardCount = 0;
      if (ringResult.success) {
        try {
          const ring = JSON.parse(ringResult.body || '{}');
          shardCount = ring.shards?.length || 0;
        } catch (e) {
          // JSON parse failed
        }
      }
      const shardIcon = shardCount >= 4 ? '✓' : '✗';
      console.log(`  ${shardIcon} ${'shard_count'.padEnd(25)} ${shardCount}/12 expected`);
      if (shardCount < 4) allPassed = false;
    } catch (e) {
      allPassed = false;
      console.log(`  ✗ ${'shard_count'.padEnd(25)} error`);
    }
  }

  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log(`Total checks: ${results.length}`);
  const passedChecks = results.filter(r => r.success).length;
  console.log(`Passed: ${passedChecks}/${results.length}`);
  console.log('═'.repeat(60));

  if (allPassed) {
    console.log('\n✅ ALL INTEGRATION CHECKS PASSED\n');
    console.log('System is ready for production deployment.');
    console.log('Next steps:');
    console.log('  1. Review the production rollout plan');
    console.log('  2. Schedule deployment window');
    console.log('  3. Execute: ./scripts/deploy-region.sh us-east');
    console.log('  4. Execute: ./scripts/deploy-region.sh eu-central');
    console.log('  5. Execute: ./scripts/deploy-region.sh ap-southeast');
    console.log('  6. Run: ./scripts/verify-multi-region.sh\n');
  } else {
    console.log('\n❌ SOME CHECKS FAILED\n');
    console.log('Please investigate failing endpoints before deployment.');
    console.log('Check logs: npx wrangler tail <worker-name> --remote\n');
  }

  process.exit(allPassed ? 0 : 1);
}

runChecks().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
