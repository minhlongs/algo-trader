/**
 * CashClaw Trade Journal Handler — CLI handler for trading journal inspection.
 */
import { logger } from '../../shared/utils/logger';

export function handleTradeJournal(opts: { type: string; limit: string }): void {
  const limit = parseInt(opts.limit, 10);
  const filter = opts.type;

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { LiveTradingJournal } = require('../execution/live-trading-journal');
  const journal = new LiveTradingJournal();

  if (filter === 'all' || filter === 'fills') {
    const fills = journal.loadFills();
    const recent = fills.slice(-limit);
    logger.info(`\n📊 Fills (${fills.length} total, showing last ${recent.length}):`);
    logger.info('─'.repeat(70));
    if (recent.length === 0) logger.info('  No fills recorded yet.');
    for (const f of recent) {
      const dt = f.filledAt ? new Date(f.filledAt).toISOString() : 'unknown';
      logger.info(`  ${dt} | ${f.side.padEnd(5)} | ${f.tokenId.slice(0, 12)} | size=${f.size} | price=$${f.price.toFixed(4)} | ${f.orderId}`);
    }
  }

  if (filter === 'all' || filter === 'events') {
    const events = journal.loadEvents();
    const recent = events.slice(-limit);
    logger.info(`\n📋 Events (${events.length} total, showing last ${recent.length}):`);
    logger.info('─'.repeat(70));
    if (recent.length === 0) logger.info('  No events recorded yet.');
    for (const e of recent) {
      const dt = new Date(e.timestamp).toISOString();
      const data = JSON.stringify(e.data).slice(0, 60);
      logger.info(`  ${dt} | ${e.type.padEnd(15)} | ${data}`);
    }
  }

  if (filter === 'all' || filter === 'pnl') {
    const pnl = journal.loadDailyPnl();
    logger.info('\n💰 Daily P&L:');
    logger.info('─'.repeat(40));
    if (pnl) {
      logger.info(`  Date:       ${pnl.date}`);
      logger.info(`  Realized:   $${pnl.realizedPnl.toFixed(2)}`);
      logger.info(`  Trades:     ${pnl.tradeCount}`);
      logger.info(`  Win/Loss:   ${pnl.winCount}W / ${pnl.lossCount}L`);
      if (pnl.tradeCount > 0) {
        const wr = ((pnl.winCount / pnl.tradeCount) * 100).toFixed(1);
        logger.info(`  Win rate:   ${wr}%`);
      }
    } else {
      logger.info('  No P&L recorded today.');
    }
  }

  if (filter === 'all') {
    const stats = journal.getLifetimeStats();
    logger.info(`\n📈 Lifetime: ${stats.totalTrades} trades | ${stats.totalFills} fills`);
  }

  logger.info('');
}
