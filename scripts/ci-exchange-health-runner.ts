/**
 * CI Exchange Health Runner — invoked by scripts/ci-exchange-health.sh.
 * Calls runDefaultExchangeTest() and exits with appropriate code.
 * Accepts optional --timeout <ms> argument (default 5000).
 */
import { runDefaultExchangeTest } from '../src/desk/tests/exchange-connection-test';

const args = process.argv.slice(2);
let timeoutMs = 5_000;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--timeout' && i + 1 < args.length) {
    timeoutMs = Number(args[i + 1]);
    i++;
  }
}

async function main(): Promise<void> {
  const report = await runDefaultExchangeTest(timeoutMs);
  process.stdout.write(report + '\n');
  const hasFailure = report.includes('[FAIL]');
  process.exit(hasFailure ? 1 : 0);
}

main().catch(() => { process.exit(1); });
