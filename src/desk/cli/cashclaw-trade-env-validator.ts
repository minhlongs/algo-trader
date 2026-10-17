/**
 * CashClaw Trade Environment Validator and Confirmation Helpers
 *
 * @module desk/cli/cashclaw-trade-env-validator
 */

import * as readline from 'readline';
import { logger } from '../../shared/utils/logger';

export const REQUIRED_VARS: Array<{ newName: string; oldName: string }> = [
  { newName: 'POLYMARKET_API_KEY', oldName: 'POLY_API_KEY' },
  { newName: 'POLYMARKET_API_SECRET', oldName: 'POLY_API_SECRET' },
  { newName: 'POLYMARKET_PASSPHRASE', oldName: 'POLY_PASSPHRASE' },
  { newName: 'POLYMARKET_PRIVATE_KEY', oldName: 'POLY_PRIVATE_KEY' },
];

export function validateLiveEnv(): void {
  const missing = REQUIRED_VARS.filter(
    ({ newName, oldName }) => !process.env[newName] && !process.env[oldName],
  );
  if (missing.length > 0) {
    const names = missing.map(({ newName, oldName }) => `${newName} (or ${oldName})`);
    logger.error(`Cannot start LIVE trading. Missing env vars: ${names.join(', ')}`);
    process.exit(1);
  }
}

export async function confirmLiveTrading(opts: {
  strategyNames: string[];
  capitalUsdc: number;
  maxTicks: number;
  yes: boolean;
}): Promise<void> {
  if (opts.yes) return;
  logger.info('⚠️  LIVE TRADING: This will use REAL USDC on Polymarket.');
  logger.info(
    `   Strategies: ${opts.strategyNames.join(', ')} | Capital: $${opts.capitalUsdc} | Ticks: ${opts.maxTicks > 0 ? opts.maxTicks : 'unlimited'}`,
  );
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolve) =>
    rl.question('\nConfirm? (y/N): ', resolve),
  );
  rl.close();
  if (!answer.toLowerCase().startsWith('y')) {
    logger.info('Aborted.');
    process.exit(0);
  }
}
