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

export interface DemoTradeOptions {
  strategy: string;
  capital: string;
  yes: boolean;
}

export async function handleDemoTrade(opts: DemoTradeOptions): Promise<void> {
  const capitalUsdc = parseFloat(opts.capital);

  if (isNaN(capitalUsdc) || capitalUsdc <= 0) {
    console.error('Error: --capital must be a positive number');
    process.exit(1);
  }

  // Dynamic import to avoid circular deps (strategy-registry imports strategy constructors)
  const { getStrategy } = await import('../polymarket/strategy-registry');
  const entry = getStrategy(opts.strategy);

  if (!entry) {
    console.error(`Unknown strategy: ${opts.strategy}`);
    console.error('Use "cashclaw trade list-strategies" to see available options.');
    process.exit(1);
  }

  const symbol = `demo:${entry.name}`;
  const sizeUsdc = parseFloat(entry.defaultConfig.positionSize) || 8;
  const side = 'buy' as const;

  // Reset paper executor for clean demo state, then start with requested capital
  resetPaperExecutor();
  const executor = getPaperExecutor();
  const account = await executor.start(capitalUsdc);
  console.log(`\nCashClaw Demo Trade`);
  console.log('─'.repeat(50));
  console.log(`Strategy:    ${entry.name}`);
  console.log(`Description: ${entry.description}`);
  console.log(`Capital:     $${capitalUsdc.toFixed(2)}`);
  console.log(`Trade size:  $${sizeUsdc.toFixed(2)} (from strategy config)`);
  console.log(`Symbol:      ${symbol}`);
  console.log('');

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
    console.log(`Result: ${result.message ?? 'Order not filled (simulated market conditions)'}`);
    console.log(`  Allowed: no`);
    if (result.account) {
      console.log(`  Balance: $${result.account.balance.toFixed(2)}`);
    }
    console.log('');
    return;
  }

  const trade = result.trade!;
  const account = result.account!;

  console.log(`Trade ID:    ${trade.id}`);
  console.log(`Side:        ${trade.side.toUpperCase()}`);
  console.log(`Requested:   ${trade.quantity} @ $${trade.requestedPrice.toFixed(4)}`);
  console.log(`Executed:    ${trade.quantity} @ $${trade.executedPrice.toFixed(4)}`);
  console.log(`Fee:         $${trade.fee.toFixed(4)} | Slippage: ${(trade.slippage * 100).toFixed(2)}%`);
  console.log(`Status:      ${trade.status}`);
  console.log(`Time:        ${new Date(trade.timestamp).toISOString()}`);
  console.log('');
  console.log('─'.repeat(50));
  console.log('Account Summary:');
  console.log(`  Balance:      $${account.balance.toFixed(2)}`);
  console.log(`  Equity:       $${account.equity.toFixed(2)}`);
  console.log(`  Realized P&L: $${account.realizedPnl.toFixed(2)}`);
  console.log(`  Total Trades: ${account.totalTrades}`);
  console.log(`  Win/Loss:     ${account.winningTrades}W / ${account.losingTrades}L`);
  console.log('');
}
