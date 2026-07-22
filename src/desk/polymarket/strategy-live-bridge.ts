/**
 * Strategy-to-Live Bridge
 *
 * Wires strategy trade signals to the LiveTradingOrchestrator for real CLOB
 * execution. Catches signals from any strategy, runs through the guard, and
 * places orders on Polymarket.
 *
 * Also provides a built-in endgame scanner that uses Gamma API to find
 * high-probability near-resolution markets — no complex strategy framework needed.
 *
 * Usage:
 *   const bridge = new StrategyLiveBridge(orchestrator);
 *   bridge.onSignal({ tokenId, side, size, price, ... });
 *   // or
 *   bridge.startEndgameScanner({ capitalUsdc: 1000, scanIntervalMs: 30_000 });
 */

import type { LiveTradingOrchestrator } from './live-trading-orchestrator';
import type { PolymarketOrderResponse } from '../execution/polymarket-adapter';
import { logger } from '../../shared/utils/logger';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface TradeSignal {
  tokenId: string;
  side: 'BUY' | 'SELL';
  size: number;
  price: number;
  /** Market/question description for logging */
  description?: string;
  /** Signal confidence (0-1), used for position sizing */
  confidence?: number;
  /** Signal generation timestamp (ms since epoch). Used for TTL validation. */
  timestamp: number;
}

export interface SignalResult {
  signal: TradeSignal;
  response: PolymarketOrderResponse | null;
  error: string | null;
  /** Whether the guard rejected this signal */
  rejected: boolean;
  rejectReason?: string;
}

export interface ScannerConfig {
  /** Capital in USDC for position sizing */
  capitalUsdc: number;
  /** Scan interval in milliseconds */
  scanIntervalMs: number;
  /** Minimum market volume to consider */
  minVolume: number;
  /** Max number of signals per scan cycle */
  maxSignalsPerScan: number;
  /** Price certainty threshold for endgame markets (>this or <1-this) */
  priceThreshold: number;
}

const DEFAULT_SCANNER_CONFIG: ScannerConfig = {
  capitalUsdc: 1000,
  scanIntervalMs: 30_000,
  minVolume: 10_000,
  maxSignalsPerScan: 3,
  priceThreshold: 0.95,
};

// ── Bridge ─────────────────────────────────────────────────────────────────────

export class StrategyLiveBridge {
  private orchestrator: LiveTradingOrchestrator;
  private scanTimer: NodeJS.Timeout | null = null;
  private isScanning = false;
  private scanCount = 0;
  private signalsProcessed = 0;
  private signalsRejected = 0;

  constructor(orchestrator: LiveTradingOrchestrator) {
    this.orchestrator = orchestrator;
  }

  // ── Direct signal routing ──────────────────────────────────────────────────

  /** Route a single trade signal through guard → order placement */
  async onSignal(signal: TradeSignal): Promise<SignalResult> {
    this.signalsProcessed++;

    try {
      const response = await this.orchestrator.placeOrder({
        tokenId: signal.tokenId,
        price: signal.price,
        size: this.computeSize(signal),
        side: signal.side,
        expiration: Math.floor(Date.now() / 1000) + 300, // 5 min GTC
        nonce: String(Date.now()),
        feeRateBps: 0,
        signatureType: 0,
      });

      logger.info('Signal executed', 'StrategyLiveBridge', {
        tokenId: signal.tokenId.slice(0, 12),
        side: signal.side,
        price: signal.price,
        description: signal.description?.slice(0, 50),
        orderId: response.orderID,
      });

      return { signal, response, error: null, rejected: false };
    } catch (err) {
      const msg = String(err);

      if (msg.includes('Guard rejected')) {
        this.signalsRejected++;
        logger.warn('Signal rejected by guard', 'StrategyLiveBridge', {
          reason: msg,
          tokenId: signal.tokenId.slice(0, 12),
        });
        return { signal, response: null, error: msg, rejected: true, rejectReason: msg };
      }

      logger.error('Signal execution failed', 'StrategyLiveBridge', { err: msg });
      return { signal, response: null, error: msg, rejected: false };
    }
  }

  /** Route multiple signals in parallel */
  async onSignals(signals: TradeSignal[]): Promise<SignalResult[]> {
    return Promise.all(signals.map((s) => this.onSignal(s)));
  }

  // ── Built-in endgame scanner ───────────────────────────────────────────────

  /**
   * Start scanning Gamma API for endgame markets and route them through the
   * orchestrator automatically. Uses the same logic as `cashclaw scan`.
   */
  startEndgameScanner(config?: Partial<ScannerConfig>): void {
    const cfg = { ...DEFAULT_SCANNER_CONFIG, ...config };
    logger.info('Endgame scanner started', 'StrategyLiveBridge', {
      interval: cfg.scanIntervalMs,
      minVolume: cfg.minVolume,
      threshold: cfg.priceThreshold,
    });

    const scan = async () => {
      if (this.isScanning) return;
      this.isScanning = true;
      this.scanCount++;

      try {
        const resp = await fetch(
          'https://gamma-api.polymarket.com/markets?closed=false&limit=200',
          { signal: AbortSignal.timeout(15_000) },
        );

        if (!resp.ok) {
          logger.warn(`Gamma API error ${resp.status}`, 'StrategyLiveBridge');
          return;
        }

        const markets = (await resp.json()) as Array<Record<string, unknown>>;
        const signals: TradeSignal[] = [];

        for (const m of markets) {
          if (signals.length >= cfg.maxSignalsPerScan) break;

          try {
            const prices = JSON.parse((m['outcomePrices'] as string) ?? '[]') as string[];
            const yes = parseFloat(prices[0] ?? '0');
            const vol = Number(m['volume'] ?? 0);
            const tokens = m['clobTokenIds'] as string | undefined;
            const yesTokenId = tokens ? JSON.parse(tokens)[0] : undefined;

            if (!yesTokenId || vol < cfg.minVolume) continue;

            const isEndgame = yes > cfg.priceThreshold || yes < (1 - cfg.priceThreshold);
            if (!isEndgame) continue;

            const side = yes > cfg.priceThreshold ? 'BUY' : 'SELL';
            const edge = side === 'BUY'
              ? 1 - yes - 0.02  // BUY YES at discount to $1
              : yes - 0.02;     // BUY NO at discount to $0

            if (edge <= 0.01) continue; // minimum 1% edge

            signals.push({
              tokenId: yesTokenId,
              side: side === 'BUY' ? 'SELL' : 'BUY', // BUY the cheaper side
              size: (cfg.capitalUsdc * 0.02) / yes,   // 2% capital position
              price: yes, // Always use YES price since scanner always trades YES token
              description: String(m['question'] ?? '').slice(0, 60),
              confidence: Math.abs(edge) * 100,
              timestamp: Date.now(),
            });
          } catch { /* skip malformed entry */ }
        }

        if (signals.length > 0) {
          logger.info(`Scanner found ${signals.length} endgame signals`, 'StrategyLiveBridge', {
            scanNumber: this.scanCount,
            totalMarkets: markets.length,
          });
          await this.onSignals(signals);
        }
      } catch (err) {
        logger.error('Scanner cycle failed', 'StrategyLiveBridge', { err: String(err) });
      } finally {
        this.isScanning = false;
      }
    };

    // Run immediately then on interval
    scan();
    this.scanTimer = setInterval(scan, cfg.scanIntervalMs);
    this.scanTimer.unref();
  }

  /** Stop the endgame scanner */
  stopScanner(): void {
    if (this.scanTimer) {
      clearInterval(this.scanTimer);
      this.scanTimer = null;
    }
    logger.info('Endgame scanner stopped', 'StrategyLiveBridge', {
      scansCompleted: this.scanCount,
      signalsProcessed: this.signalsProcessed,
      signalsRejected: this.signalsRejected,
    });
  }

  // ── Stats ──────────────────────────────────────────────────────────────────

  getStats() {
    return {
      scansCompleted: this.scanCount,
      signalsProcessed: this.signalsProcessed,
      signalsRejected: this.signalsRejected,
      isScanning: this.isScanning,
      scannerActive: this.scanTimer !== null,
    };
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private computeSize(signal: TradeSignal): number {
    // Use confidence to scale position size
    const confidence = signal.confidence ?? 0.5;
    // Base: 2% of capital at $1 price, scaled by confidence
    return signal.size > 0 ? signal.size : (10 * confidence);
  }
}
