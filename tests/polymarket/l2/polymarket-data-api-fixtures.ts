/**
 * Live-shaped payloads for the Data API v2 / CLOB client tests (captured 2026-11-12).
 */

import { vi } from 'vitest';
import {
  CLOB_BASE,
  DATA_API_BASE,
} from '../../../src/desk/polymarket/polymarket-data-api-client';

export { CLOB_BASE, DATA_API_BASE };

export const CONDITION = '0x835acf3bffe67dcfb5e5f97aba52414739b6f5ff1970195b52d97bb374796155';
export const TOKEN = '94592567375755535402382514854858851873438883868449100686326493803085500123190';
export const WALLET = '0x0b4cd82afbda072e8139a1d6b4bc83d2e8ef4277';

export const TRADE_ROW = {
  proxy_wallet: WALLET,
  side: 'BUY',
  token_id: TOKEN,
  condition_id: CONDITION,
  size: 46.85,
  price: 0.39,
  timestamp: 1_794_487_905,
  title: 'Jensen Huang announced resignation or removal by November 12, 2026?',
  slug: 'jensen-huang-announced-resignation-or-removal-by-november-12-2026',
  icon: 'https://example.invalid/icon.png',
  outcome: 'Yes',
  outcome_index: 0,
  transaction_hash: '0xf4202ebbb9acabb0e627c84d46471a133c0669713c672c2ccf8f100c83fe1103',
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** Fake fetch that records the URLs it was asked for. No network access. */
export function fakeFetch(body: unknown, status = 200): { fetchImpl: typeof fetch; calls: string[] } {
  const calls: string[] = [];
  const mock = vi.fn(async (input: string | URL | Request) => {
    calls.push(String(input));
    return jsonResponse(body, status);
  });
  return { fetchImpl: mock as unknown as typeof fetch, calls };
}
