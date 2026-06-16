const fs = require('fs');
const path = require('path');

function assessPass(data, filename) {
  const { metrics } = data;
  if (filename.includes('shard')) {
    return (metrics.shard_latency_ms?.p95 || 0) < 100 &&
           (metrics.shard_errors_total?.rate || 0) < 0.01 &&
           (metrics.memory_usage_mb?.max || 0) < 128;
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
  return (metrics.shard_errors_total?.rate || 0) < 0.01;
}

function validateResults(reportsDir) {
  const reportFiles = fs.readdirSync(reportsDir).filter(f => f.endsWith('.json'));
  if (reportFiles.length === 0) {
    console.error('No report files found in', reportsDir);
    process.exit(1);
  }

  let allPass = true;
  for (const file of reportFiles) {
    const data = JSON.parse(fs.readFileSync(path.join(reportsDir, file), 'utf8'));
    const pass = assessPass(data, file);
    console.log(`${file}: ${pass ? 'PASS' : 'FAIL'}`);
    if (!pass) allPass = false;
  }

  if (allPass) {
    console.log('\n✅ All load tests passed');
  } else {
    console.error('\n❌ Some load tests failed');
  }
  process.exit(allPass ? 0 : 1);
}

validateResults(process.argv[2] || './reports');
