/**
 * Quote calculation and risk evaluation helpers for MarlEngine.
 *
 * @module desk/marl/engine/marl-engine-quoter
 */

import { calculateOptimalQuotes } from '../models/avellaneda-stoikov';
import type { AdverseSelectionGuard } from '../microstructure/adverse-selection-guard';
import type { MarlRiskGuard } from '../risk/marl-risk-guard';
import type { MarlMetricsRecorder } from '../telemetry/marl-metrics';
import type { MarlAuditLogger } from '../telemetry/marl-audit-logger';
import type { MarlEngineConfig, MarlQuoteOutput } from './marl-engine-types';

export interface QuoteContext {
  config: MarlEngineConfig;
  isRunning: boolean;
  adverseSelectionGuard: AdverseSelectionGuard;
  riskGuard: MarlRiskGuard;
  metrics: MarlMetricsRecorder;
  auditLogger: MarlAuditLogger;
  portfolioCapital: number;
  currentDailyDrawdown: number;
}

export function generateMarlQuote(
  ctx: QuoteContext,
  midPrice: number,
  inventory: number,
  tauSec: number,
  venueLatencyMs: number,
): MarlQuoteOutput | null {
  if (!ctx.isRunning) return null;

  const toxicity = ctx.adverseSelectionGuard.evaluate(midPrice);
  if (toxicity.isTripwireActive) {
    ctx.auditLogger.logAction('marl.tripwire.activated', {
      reason: toxicity.activeReason,
      vpin: toxicity.vpin,
    });
    ctx.metrics.recordQuote('canceled', 'both', ctx.config.symbol);
    return null;
  }

  const quoteSize = ctx.config.asConfig.quoteSize ?? 100;
  const quoteNotionalUsd = quoteSize * midPrice;
  const currentInventoryNotional = Math.abs(inventory * midPrice);

  const riskEval = ctx.riskGuard.evaluateRisk({
    quoteNotionalUsd,
    portfolioCapital: ctx.portfolioCapital,
    currentDailyDrawdown: ctx.currentDailyDrawdown,
    venueLatencyMs,
    currentInventoryNotional,
  });

  if (!riskEval.approved) {
    ctx.auditLogger.logAction('marl.risk.rejected', {
      reason: riskEval.rejectionReason,
      quoteNotionalUsd,
    });
    ctx.metrics.recordQuote('rejected', 'both', ctx.config.symbol);
    return null;
  }

  const multiplier = toxicity.wideningMultiplier;
  const minSpread = (ctx.config.asConfig.minSpread ?? 0.02) * multiplier;

  const baseQuote = calculateOptimalQuotes({
    midPrice,
    inventory,
    gamma: ctx.config.asConfig.gamma,
    sigma: ctx.config.asConfig.sigma,
    timeToHorizon: tauSec,
    kappa: ctx.config.asConfig.kappa,
    tickSize: ctx.config.asConfig.tickSize,
    minSpread,
    maxSpread: ctx.config.asConfig.maxSpread,
  });

  ctx.auditLogger.logAction('marl.quote.posted', {
    bidPrice: baseQuote.bidPrice,
    askPrice: baseQuote.askPrice,
    spread: baseQuote.totalSpread,
    multiplier,
  });
  ctx.metrics.recordQuote('posted', 'both', ctx.config.symbol);

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
