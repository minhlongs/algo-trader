/**
 * NOWPayments HTTP Client
 *
 * Extracted from nowpayments-service.ts to eliminate 3 identical
 * fetch-call-error-return blocks. Handles API key guard, headers,
 * error logging, and null-return semantics.
 */

import { logger } from '../../shared/utils/logger';

const BASE_URL = 'https://api.nowpayments.io/v1';

export interface NowpaymentsFetchOptions {
  method?: 'GET' | 'POST';
  body?: Record<string, unknown>;
}

/**
 * Perform a request to the NOWPayments API.
 *
 * @returns parsed JSON on success, or `null` if the API key is missing,
 *          the response is non-OK, or the fetch itself throws.
 */
export async function nowpaymentsFetch<T>(
  apiKey: string,
  path: string,
  opts: NowpaymentsFetchOptions = {},
): Promise<T | null> {
  if (!apiKey) {
    logger.warn('[NOWPayments] API key not configured');
    return null;
  }

  const url = `${BASE_URL}${path}`;
  const headers: Record<string, string> = { 'x-api-key': apiKey };
  const init: RequestInit = { headers };

  if (opts.body) {
    init.method = 'POST';
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(opts.body);
  } else if (opts.method) {
    init.method = opts.method;
  }

  try {
    const res = await fetch(url, init);

    if (!res.ok) {
      const errBody = await res.text();
      logger.error(`[NOWPayments] API error ${res.status}: ${path}`, { body: errBody });
      return null;
    }

    return (await res.json()) as T;
  } catch (error) {
    logger.error(`[NOWPayments] Request failed: ${path}`, { error });
    return null;
  }
}
