/**
 * Setup Wizard - Interactive CLI for Zero-Config Onboarding
 * Prompts for API keys, risk preferences, and trading mode
 */

import { logger } from '../../shared/utils/logger';
import {
  SetupConfig,
  RISK_PRESETS,
  ENV_PATH,
  ENV_EXAMPLE_PATH,
} from './setup-wizard-types';
import { createPrompt, prompt, promptSecret } from './setup-wizard-prompt';
import {
  generateEnvContent,
  mergeWithExample,
  saveConfiguration,
} from './setup-wizard-env';

export {
  SetupConfig,
  RISK_PRESETS,
  ENV_PATH,
  ENV_EXAMPLE_PATH,
  createPrompt,
  prompt,
  promptSecret,
  generateEnvContent,
  mergeWithExample,
  saveConfiguration,
};

export async function runSetupWizard(): Promise<void> {
  const rl = createPrompt();

  try {
    logger.info('\n🚀 Algo Trader Setup Wizard\n');
    logger.info('This wizard will help you configure your trading bot.\n');

    const config: Partial<SetupConfig> = {};

    // Step 1: Exchange API Keys
    logger.info('━━━ Step 1: Exchange API Keys ━━━\n');
    logger.info('Enter your exchange API credentials.');
    logger.info('Leave blank to skip (required for live trading).\n');

    config.exchangeApiKey = (await prompt(rl, 'Exchange API Key:'))?.trim() || '';
    config.exchangeSecret = (await promptSecret(rl, 'Exchange API Secret:'))?.trim() || '';

    if (config.exchangeApiKey && config.exchangeSecret) {
      logger.info('✅ API keys saved\n');
    } else {
      logger.info('⚠️  Skipping API keys (dry-run mode only)\n');
    }

    // Step 2: Trading Mode
    logger.info('━━━ Step 2: Trading Mode ━━━\n');
    logger.info('Select your trading mode:');
    logger.info('  1) dry-run - Paper trading, no real money [default]');
    logger.info('  2) live - Real trading with real money\n');

    const modeChoice = (await prompt(rl, 'Enter choice (1 or 2):'))?.trim() || '1';
    config.tradingMode = modeChoice === '2' ? 'live' : 'dry-run';
    logger.info(`✅ Trading mode: ${config.tradingMode}\n`);

    // Step 3: Risk Preferences
    logger.info('━━━ Step 3: Risk Preferences ━━━\n');
    logger.info('Choose your risk profile:');
    logger.info('  1) Conservative - 0.5% per trade, 2% daily max');
    logger.info('  2) Moderate - 1% per trade, 5% daily max (recommended) [default]');
    logger.info('  3) Aggressive - 2% per trade, 10% daily max');
    logger.info('  4) Custom - Enter your own values\n');

    const riskChoice = (await prompt(rl, 'Enter choice (1-4):'))?.trim() || '2';

    if (riskChoice === '4') {
      const rawRisk = parseFloat((await prompt(rl, 'Risk per trade (%)?')) || '1');
      const rawMax = parseFloat((await prompt(rl, 'Max daily loss (%)?')) || '5');
      const riskPerTrade = Number.isNaN(rawRisk) || rawRisk <= 0 || rawRisk > 10 ? 1 : rawRisk;
      const maxDailyLoss = Number.isNaN(rawMax) || rawMax <= 0 || rawMax > 50 ? 5 : rawMax;
      config.riskPerTrade = riskPerTrade;
      config.maxDailyLoss = Math.max(maxDailyLoss, riskPerTrade);
    } else {
      const presetKeys = Object.keys(RISK_PRESETS);
      const presetIndex = parseInt(riskChoice) - 1;
      if (presetIndex >= 0 && presetIndex < presetKeys.length) {
        const preset = RISK_PRESETS[presetKeys[presetIndex] as keyof typeof RISK_PRESETS];
        config.riskPerTrade = preset.riskPerTrade;
        config.maxDailyLoss = preset.maxDailyLoss;
      } else {
        config.riskPerTrade = 1;
        config.maxDailyLoss = 5;
      }
    }
    logger.info(`✅ Risk: ${config.riskPerTrade}% per trade, ${config.maxDailyLoss}% daily max\n`);

    // Step 4: Telegram Notifications (Optional)
    logger.info('━━━ Step 4: Telegram Notifications (Optional) ━━━\n');
    logger.info('Get trade notifications on Telegram.');
    logger.info('Leave blank to skip.\n');

    const setupTelegram = ((await prompt(rl, 'Setup Telegram? (y/N):')) || '').trim().toLowerCase();
    if (setupTelegram === 'y' || setupTelegram === 'yes') {
      config.telegramBotToken = (await promptSecret(rl, 'Telegram Bot Token:'))?.trim() || '';
      config.telegramChatId = (await prompt(rl, 'Telegram Chat ID:'))?.trim() || '';

      if (config.telegramBotToken && config.telegramChatId) {
        logger.info('✅ Telegram configured\n');
      } else {
        logger.info('⚠️  Skipping Telegram\n');
      }
    }

    // Generate .env file
    logger.info('━━━ Saving Configuration ━━━\n');
    saveConfiguration(config);

    logger.info('\n✅ Setup complete!\n');
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    logger.info('Next steps:');
    logger.info('  1. Run `npm run quickstart` to start trading');
    logger.info('  2. Monitor logs for trade signals');
    logger.info('  3. Check /dashboard for real-time stats\n');
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  } finally {
    rl.close();
  }
}
