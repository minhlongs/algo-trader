/**
 * Exchange Connection Tester — validates exchange API connectivity before live trading.
 * Tests REST endpoints (public ticker) and optional WebSocket ping/pong.
 */
import { logger } from '../../shared/utils/logger';

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

const DEFAULT_EXCHANGES: ExchangeEndpoint[] = [
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

/**
 * Tests exchange API connectivity (REST + optional WebSocket).
 * @example
 * const tester = new ExchangeConnectionTester({ timeoutMs: 5000 });
 * const results = await tester.testAll();
 * console.log(tester.report(results));
 */
export class ExchangeConnectionTester {
  private readonly config: ExchangeConnectionTesterConfig;

  constructor(config?: Partial<ExchangeConnectionTesterConfig>) {
    this.config = {
      exchanges: config?.exchanges ?? DEFAULT_EXCHANGES,
      timeoutMs: config?.timeoutMs ?? 10_000,
    };
  }

  /** Test all configured exchanges in parallel. */
  async testAll(): Promise<ConnectionResult[]> {
    logger.info('Testing all exchanges', { count: this.config.exchanges.length });
    const results = await Promise.allSettled(
      this.config.exchanges.map((ex) => this.testOne(ex))
    );
    return results.map((r, i) => {
      if (r.status === 'fulfilled') return r.value;
      const ep = this.config.exchanges[i];
      return {
        exchange: ep.name, restOk: false, wsOk: false, latencyMs: -1,
        error: r.reason instanceof Error ? r.reason.message : String(r.reason),
      };
    });
  }

  /** Test a single exchange's REST endpoint and optional WebSocket. */
  async testOne(exchange: ExchangeEndpoint): Promise<ConnectionResult> {
    const start = Date.now();
    let restOk = false;
    let wsOk = false;
    let error: string | undefined;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
      const resp = await fetch(exchange.restUrl, { method: 'HEAD', signal: controller.signal });
      clearTimeout(timer);
      restOk = resp.ok;
      if (!resp.ok) error = `REST ${resp.status} ${resp.statusText}`;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      error = msg.includes('abort') ? 'REST timeout' : `REST error: ${msg}`;
    }

    if (exchange.wsUrl) {
      wsOk = await this.testWebSocket(exchange.wsUrl);
      if (!wsOk && !error) error = 'WS connection failed';
    }

    const latencyMs = Date.now() - start;
    logger.info(`Exchange ${exchange.name}`, { restOk, wsOk, latencyMs });
    return { exchange: exchange.name, restOk, wsOk, latencyMs, error };
  }

  /** Generate a human-readable report from results. */
  report(results: ConnectionResult[]): string {
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

  /**
   * Attempt WebSocket connection with a ping frame.
   * Returns true if server responds within timeout.
   */
  private testWebSocket(wsUrl: string): Promise<boolean> {
    return new Promise((resolve) => {
      let settled = false;
      const settle = (val: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try { ws.close(); } catch { /* already closed */ }
        resolve(val);
      };
      const timer = setTimeout(() => settle(false), this.config.timeoutMs);
      let ws: WebSocket;
      try {
        ws = new WebSocket(wsUrl);
      } catch {
        settle(false);
        return;
      }
      ws.onopen = () => { ws.send('ping'); };
      ws.onmessage = () => { settle(true); };
      ws.onerror = () => { settle(false); };
      ws.onclose = () => { settle(false); };
    });
  }
}

/** Convenience — test default exchanges and return report string. */
export async function runDefaultExchangeTest(timeoutMs = 10_000): Promise<string> {
  const tester = new ExchangeConnectionTester({ timeoutMs });
  const results = await tester.testAll();
  return tester.report(results);
}
