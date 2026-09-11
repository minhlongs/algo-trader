/**
 * CashClaw CLI Scan Commands
 */

import { Command } from 'commander';
import { logger } from '../../shared/utils/logger';
import { runNegRiskScan } from '../commands/neg-risk-scan';

export function registerScanCommands(program: Command): void {
  program
    .command('scan')
    .description('One-time market scan — show opportunities without trading')
    .action(async () => {
      logger.info('Scanning Polymarket...\n');

      try {
        const resp = await fetch(
          'https://gamma-api.polymarket.com/markets?closed=false&limit=200',
          { signal: AbortSignal.timeout(15_000) }
        );

        if (!resp.ok) {
          logger.error(`Gamma API error: HTTP ${resp.status}`);
          process.exit(1);
        }

        const markets = (await resp.json()) as Array<Record<string, unknown>>;
        let endgameCount = 0;

        for (const m of markets) {
          try {
            const prices = JSON.parse((m['outcomePrices'] as string) ?? '[]') as string[];
            const yes = parseFloat(prices[0] ?? '0');
            const vol = Number(m['volume'] ?? 0);

            if ((yes > 0.95 || yes < 0.05) && vol > 10_000) {
              endgameCount++;
              const edge = yes > 0.95
                ? ((1 - yes - 0.02) * 100).toFixed(1)
                : ((yes - 0.02) * 100).toFixed(1);
              const side = yes > 0.95 ? 'YES' : 'NO';
              const question = String(m['question'] ?? '').substring(0, 60);

              if (endgameCount <= 10) {
                logger.info(`  [${side}] @${yes.toFixed(3)} edge: ${edge}%  ${question}`);
              }
            }
          } catch {
            /* skip malformed entry */
          }
        }

        logger.info(`\nFound ${endgameCount} endgame opportunities in ${markets.length} markets`);
      } catch (err) {
        logger.error('Scan failed:', (err as Error).message);
        process.exit(1);
      }
    });

  program
    .command('neg-risk-scan')
    .description('Scan for negative risk arbitrage opportunities (YES+NO sum < threshold)')
    .option('--threshold <t>', 'Sum threshold (e.g., 0.98)', '0.98')
    .option('--minVolume <v>', 'Minimum market volume (USDC)', '1000')
    .option('--maxSize <s>', 'Max opportunity size per leg (USDC)', '10')
    .action(async (opts) => {
      await runNegRiskScan({
        threshold: parseFloat(opts.threshold),
        minVolumeUsdc: parseFloat(opts.minVolume),
        maxOpportunitySizeUsdc: parseFloat(opts.maxSize),
      });
    });

  program
    .command('ledger <wallet>')
    .description('Show REAL Polymarket trades for any wallet (public data)')
    .option('--limit <n>', 'Number of trades', '50')
    .action(async (wallet: string, _opts: { limit: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { showRealLedger } = require('../polymarket');
      await showRealLedger(wallet);
    });
}
