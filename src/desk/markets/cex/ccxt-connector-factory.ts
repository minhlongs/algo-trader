/**
 * CCXT Exchange Adapter Factory
 * Instantiates configured CCXT client instances for Binance, Bybit, and KuCoin.
 */

import * as ccxt from 'ccxt';
import {
  type SupportedCexExchange,
  type CcxtExchangeAdapter,
  type CcxtExchangeConnectorOptions,
} from './ccxt-connector-types';
import { ExchangeConnectorError } from '../../arbitrage/connectors/types';
import { logger } from '../../../shared/utils/logger';

/** Factory creating real CCXT exchange adapter with configuration */
export function createCcxtExchange(
  exchangeId: SupportedCexExchange,
  options?: CcxtExchangeConnectorOptions
): CcxtExchangeAdapter {
  const ccxtModules = ccxt as unknown as Record<string, new (opts?: unknown) => CcxtExchangeAdapter>;
  const Ctor = ccxtModules[exchangeId];
  if (!Ctor) {
    throw new ExchangeConnectorError(
      `Unsupported CCXT exchange identifier: ${exchangeId}`,
      exchangeId,
      'UNSUPPORTED_EXCHANGE'
    );
  }

  const prefix = exchangeId.toUpperCase();
  const apiKey = options?.apiKey ?? process.env[`${prefix}_API_KEY`] ?? '';
  const secret =
    options?.secret ?? process.env[`${prefix}_API_SECRET`] ?? process.env[`${prefix}_SECRET`] ?? '';
  const password =
    options?.password ?? process.env[`${prefix}_API_PASSPHRASE`] ?? process.env[`${prefix}_PASSPHRASE`] ?? '';

  if (exchangeId === 'kucoin' && !password && !options?.testnet) {
    logger.warn(`[${exchangeId}] KuCoin initialized without API passphrase`);
  }

  const config: Record<string, unknown> = {
    apiKey,
    secret,
    enableRateLimit: options?.rateLimit ?? true,
    timeout: options?.timeoutMs ?? 10_000,
    options: {
      defaultType: 'spot',
      adjustForTimeDifference: true,
    },
  };

  if (exchangeId === 'kucoin' && password) {
    config.password = password;
  }
  if (exchangeId === 'bybit') {
    config.options = { defaultType: 'spot', defaultSubType: 'spot' };
  }
  if (options?.testnet) {
    config.sandbox = true;
  }

  return new Ctor(config);
}
