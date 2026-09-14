/**
 * Setup Wizard - Configuration Types and Constants
 */

import { join } from 'path';

export interface SetupConfig {
  exchangeApiKey: string;
  exchangeSecret: string;
  tradingMode: 'dry-run' | 'live';
  riskPerTrade: number;
  maxDailyLoss: number;
  telegramBotToken?: string;
  telegramChatId?: string;
}

export const ENV_EXAMPLE_PATH = join(process.cwd(), '.env.example');
export const ENV_PATH = join(process.cwd(), '.env');

export const RISK_PRESETS = {
  conservative: { riskPerTrade: 0.5, maxDailyLoss: 2 },
  moderate: { riskPerTrade: 1, maxDailyLoss: 5 },
  aggressive: { riskPerTrade: 2, maxDailyLoss: 10 },
} as const;
