const fs = require('fs');
const path = require('path');

function generateSummary(reportsDir) {
  console.log('\n=== LOAD TEST SUMMARY REPORT ===\n');

  const reportFiles = fs.readdirSync(reportsDir).filter(f => f.endsWith('.json'));

  if (reportFiles.length === 0) {
    console.log('No report files found.');
    return { pass: false };
  }

  let overallPass = true;

  for (const file of reportFiles) {
    const filePath = path.join(reportsDir, file);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const metrics = data.metrics;

    console.log(`\n📊 ${file}`);
    console.log('─'.repeat(50));

    for (const [name, metric] of Object.entries(metrics)) {
      if (metric.rate !== undefined) {
        // Trend metrics (latency, etc.)
        console.log(`  ${name}:`);
        if (metric.p50 !== undefined) console.log(`    p50: ${metric.p50.toFixed(1)}ms`);
        if (metric.p95 !== undefined) console.log(`    p95: ${metric.p95.toFixed(1)}ms`);
        if (metric.p99 !== undefined) console.log(`    p99: ${metric.p99.toFixed(1)}ms`);
        if (metric.min !== undefined) console.log(`    min: ${metric.min.toFixed(1)}ms`);
        if (metric.max !== undefined) console.log(`    max: ${metric.max.toFixed(1)}ms`);
      } else if (typeof metric === 'number') {
        console.log(`  ${name}: ${metric}`);
      }
    }

    // Pass/fail assessment based on thresholds
    const pass = assessPass(data, file);
    overallPass = overallPass && pass;
    console.log(`\n  Result: ${pass ? '✅ PASS' : '❌ FAIL'}`);
  }

  console.log('\n=== OVERALL RESULT ===');
  console.log(overallPass ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED');
  return { pass: overallPass };
}

function assessPass(data, filename) {
  const { metrics } = data;

  // Different thresholds per test type
  if (filename.includes('shard')) {
    return (
      (metrics.shard_latency_ms?.p95 || 0) < 100 &&
      (metrics.shard_errors_total?.rate || 0) < 0.01 &&
      (metrics.memory_usage_mb?.max || 0) < 128
    );
  }
  if (filename.includes('region') || filename.includes('multi')) {
    return (metrics.region_latency_ms?.p95 || 0) < 100;
  }
  if (filename.includes('memory')) {
    return (metrics.memory_usage_mb?.max || 0) < 128;
  }
  if (filename.includes('failover')) {
    return (metrics.failover_recovery_ms?.p95 || 0) < 30000;
  }
  if (filename.includes('queue')) {
    return (metrics.queue_rejection_total?.rate || 0) < 0.05;
  }
  // Default: pass if no errors
  return (metrics.shard_errors_total?.rate || 0) < 0.01;
}

const reportsDir = process.argv[2] || './reports';
const result = generateSummary(reportsDir);
process.exit(result.pass ? 0 : 1);
