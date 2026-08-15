/**
 * Demo Trade Handler — runs a single paper trade through the full pipeline.
 *
 * Flow: strategy-registry → paper-executor → lifecycle
 * Does NOT use RiskGateManager (requires LiveExecutionGuard dependency chain).
 * Does NOT use StrategyRunner (full loop). Single trade only.
 *
 * Task #34 — Demo-trade e2e flow
 */

import { getPaperExecutor, resetPaperExecutor } from '../execution/paper-executor';
import type { TradeSignal, ExecutionResult, PaperAccount } from '../execution/paper-position-tracker';
import { logger } from '../../shared/utils/logger';

export interface DemoTradeOptions {
  strategy: string;
  capital: string;
  yes: boolean;
}

export async function handleDemoTrade(opts: DemoTradeOptions): Promise<void> {
  const capitalUsdc = parseFloat(opts.capital);

  if (isNaN(capitalUsdc) || capitalUsdc <= 0) {
    logger.error('Error: --capital must be a positive number');
    process.exit(1);
  }

  // Dynamic import to avoid circular deps (strategy-registry imports strategy constructors)
  const { getStrategy } = await import('../polymarket/strategy-registry');
  const entry = getStrategy(opts.strategy);

  if (!entry) {
    logger.error(`Unknown strategy: ${opts.strategy}`);
    logger.error('Use "cashclaw trade list-strategies" to see available options.');
    process.exit(1);
  }

  const symbol = `demo:${entry.name}`;
  const sizeUsdc = parseFloat(entry.defaultConfig.positionSize) || 8;
  const side = 'buy' as const;

  // Reset paper executor for clean demo state, then start with requested capital
  resetPaperExecutor();
  const executor = getPaperExecutor();
  const account = await executor.start(capitalUsdc);
  logger.info(`\nCashClaw Demo Trade`);
  logger.info('─'.repeat(50));
  logger.info(`Strategy:    ${entry.name}`);
  logger.info(`Description: ${entry.description}`);
  logger.info(`Capital:     $${capitalUsdc.toFixed(2)}`);
  logger.info(`Trade size:  $${sizeUsdc.toFixed(2)} (from strategy config)`);
  logger.info(`Symbol:      ${symbol}`);
  logger.info('');

  // Build signal — use entry.price from config if available, else fall back to mid-market
  const signal: TradeSignal = {
    symbol,
    side,
    quantity: sizeUsdc,
  };

  // Use a default market price. Strategies config doesn't always include an entry price
  // field. For a single-trade demo, we pick a reasonable mid-market price.
  const marketPrice = 0.5;

  const result = await executor.executePaperTrade(signal, marketPrice);
  printResult(result, account);

  // Clean up
  executor.stop();
  resetPaperExecutor();
}

function printResult(result: ExecutionResult, startAccount: PaperAccount): void {
  if (!result.success) {
    logger.info(`Result: ${result.message ?? 'Order not filled (simulated market conditions)'}`);
    logger.info(`  Allowed: no`);
    if (result.account) {
      logger.info(`  Balance: $${result.account.balance.toFixed(2)}`);
    }
    logger.info('');
    return;
  }

  const trade = result.trade!;
  const account = result.account!;

  logger.info(`Trade ID:    ${trade.id}`);
  logger.info(`Side:        ${trade.side.toUpperCase()}`);
  logger.info(`Requested:   ${trade.quantity} @ $${trade.requestedPrice.toFixed(4)}`);
  logger.info(`Executed:    ${trade.quantity} @ $${trade.executedPrice.toFixed(4)}`);
  logger.info(`Fee:         $${trade.fee.toFixed(4)} | Slippage: ${(trade.slippage * 100).toFixed(2)}%`);
  logger.info(`Status:      ${trade.status}`);
  logger.info(`Time:        ${new Date(trade.timestamp).toISOString()}`);
  logger.info('');
  logger.info('─'.repeat(50));
  logger.info('Account Summary:');
  logger.info(`  Balance:      $${account.balance.toFixed(2)}`);
  logger.info(`  Equity:       $${account.equity.toFixed(2)}`);
  logger.info(`  Realized P&L: $${account.realizedPnl.toFixed(2)}`);
  logger.info(`  Total Trades: ${account.totalTrades}`);
  logger.info(`  Win/Loss:     ${account.winningTrades}W / ${account.losingTrades}L`);
  logger.info('');
}
