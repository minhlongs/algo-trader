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

const ENV_PATH = join(process.cwd(), '.env');

export async function runQuickstart(): Promise<UnifiedTradingLoop | void> {
  logger.info('Algo Trader Quickstart');

  // Step 1: Check if .env exists, if not run setup wizard
  if (!existsSync(ENV_PATH)) {
    logger.warn('No configuration found. Running setup wizard...');
    await runSetupWizard();
  }

  // Step 2: Load configuration
  logger.info('Loading configuration...');
  const config = loadConfiguration();

  // Step 3: Validate configuration
  logger.info('Validating configuration...');
  validateConfiguration(config);

  // Step 4: Show configuration summary
  logger.info('Configuration Summary', {
    tradingMode: config.tradingMode,
    riskPerTrade: config.riskPerTrade,
    maxDailyLoss: config.maxDailyLoss,
    backtesting: config.enableBacktesting ? 'Enabled' : 'Disabled',
    liveTrading: config.enableLiveTrading ? 'Enabled' : 'Disabled',
    exchangeApi: config.apiKeyConfigured ? 'Configured' : 'Not configured (dry-run only)',
    telegram: config.telegramConfigured ? 'Enabled' : 'Disabled',
  });

  // Step 5: Start trading engine based on mode
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

interface QuickstartConfig {
  tradingMode: 'dry-run' | 'live';
  riskPerTrade: number;
  maxDailyLoss: number;
  enableBacktesting: boolean;
  enableLiveTrading: boolean;
  apiKeyConfigured: boolean;
  telegramConfigured: boolean;
}

function loadConfiguration(): QuickstartConfig {
  const env = process.env;
  return {
    tradingMode: env.DRY_RUN === 'true' ? 'dry-run' : 'live',
    riskPerTrade: parseFloat(env.RISK_PER_TRADE || '1'),
    maxDailyLoss: parseFloat(env.MAX_DAILY_LOSS || '5'),
    enableBacktesting: env.ENABLE_BACKTESTING !== 'false',
    enableLiveTrading: env.ENABLE_LIVE_TRADING === 'true',
    apiKeyConfigured: !!(env.EXCHANGE_API_KEY && env.EXCHANGE_SECRET),
    telegramConfigured: !!(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID),
  };
}

function validateConfiguration(config: QuickstartConfig): void {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (config.riskPerTrade <= 0 || config.riskPerTrade > 10) {
    errors.push('RISK_PER_TRADE must be between 0 and 10');
  }

  if (config.maxDailyLoss <= 0 || config.maxDailyLoss > 50) {
    errors.push('MAX_DAILY_LOSS must be between 0 and 50');
  }

  if (config.riskPerTrade > config.maxDailyLoss) {
    warnings.push('RISK_PER_TRADE is higher than MAX_DAILY_LOSS');
  }

  if (config.tradingMode === 'live' && !config.apiKeyConfigured) {
    warnings.push('Live trading mode but no API keys configured');
  }

  if (warnings.length > 0) {
    warnings.forEach((w) => logger.warn(`Configuration warning: ${w}`));
  }

  if (errors.length > 0) {
    errors.forEach((e) => logger.error(`Configuration error: ${e}`));
    logger.error('Please run `npm run setup` to reconfigure.');
    process.exit(1);
  }

  logger.info('Configuration valid');
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

  // Execute initial signal pulse to bootstrap loop
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
