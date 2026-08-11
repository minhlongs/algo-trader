/**
 * ARB:AUTO Command - Autonomous Arbitrage Trading
 * Unified engine orchestrating all arbitrage strategies under single CLI
 * Supports: cross-exchange, triangular, dex-cex, funding-rate, binary-arb, split-merge, cross-market
 */

import { createStrategyOrchestrator, OrchestratorConfig } from '../arbitrage/orchestrator';
import { UnifiedExecutorConfig } from '../arbitrage/unified-executor';
import { logger } from '../../shared/utils/logger';
import { existsSync } from 'fs';
import { join } from 'path';

const ENV_PATH = join(process.cwd(), '.env');

// Supported strategy types
export type StrategyType =
  | 'cross-exchange'
  | 'triangular'
  | 'dex-cex'
  | 'funding-rate'
  | 'binary-arb'
  | 'settlement-arb'
  | 'cross-market'
  | 'all';

export interface AutoCommandOptions {
  symbols?: string;
  exchanges?: string;
  minSpread?: number;
  dryRun?: boolean;
  verbose?: boolean;
  strategy?: StrategyType;
  maxQueueSize?: number;
}

export async function runArbAuto(options: AutoCommandOptions = {}): Promise<void> {
  logger.info('\n⚡ ARB:AUTO — Unified Arbitrage Execution Engine\n');
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Check configuration
  if (!existsSync(ENV_PATH)) {
    logger.info('⚠️  No .env found. Please run `algo-trader setup` first.\n');
    logger.info('Or create .env with:\n');
    logger.info('  EXCHANGE_API_KEY=your_api_key');
    logger.info('  EXCHANGE_SECRET=your_secret');
    logger.info('  REDIS_URL=redis://localhost:6379');
    logger.info('  DATABASE_URL=postgresql://...\n');
    process.exit(1);
  }

  // Parse options
  const symbols = options.symbols
    ? options.symbols.split(',').map((s) => s.trim())
    : ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'];

  const exchanges = options.exchanges
    ? options.exchanges.split(',').map((e) => e.trim().toLowerCase())
    : ['binance', 'okx', 'bybit'];

  const minSpread = options.minSpread || 0.05;
  const dryRun = options.dryRun ?? true;
  const verbose = options.verbose ?? true;
  const strategy = options.strategy || 'all';
  const maxQueueSize = options.maxQueueSize || 50;

  // Strategy display name
  const strategyLabel = strategy === 'all' ? 'ALL STRATEGIES' : strategy.toUpperCase().replace('-ARB', '-ARB').replace('SETTLEMENT-ARB', 'SPLIT-MERGE');

  logger.info('📋 Configuration:');
  logger.info(`  Symbols: ${symbols.join(', ')}`);
  logger.info(`  Exchanges: ${exchanges.join(', ')}`);
  logger.info(`  Min Spread: ${minSpread}%`);
  logger.info(`  Mode: ${dryRun ? 'DRY-RUN' : 'LIVE'}`);
  logger.info(`  Verbose: ${verbose ? 'Yes' : 'No'}`);
  logger.info(`  Strategy: ${strategyLabel}`);
  logger.info(`  Max Queue: ${maxQueueSize}\n`);

  if (dryRun) {
    logger.info('📝 DRY-RUN MODE — No real trades will be executed\n');
  } else {
    logger.info('⚠️  LIVE MODE — Real money at risk!\n');
    const confirm = await promptConfirmation();
    if (!confirm) {
      logger.info('\n⚠️  Live trading cancelled. Exiting.\n');
      process.exit(0);
    }
  }

  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Build execution config for unified engine
  const executionConfig: UnifiedExecutorConfig = {
    dryRun,
    maxPositionSize: 1000,
    slippageTolerance: 0.5,
    minProfitThreshold: minSpread,
    timeoutMs: 5000,
    binary: {
      kellyFraction: 0.25,
      maxDrawdownPct: 20,
      maxPositionSize: 1000,
      dryRun,
    },
    splitMerge: {
      minProfitThreshold: minSpread,
      minVolume: 1000,
      maxPositionSize: 1000,
      dryRun,
    },
    crossMarket: {
      budgetUsdc: 10000,
      maxMarketExposureFraction: 0.2,
      minEdgeThreshold: minSpread,
      feeRate: 0.001,
      timeoutMs: 5000,
      dryRun,
    },
  };

  // Initialize strategy orchestrator
  const orchestrator = createStrategyOrchestrator({
    symbols,
    exchanges: exchanges as ('binance' | 'okx' | 'bybit')[],
    minSpreadPercent: minSpread,
    dryRun,
    verbose,
    maxQueueSize,
    executionConfig,
    checkIntervalMs: 100,
    strategy: strategy as OrchestratorConfig['strategy'],
  });

  // Setup event handlers for backward compatibility
  orchestrator.on('started', (data) => {
    logger.info(`\n✅ Strategy Orchestrator started`);
    logger.info(`   Symbols: ${data.symbols.length}`);
    logger.info(`   Exchanges: ${data.exchanges.length}`);
    logger.info(`   Strategy: ${strategyLabel}\n`);
  });

  // Handle graceful shutdown
  const shutdown = async () => {
    logger.info('\n\n🛑 Shutdown requested...\n');
    await orchestrator.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Start orchestrator
  try {
    await orchestrator.start();

    logger.info('🔍 Scanning markets for arbitrage opportunities...\n');
    logger.info('Press Ctrl+C to stop\n');

    // Print metrics periodically
    setInterval(() => {
      const metrics = orchestrator.getMetrics();
      if (metrics.isRunning) {
        logger.info(`\n📈 METRICS: Scans=${metrics.scansPerformed} Detected=${metrics.opportunitiesDetected} Scored=${metrics.signalsScored} Actionable=${metrics.actionableSignals} Executed=${metrics.executionsSucceeded}/${metrics.executionsAttempted} P95-Det=${metrics.p95DetectionLatencyMs}ms P95-Exec=${metrics.p95ExecutionLatencyMs}ms Profit=$${metrics.totalProfit.toFixed(2)} Queue=${metrics.queueSize}/${metrics.queueDropped}\n`);
      }
    }, 60000); // Every minute

  } catch (error) {
    logger.error('\n❌ ORCHESTRATOR ERROR\n');
    logger.error(error instanceof Error ? error.message : String(error));
    logger.error('\nPlease check your configuration and try again.\n');
    await orchestrator.stop();
    process.exit(1);
  }
}

async function promptConfirmation(): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    readline.question('Confirm live trading with real money? (y/N): ', (answer: string) => {
      readline.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}
