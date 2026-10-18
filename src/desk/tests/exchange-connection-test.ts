/**
 * Exchange Connection Tester — validates exchange API connectivity before live trading.
 * Tests REST endpoints (public ticker) and optional WebSocket ping/pong.
 */
import { logger } from '../../shared/utils/logger';
import {
  type ExchangeEndpoint,
  type ConnectionResult,
  type ExchangeConnectionTesterConfig,
  DEFAULT_EXCHANGES,
  mapSettledConnectionResult,
  formatRestFetchError,
  formatExchangeConnectionReport,
} from './exchange-connection-helpers';

export type { ExchangeEndpoint, ConnectionResult, ExchangeConnectionTesterConfig };
export { DEFAULT_EXCHANGES, formatExchangeConnectionReport };

/**
 * Tests exchange API connectivity (REST + optional WebSocket).
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
    return results.map((r, i) => mapSettledConnectionResult(r, this.config.exchanges[i]));
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
      error = formatRestFetchError(err);
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
    return formatExchangeConnectionReport(results);
  }

  /** Attempt WebSocket connection with a ping frame. */
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
