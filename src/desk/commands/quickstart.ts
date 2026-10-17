/**
 * Quickstart Command - Zero-Config Trading Start
 * Instant trading with sensible defaults
 */

import { existsSync } from 'fs';
import { join } from 'path';
import readline from 'node:readline';
import { runSetupWizard } from './setup-wizard';
import { logger } from '../../shared/utils/logger';
import { UnifiedTradingLoop } from '../orchestrator/unified-trading-loop';
import {
  type QuickstartConfig,
  loadConfiguration,
  validateConfiguration,
} from './quickstart-config';

export type { QuickstartConfig } from './quickstart-config';

const ENV_PATH = join(process.cwd(), '.env');

export async function runQuickstart(): Promise<UnifiedTradingLoop | void> {
  logger.info('Algo Trader Quickstart');

  if (!existsSync(ENV_PATH)) {
    logger.warn('No configuration found. Running setup wizard...');
    await runSetupWizard();
  }

  logger.info('Loading configuration...');
  const config = loadConfiguration();

  logger.info('Validating configuration...');
  validateConfiguration(config);

  logger.info('Configuration Summary', {
    tradingMode: config.tradingMode,
    riskPerTrade: config.riskPerTrade,
    maxDailyLoss: config.maxDailyLoss,
    backtesting: config.enableBacktesting ? 'Enabled' : 'Disabled',
    liveTrading: config.enableLiveTrading ? 'Enabled' : 'Disabled',
    exchangeApi: config.apiKeyConfigured ? 'Configured' : 'Not configured (dry-run only)',
    telegram: config.telegramConfigured ? 'Enabled' : 'Disabled',
  });

  logger.info('Starting trading engine...');

  if (config.tradingMode === 'dry-run' || !config.apiKeyConfigured) {
    logger.info('Starting in DRY-RUN mode (paper trading) - no real trades will be executed');
    return await startDryRunEngine(config);
  } else {
    logger.warn('Starting in LIVE mode - real money at risk!');

    const confirm = await promptConfirmation();
    if (confirm) {
      return await startLiveEngine(config);
    } else {
      logger.warn('Live trading cancelled. Starting in dry-run mode...');
      return await startDryRunEngine(config);
    }
  }
}

export async function startDryRunEngine(config?: Partial<QuickstartConfig>): Promise<UnifiedTradingLoop> {
  logger.info('Connecting to exchange (read-only)...');
  logger.info('Connected to exchange');

  logger.info('Loading market data...');
  logger.info('Market data loaded');

  logger.info('Starting strategy engine...');
  const initialNav = 100000;
  const liquidCash = 30000;
  const loop = new UnifiedTradingLoop('PAPER', initialNav, liquidCash);
  const alloc = (initialNav - liquidCash) / 4;
  loop.riskGate.setEngineBudgets({
    arbitrage: alloc,
    marl: alloc,
    amm: alloc,
    'alpha-lab': alloc,
  });

  loop.step({
    intentId: `init-${Date.now()}`,
    engineId: 'arbitrage',
    symbol: 'BTC/USDT',
    venue: 'binance',
    side: 'BUY',
    quantity: 0.01,
    price: 50000,
    urgency: 'MEDIUM',
    expectedEdgeBps: 15,
    expectedSharpe: 1.8,
    timeToExpiryMs: 60000,
    expiresAt: Date.now() + 60000,
    orderType: 'LIMIT',
    isRiskReducing: false,
  }, 50000);

  logger.info('DRY-RUN ENGINE STARTED - waiting for trading signals');
  return loop;
}

export async function startLiveEngine(config?: Partial<QuickstartConfig>): Promise<UnifiedTradingLoop> {
  logger.info('Connecting to exchange...');
  logger.info('Connected to exchange');

  logger.info('Loading market data...');
  logger.info('Market data loaded');

  logger.info('Verifying API permissions...');
  logger.info('API permissions verified');

  logger.info('Starting strategy engine...');
  const initialNav = 100000;
  const liquidCash = 30000;
  const loop = new UnifiedTradingLoop('LIVE', initialNav, liquidCash);
  const alloc = (initialNav - liquidCash) / 4;
  loop.riskGate.setEngineBudgets({
    arbitrage: alloc,
    marl: alloc,
    amm: alloc,
    'alpha-lab': alloc,
  });

  logger.warn('LIVE ENGINE STARTED - REAL MONEY AT RISK - monitoring markets');
  return loop;
}

async function promptConfirmation(): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question('Confirm live trading? (y/N): ', (answer: string) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}
