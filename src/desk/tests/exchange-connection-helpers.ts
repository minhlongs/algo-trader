/**
 * Exchange Connection Tester — Pure Diagnostic & Formatting Helpers
 */

/** A single exchange endpoint to test. */
export interface ExchangeEndpoint {
  name: string;
  restUrl: string;
  wsUrl?: string;
  apiKeyEnv?: string;
}

/** Result of testing one exchange's connectivity. */
export interface ConnectionResult {
  exchange: string;
  restOk: boolean;
  wsOk: boolean;
  latencyMs: number;
  error?: string;
}

/** Configuration for the tester. */
export interface ExchangeConnectionTesterConfig {
  exchanges: ExchangeEndpoint[];
  timeoutMs: number;
}

export const DEFAULT_EXCHANGES: ExchangeEndpoint[] = [
  {
    name: 'Binance',
    restUrl: 'https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT',
    wsUrl: 'wss://stream.binance.com:9443/ws/btcusdt@ticker',
  },
  {
    name: 'Bybit',
    restUrl: 'https://api.bybit.com/v5/market/tickers?category=spot&symbol=BTCUSDT',
    wsUrl: 'wss://stream.bybit.com/v5/public/spot',
  },
  {
    name: 'OKX',
    restUrl: 'https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT',
    wsUrl: 'wss://ws.okx.com:8443/ws/v5/public',
  },
  {
    name: 'Kraken',
    restUrl: 'https://api.kraken.com/0/public/Ticker?pair=XBTUSD',
    wsUrl: 'wss://ws.kraken.com',
  },
];

export function mapSettledConnectionResult(
  result: PromiseSettledResult<ConnectionResult>,
  endpoint: ExchangeEndpoint,
): ConnectionResult {
  if (result.status === 'fulfilled') return result.value;
  return {
    exchange: endpoint.name,
    restOk: false,
    wsOk: false,
    latencyMs: -1,
    error: result.reason instanceof Error ? result.reason.message : String(result.reason),
  };
}

export function formatRestFetchError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('abort') ? 'REST timeout' : `REST error: ${msg}`;
}

/** Generate a human-readable report from results. */
export function formatExchangeConnectionReport(results: ConnectionResult[]): string {
  const lines: string[] = ['=== Exchange Connectivity Report ===', ''];
  let allOk = true;
  for (const r of results) {
    const status = r.restOk && (r.wsOk || !r.error) ? 'PASS' : 'FAIL';
    if (status === 'FAIL') allOk = false;
    lines.push(`[${status}] ${r.exchange}`);
    lines.push(`  REST: ${r.restOk ? 'OK' : 'FAIL'}`);
    if (r.wsOk || r.restOk) lines.push(`  WS:   ${r.wsOk ? 'OK' : 'N/A'}`);
    lines.push(`  Latency: ${r.latencyMs}ms`);
    if (r.error) lines.push(`  Error: ${r.error}`);
    lines.push('');
  }
  lines.push(allOk ? 'All exchanges reachable.' : 'Some exchanges unreachable — check errors above.');
  return lines.join('\n');
}
