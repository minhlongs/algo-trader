/**
 * Binance Futures Funding Rate Feed
 *
 * Fetches real funding rate history from the Binance Futures public API
 * and stores them in PostgreSQL via the FundingStore. No API key required
 * for the public fundingRate endpoint.
 */

import { logger } from '../../shared/utils/logger';
import { fetchBinanceFundingHistory } from './binance-funding-history';

export type { FundingRateRow, FundingStoreStats } from './funding-types';
export {
  BINANCE_FUNDING_API,
  EXCHANGE,
  MAX_PER_REQUEST,
  DELAY_MS,
  type BinanceFundingRate,
  fundingRateToRow,
} from './binance-funding-types';
export { parseFundingRateResponse } from './binance-funding-parser';
export { fetchBinanceFundingHistory } from './binance-funding-history';

/**
 * CLI entry point.
 *
 * Usage: pnpm tsx src/desk/data/binance-funding-feed.ts <symbol> <days>
 *   e.g. pnpm tsx src/desk/data/binance-funding-feed.ts BTCUSDT 1460
 */
if (require.main === module) {
  const args = process.argv.slice(2);
  const symbol = args[0] ?? 'BTCUSDT';
  const days = parseInt(args[1] ?? '30', 10);

  fetchBinanceFundingHistory(symbol, days, (n) => {
    process.stdout.write(`\r[BinanceFundingFeed] Fetched ${n} rates...`);
  })
    .then((stats) => {
      process.stdout.write('\n');
      logger.info(
        `[BinanceFundingFeed] Done: stored=${stats.stored}, fetched=${stats.fetched}, ` +
          `oldest=${stats.oldest?.toISOString() ?? 'N/A'}, newest=${stats.newest?.toISOString() ?? 'N/A'}`,
      );
      process.exit(0);
    })
    .catch((err) => {
      process.stdout.write('\n');
      logger.error('[BinanceFundingFeed] Fatal', { error: err instanceof Error ? err.message : String(err) });
      process.exit(1);
    });
}
