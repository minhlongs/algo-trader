/**
 * Paper Trading Commands
 *
 * CLI commands: paper start, paper stop, paper status, paper report
 *
 * Phase 25 — Paper Trading CLI
 */

import { logger } from '../shared/utils/logger';
import { getPaperExecutor, PaperExecutor } from '../execution/paper-executor';
import { getPaperPnlTracker } from '../strategies/paper-trading/paper-pnl-tracker';
import { getCrossPlatformArbDetector } from '../strategies/cross-platform-arb';

export interface PaperCommandOptions {
  symbol?: string;
  side?: 'buy' | 'sell';
  quantity?: number;
  dryRun?: boolean;
  verbose?: boolean;
}

let executor: PaperExecutor | null = null;
let tracker: ReturnType<typeof getPaperPnlTracker> | null = null;
let arbDetector: ReturnType<typeof getCrossPlatformArbDetector> | null = null;

function getExecutor(): PaperExecutor {
  if (!executor) {
    executor = getPaperExecutor();
  }
  return executor;
}

function getTracker() {
  if (!tracker) {
    tracker = getPaperPnlTracker(getExecutor());
  }
  return tracker;
}

/** paper start — initialize paper trading session */
export async function paperStart(options: PaperCommandOptions = {}): Promise<void> {
  logger.info('\n📝 Paper Trading — Starting Session\n');
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  executor = getPaperExecutor();
  const account = await executor.start();

  tracker = getPaperPnlTracker(executor);

  if (options.verbose !== false) {
    logger.info('  Paper trading session started');
    logger.info(`  Balance: $${account.balance.toFixed(2)}`);
    logger.info(`  Equity:  $${account.equity.toFixed(2)}`);
    logger.info('\n  Available commands:');
    logger.info('    paper status   — current positions & account');
    logger.info('    paper report   — P&L summary with metrics');
    logger.info('    paper stop     — end session\n');
  }
}

/** paper stop — end paper trading session */
export async function paperStop(_options: PaperCommandOptions = {}): Promise<void> {
  logger.info('\n📝 Paper Trading — Stopping Session\n');

  if (executor) {
    await executor.stop();
    const summary = getTracker().getSummary();
    const at = summary.allTime;
    logger.info('  Session ended');
    logger.info(`  Final equity: $${at.equity.toFixed(2)}`);
    logger.info(`  Total P&L:    $${at.pnl.toFixed(2)} (${at.winRate.toFixed(1)}% win rate)`);
    logger.info(`  Trades:       ${at.tradeCount}`);
    executor = null;
    tracker = null;
  } else {
    logger.warn('  No active paper trading session');
  }
}

/** paper status — show current positions and account */
export async function paperStatus(_options: PaperCommandOptions = {}): Promise<void> {
  logger.info('\n📝 Paper Trading — Status\n');
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const exec = getExecutor();
  const summary = exec.getPnlSummary();

  logger.info(`  Balance:    $${summary.balance.toFixed(2)}`);
  logger.info(`  Equity:     $${summary.equity.toFixed(2)}`);
  logger.info(`  Total P&L:  $${summary.totalPnl.toFixed(2)}`);
  logger.info(`  Win Rate:   ${summary.winRate.toFixed(1)}%`);
  logger.info(`  Trades:     ${summary.totalTrades} (${summary.winningTrades}W / ${summary.losingTrades}L)`);
  logger.info(`  Sharpe:     ${summary.sharpeRatio.toFixed(2)}`);
  logger.info(`  Max DD:     ${(summary.maxDrawdown * 100).toFixed(2)}%`);

  const positions = exec.getPositions();
  logger.info(`\n  Open Positions (${positions.length}):`);
  if (positions.length === 0) {
    logger.info('    (none)');
  } else {
    for (const pos of positions) {
      logger.info(
        `    ${pos.symbol} ${pos.side} ${pos.quantity.toFixed(4)} @ $${pos.entryPrice.toFixed(2)} | P&L: $${pos.unrealizedPnl.toFixed(2)}`,
      );
    }
  }

  const recentTrades = exec.getTradeHistory(5);
  logger.info(`\n  Recent Trades (last ${recentTrades.length}):`);
  for (const t of recentTrades) {
    const pnlStr = t.pnl !== undefined ? ` | P&L: $${t.pnl.toFixed(2)}` : '';
    logger.info(
      `    ${t.side.toUpperCase()} ${t.quantity} ${t.symbol} @ $${t.executedPrice.toFixed(2)}${pnlStr}`,
    );
  }
  logger.info('');
}

/** paper report — full P&L report with daily/weekly/monthly breakdown */
export async function paperReport(_options: PaperCommandOptions = {}): Promise<void> {
  logger.info('\n📝 Paper Trading — P&L Report\n');
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const pnlTracker = getTracker();
  pnlTracker.logReport();

  // Also export Prometheus format if verbose
  const prom = pnlTracker.exportPrometheus();
  logger.info('\n  Prometheus metrics (for Grafana):');
  for (const line of prom.split('\n')) {
    if (line.startsWith('#') || line.startsWith('paper_trading')) {
      logger.info(`    ${line}`);
    }
  }
  logger.info('');
}

/** paper arb — run cross-platform arbitrage detection */
export async function paperArb(options: PaperCommandOptions = {}): Promise<void> {
  logger.info('\n📝 Paper Trading — Cross-Platform Arbitrage\n');
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  arbDetector = getCrossPlatformArbDetector({
    minSpreadPercent: options.verbose ? 0.1 : 0.5,
    pollIntervalMs: 10_000,
  });

  arbDetector.onOpportunity((opp) => {
    logger.info(`\n  🎯 ARB OPPORTUNITY: ${opp.asset}`);
    logger.info(`     Buy  ${opp.buyPlatform} @ $${opp.buyPrice.toFixed(4)}`);
    logger.info(`     Sell ${opp.sellPlatform} @ $${opp.sellPrice.toFixed(4)}`);
    logger.info(`     Spread: $${opp.spread.toFixed(4)} (${opp.spreadPercent.toFixed(2)}%)`);
    logger.info(`     Confidence: ${opp.confidence}`);
  });

  await arbDetector.start();

  // Run one detection sweep immediately
  const opportunities = arbDetector.detectArb();
  if (opportunities.length === 0) {
    logger.info('  No arbitrage opportunities found at this time.');
    logger.info('  Monitoring for 30 seconds...\n');
    await new Promise((r) => setTimeout(r, 30_000));
    const after = arbDetector.detectArb();
    if (after.length === 0) {
      logger.info('  No opportunities detected in monitoring window.');
    }
  }

  await arbDetector.stop();
  logger.info('');
}
