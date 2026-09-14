/**
 * Setup Wizard - Environment File Generation and Persistence
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { logger } from '../../shared/utils/logger';
import { SetupConfig, ENV_PATH, ENV_EXAMPLE_PATH } from './setup-wizard-types';

export function generateEnvContent(config: Partial<SetupConfig>): string {
  const timestamp = new Date().toISOString();
  return `# Algo Trader Configuration
# Generated: ${timestamp}
# WARNING: Never commit this file to version control

# Exchange API Keys
EXCHANGE_API_KEY=${config.exchangeApiKey || 'your-api-key-here'}
EXCHANGE_SECRET=${config.exchangeSecret || 'your-secret-here'}

# Trading Mode
TRADING_MODE=${config.tradingMode || 'dry-run'}
DRY_RUN=${config.tradingMode === 'dry-run' ? 'true' : 'false'}

# Risk Management
RISK_PER_TRADE=${config.riskPerTrade || 1}
MAX_DAILY_LOSS=${config.maxDailyLoss || 5}

# Telegram Notifications (Optional)
TELEGRAM_BOT_TOKEN=${config.telegramBotToken || ''}
TELEGRAM_CHAT_ID=${config.telegramChatId || ''}

# Bot Configuration
ENABLE_BACKTESTING=true
ENABLE_LIVE_TRADING=${config.tradingMode === 'live'}
LOG_LEVEL=info
`;
}

export function mergeWithExample(example: string, config: Partial<SetupConfig>): string {
  let updated = example;

  const replacements: Record<string, string> = {
    'EXCHANGE_API_KEY=.*': `EXCHANGE_API_KEY=${config.exchangeApiKey || 'your-api-key-here'}`,
    'EXCHANGE_SECRET=.*': `EXCHANGE_SECRET=${config.exchangeSecret || 'your-secret-here'}`,
    'TRADING_MODE=.*': `TRADING_MODE=${config.tradingMode || 'dry-run'}`,
    'DRY_RUN=.*': `DRY_RUN=${config.tradingMode === 'dry-run' ? 'true' : 'false'}`,
    'RISK_PER_TRADE=.*': `RISK_PER_TRADE=${config.riskPerTrade || 1}`,
    'MAX_DAILY_LOSS=.*': `MAX_DAILY_LOSS=${config.maxDailyLoss || 5}`,
  };

  for (const [pattern, value] of Object.entries(replacements)) {
    const regex = new RegExp(pattern, 'g');
    if (updated.match(regex)) {
      updated = updated.replace(regex, value);
    }
  }

  return updated;
}

export function saveConfiguration(config: Partial<SetupConfig>): void {
  const envContent = generateEnvContent(config);
  writeFileSync(ENV_PATH, envContent);
  logger.info(`✅ Configuration saved to: ${ENV_PATH}`);

  // Also update .env.example if it exists
  if (existsSync(ENV_EXAMPLE_PATH)) {
    const exampleContent = readFileSync(ENV_EXAMPLE_PATH, 'utf-8');
    const updatedExample = mergeWithExample(exampleContent, config);
    writeFileSync(ENV_EXAMPLE_PATH, updatedExample);
    logger.info(`✅ Updated: ${ENV_EXAMPLE_PATH}`);
  }
}
