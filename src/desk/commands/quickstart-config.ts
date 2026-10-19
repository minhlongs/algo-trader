/**
 * Quickstart Configuration & Validation
 *
 * @module desk/commands/quickstart-config
 */

import { logger } from '../../shared/utils/logger';

export interface QuickstartConfig {
  tradingMode: 'dry-run' | 'live';
  riskPerTrade: number;
  maxDailyLoss: number;
  enableBacktesting: boolean;
  enableLiveTrading: boolean;
  apiKeyConfigured: boolean;
  telegramConfigured: boolean;
}

export function loadConfiguration(): QuickstartConfig {
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

export function validateConfiguration(config: QuickstartConfig): void {
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
