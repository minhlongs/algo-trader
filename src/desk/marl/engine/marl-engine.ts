/**
 * Master MARL Market-Making & Delta-Neutral Liquidity Engine.
 *
 * Orchestrates Avellaneda-Stoikov quoting, adverse selection defense,
 * inventory skew tracking, atomic cross-venue delta hedging, pre-trade risk,
 * Prometheus telemetry, and HMAC hash-chained audit logging.
 *
 * @module desk/marl/engine/marl-engine
 */

import { logger } from '../../../shared/utils/logger';
import { calculateOptimalQuotes } from '../models/avellaneda-stoikov';
import { InventoryDeltaTracker } from '../hedging/inventory-delta-tracker';
import { DeltaNeutralCoordinator } from '../hedging/delta-neutral-coordinator';
import { AdverseSelectionGuard } from '../microstructure/adverse-selection-guard';
import { MarlRiskGuard } from '../risk/marl-risk-guard';
import { MarlMetricsRecorder } from '../telemetry/marl-metrics';
import { MarlAuditLogger } from '../telemetry/marl-audit-logger';
import {
  type MarlEngineConfig,
  type MarlEngineStatus,
  type MarlQuoteOutput,
  MarlEngineConfigSchema,
} from './marl-engine-types';

export class MarlEngine {
  public readonly config: MarlEngineConfig;
  public readonly deltaTracker: InventoryDeltaTracker;
  public readonly deltaCoordinator: DeltaNeutralCoordinator;
  public readonly adverseSelectionGuard: AdverseSelectionGuard;
  public readonly riskGuard: MarlRiskGuard;
  public readonly metrics: MarlMetricsRecorder;
  public readonly auditLogger: MarlAuditLogger;

  private isRunning = false;
  private currentInventory = 0;
  private portfolioCapital = 100_000;
  private currentDailyDrawdown = 0.0;

  constructor(customConfig?: Partial<MarlEngineConfig>) {
    this.config = MarlEngineConfigSchema.parse(customConfig ?? {});
    this.deltaTracker = new InventoryDeltaTracker({
      deltaThreshold: this.config.deltaHedgeConfig.deltaThreshold,
    });
    this.deltaCoordinator = new DeltaNeutralCoordinator(
      this.config.deltaHedgeConfig,
    );
    this.adverseSelectionGuard = new AdverseSelectionGuard(
      this.config.adverseSelectionConfig,
    );
    this.riskGuard = new MarlRiskGuard(this.config.riskConfig);
    this.metrics = new MarlMetricsRecorder();
    this.auditLogger = new MarlAuditLogger(this.config.auditSecret);
  }

  public start(): void {
    this.isRunning = true;
    logger.info('[MarlEngine] Started MARL market-making engine', {
      symbol: this.config.symbol,
    });
  }

  public stop(): void {
    this.isRunning = false;
    logger.info('[MarlEngine] Stopped MARL market-making engine', {
      symbol: this.config.symbol,
    });
  }

  public setPortfolioCapital(capital: number): void {
    this.portfolioCapital = Math.max(0, capital);
  }

  public setDailyDrawdown(drawdown: number): void {
    this.currentDailyDrawdown = Math.max(0, drawdown);
  }

  public generateQuote(
    midPrice: number,
    inventory = this.currentInventory,
    tauSec = 86_400,
    venueLatencyMs = 25,
  ): MarlQuoteOutput | null {
    if (!this.isRunning) return null;

    const toxicity = this.adverseSelectionGuard.evaluate(midPrice);
    if (toxicity.isTripwireActive) {
      this.auditLogger.logAction('marl.tripwire.activated', {
        reason: toxicity.activeReason,
        vpin: toxicity.vpin,
      });
      this.metrics.recordQuote('canceled', 'both', this.config.symbol);
      return null;
    }

    const quoteSize = this.config.asConfig.quoteSize ?? 100;
    const quoteNotionalUsd = quoteSize * midPrice;
    const currentInventoryNotional = Math.abs(inventory * midPrice);

    const riskEval = this.riskGuard.evaluateRisk({
      quoteNotionalUsd,
      portfolioCapital: this.portfolioCapital,
      currentDailyDrawdown: this.currentDailyDrawdown,
      venueLatencyMs,
      currentInventoryNotional,
    });

    if (!riskEval.approved) {
      this.auditLogger.logAction('marl.risk.rejected', {
        reason: riskEval.rejectionReason,
        quoteNotionalUsd,
      });
      this.metrics.recordQuote('rejected', 'both', this.config.symbol);
      return null;
    }

    const multiplier = toxicity.wideningMultiplier;
    const minSpread = (this.config.asConfig.minSpread ?? 0.02) * multiplier;

    const baseQuote = calculateOptimalQuotes({
      midPrice,
      inventory,
      gamma: this.config.asConfig.gamma,
      sigma: this.config.asConfig.sigma,
      timeToHorizon: tauSec,
      kappa: this.config.asConfig.kappa,
      tickSize: this.config.asConfig.tickSize,
      minSpread,
      maxSpread: this.config.asConfig.maxSpread,
    });

    this.auditLogger.logAction('marl.quote.posted', {
      bidPrice: baseQuote.bidPrice,
      askPrice: baseQuote.askPrice,
      spread: baseQuote.totalSpread,
      multiplier,
    });
    this.metrics.recordQuote('posted', 'both', this.config.symbol);

    return {
      reservationPrice: baseQuote.reservationPrice,
      bidPrice: baseQuote.bidPrice,
      askPrice: baseQuote.askPrice,
      bidSpread: baseQuote.bidSpread,
      askSpread: baseQuote.askSpread,
      totalSpread: baseQuote.totalSpread,
      wideningMultiplier: multiplier,
      clamped: baseQuote.clamped,
    };
  }

  public onMakerFill(side: 'buy' | 'sell', amount: number, price: number): void {
    const deltaChange = side === 'buy' ? amount : -amount;
    this.currentInventory += deltaChange;

    this.deltaTracker.updatePosition({
      venue: 'polymarket',
      symbol: this.config.symbol,
      contracts: this.currentInventory,
      unitDelta: 1.0,
      netDelta: this.currentInventory,
      notionalUsd: Math.abs(this.currentInventory * price),
    });

    this.auditLogger.logAction('marl.fill.received', { side, amount, price });
    this.metrics.recordFill(
      side === 'buy' ? 'bid' : 'ask',
      amount,
      price,
      20,
      this.config.symbol,
    );
    this.metrics.recordInventorySkew(
      this.currentInventory,
      Math.abs(this.currentInventory * price),
      this.config.symbol,
    );
  }

  public getStatus(): MarlEngineStatus {
    const snapshot = this.deltaTracker.computeNetDelta();
    return {
      isRunning: this.isRunning,
      symbol: this.config.symbol,
      inventory: this.currentInventory,
      netDelta: snapshot.netDelta,
      portfolioCapital: this.portfolioCapital,
      toxicityTripwireActive: this.adverseSelectionGuard.isTripwireActive(),
      riskHalted: this.riskGuard.isHalted(),
    };
  }
}
