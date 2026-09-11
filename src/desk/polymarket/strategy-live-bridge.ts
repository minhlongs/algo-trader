/**
 * Strategy-to-Live Bridge
 *
 * Wires strategy trade signals to the LiveTradingOrchestrator for real CLOB
 * execution. Catches signals from any strategy, runs through the guard, and
 * places orders on Polymarket.
 *
 * Also provides a built-in endgame scanner that uses Gamma API to find
 * high-probability near-resolution markets — no complex strategy framework needed.
 */

import type { LiveTradingOrchestrator } from './live-trading-orchestrator';
import { logger } from '../../shared/utils/logger';
import {
  type TradeSignal,
  type SignalResult,
  type ScannerConfig,
  DEFAULT_SCANNER_CONFIG,
} from './strategy-live-bridge-types';
import { scanGammaEndgameMarkets } from './strategy-live-bridge-scanner';

export * from './strategy-live-bridge-types';

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
        const outcome = await scanGammaEndgameMarkets(cfg);
        if (outcome && outcome.signals.length > 0) {
          logger.info(`Scanner found ${outcome.signals.length} endgame signals`, 'StrategyLiveBridge', {
            scanNumber: this.scanCount,
            totalMarkets: outcome.totalMarkets,
          });
          await this.onSignals(outcome.signals);
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
    const confidence = signal.confidence ?? 0.5;
    return signal.size > 0 ? signal.size : 10 * confidence;
  }
}
