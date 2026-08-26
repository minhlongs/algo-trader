import { getFundingRates } from '../src/desk/data/funding-store';
import { getDbClient } from '../src/db/postgres-client';

async function main() {
  const rates = await getFundingRates('BTCUSDT', new Date('2022-01-01'), new Date(), 'binance-futures');
  console.log(`Loaded ${rates.length} funding rates`);

  // Transform: close_bps = 10_000 + funding_rate × 10_000
  const FUNDING_BPS_OFFSET = 10_000;
  const bpsSeries = rates.map(r => FUNDING_BPS_OFFSET + r.fundingRate * 10_000);

  // Compute bar-to-bar changes (8h intervals)
  const changes = [];
  for (let i = 1; i < bpsSeries.length; i++) {
    changes.push(bpsSeries[i] - bpsSeries[i - 1]);
  }

  const absChanges = changes.map(c => Math.abs(c)).sort((a, b) => a - b);

  function percentile(arr: number[], p: number): number {
    const idx = Math.floor(p / 100 * (arr.length - 1));
    return arr[idx];
  }

  console.log('\n--- Transformed Series (close_bps = 10_000 + rate * 10_000) ---');
  console.log(`Total bars: ${bpsSeries.length}`);
  console.log(`First close_bps: ${bpsSeries[0].toFixed(4)}`);
  console.log(`Last close_bps: ${bpsSeries[bpsSeries.length - 1].toFixed(4)}`);
  console.log(`Min close_bps: ${Math.min(...bpsSeries).toFixed(4)}`);
  console.log(`Max close_bps: ${Math.max(...bpsSeries).toFixed(4)}`);
  console.log(`Mean close_bps: ${(bpsSeries.reduce((a, b) => a + b, 0) / bpsSeries.length).toFixed(4)}`);

  console.log('\n--- 8h Bar-to-Bar |Δbps| Percentiles ---');
  console.log(`Count: ${absChanges.length}`);
  console.log(`p5:  ${percentile(absChanges, 5).toFixed(4)} bps`);
  console.log(`p25: ${percentile(absChanges, 25).toFixed(4)} bps`);
  console.log(`p50: ${percentile(absChanges, 50).toFixed(4)} bps`);
  console.log(`p75: ${percentile(absChanges, 75).toFixed(4)} bps`);
  console.log(`p95: ${percentile(absChanges, 95).toFixed(4)} bps`);
  console.log(`p99: ${percentile(absChanges, 99).toFixed(4)} bps`);
  console.log(`Max: ${absChanges[absChanges.length - 1].toFixed(4)} bps`);

  console.log('\n--- Autocorrelation of Δbps at lags 1..6 ---');
  const meanDelta = changes.reduce((a, b) => a + b, 0) / changes.length;
  const varDelta = changes.reduce((a, b) => a + (b - meanDelta) ** 2, 0) / changes.length;

  for (let lag = 1; lag <= 6; lag++) {
    let cov = 0;
    let count = 0;
    for (let i = lag; i < changes.length; i++) {
      cov += (changes[i] - meanDelta) * (changes[i - lag] - meanDelta);
      count++;
    }
    const acf = cov / count / varDelta;
    console.log(`lag ${lag}: ${acf.toFixed(6)}`);
  }

  console.log('\n--- Raw funding rate stats ---');
  const rawRates = rates.map(r => r.fundingRate);
  console.log(`Min rate: ${Math.min(...rawRates).toFixed(8)}`);
  console.log(`Max rate: ${Math.max(...rawRates).toFixed(8)}`);
  console.log(`Mean rate: ${(rawRates.reduce((a, b) => a + b, 0) / rawRates.length).toFixed(8)}`);

  // Find negative rates
  const negativeRates = rawRates.filter(r => r < 0);
  console.log(`Negative rate count: ${negativeRates.length}`);
  if (negativeRates.length > 0) {
    console.log(`Most negative: ${Math.min(...negativeRates).toFixed(8)}`);
  }

  await getDbClient().end();
}

main();