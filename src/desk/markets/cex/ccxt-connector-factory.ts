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

export function validateKucoinPassphrase(
  exchangeId: SupportedCexExchange,
  adapter?: CcxtExchangeAdapter,
  options?: CcxtExchangeConnectorOptions
): void {
  if (exchangeId === 'kucoin' && !adapter) {
    const prefix = exchangeId.toUpperCase();
    const pwd =
      options?.password ?? process.env[`${prefix}_API_PASSPHRASE`] ?? process.env[`${prefix}_PASSPHRASE`];
    if (options?.apiKey && !pwd) {
      throw new ExchangeConnectorError(
        'KuCoin requires an API passphrase (password) when API credentials are provided',
        exchangeId,
        'MISSING_CREDENTIALS'
      );
    }
  }
}

export function buildSpotExtraParams(
  exchangeId: SupportedCexExchange,
  clientOrderId?: string
): Record<string, unknown> {
  const extraParams: Record<string, unknown> = {};
  if (clientOrderId) {
    extraParams.clientOrderId = clientOrderId;
  }
  if (exchangeId === 'bybit') {
    extraParams.category = 'spot';
  }
  return extraParams;
}

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
