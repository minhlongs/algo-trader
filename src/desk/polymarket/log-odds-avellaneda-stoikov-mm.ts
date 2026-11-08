/**
 * Log-Odds Adaptive Binary Avellaneda-Stoikov Market Maker (CLOB V2, `POLY-ALPHA-HUNTER-V4` §3.3, Strategy 3)
 *
 * Runs the A-S inventory model on the log-odds coordinate L_t = ln(p_t / (1 - p_t))
 * so reservation price and half-spread can never leave the probability bounds (0, 1),
 * then maps quotes back through the logistic sigmoid snapped to the tick grid:
 *
 *   r_t     = L_t - q_t * gamma * sigma_L^2 * tau_t + kappa * OFI^(5)_t
 *   delta_t = (1/gamma) * ln(1 + gamma/k) + (1/2) * gamma * sigma_L^2 * tau_t + eta * VPIN_t
 *   p_bid   = sigma(r_t - delta_t),   p_ask = sigma(r_t + delta_t)
 */

export type TickGridMicro = 10_000 | 5_000 | 2_500 | 1_000;

export interface LogOddsAsConfig {
  tickSizeMicro: TickGridMicro;
  riskAversionGamma: number;
  orderArrivalIntensityK: number;
  liquidityAdjKappa: number;
  vpinWideningEta: number;
  inventoryHorizonTau: number;
  maxPositionShares: number;
}

export interface LogOddsAsQuoteInput {
  midProbability: number;
  yangZhangVarianceDaily: number;
  inventoryShares: number;
  ofiNormalized: number;
  currentVpin: number;
}

export interface LogOddsAsQuotePair {
  bidProbability: number;
  askProbability: number;
  bidPriceMicro: number;
  askPriceMicro: number;
  halfSpreadProbability: number;
  reservationLogOdds: number;
  optimalHalfSpreadLogOdds: number;
  inventorySkewLogOdds: number;
}

export const DEFAULT_LOG_ODDS_AS_CONFIG: LogOddsAsConfig = {
  tickSizeMicro: 1_000,
  riskAversionGamma: 0.6,
  orderArrivalIntensityK: 15.0,
  liquidityAdjKappa: 0.25,
  vpinWideningEta: 0.35,
  inventoryHorizonTau: 1.0 / 24.0,
  maxPositionShares: 500,
};

function clampProbability(p: number): number {
  return Math.min(1 - 1e-9, Math.max(1e-9, p));
}

export function probabilityToLogOdds(p: number): number {
  const cp = clampProbability(p);
  return Math.log(cp / (1 - cp));
}

export function logOddsToProbability(logOdds: number): number {
  return 1 / (1 + Math.exp(-logOdds));
}

export class LogOddsAvellanedaStoikovMarketMaker {
  private readonly cfg: LogOddsAsConfig;

  constructor(config: Partial<LogOddsAsConfig> = {}) {
    this.cfg = { ...DEFAULT_LOG_ODDS_AS_CONFIG, ...config };
  }

  quotePair(input: LogOddsAsQuoteInput): LogOddsAsQuotePair {
    const midLogOdds = probabilityToLogOdds(input.midProbability);
    const sigmaSquared = Math.max(input.yangZhangVarianceDaily, 1e-12);
    const normalizedInventory = input.inventoryShares / Math.max(1, this.cfg.maxPositionShares);
    const inventorySkewLogOdds =
      normalizedInventory * this.cfg.riskAversionGamma * sigmaSquared * this.cfg.inventoryHorizonTau;

    const reservationLogOdds =
      midLogOdds - inventorySkewLogOdds + this.cfg.liquidityAdjKappa * input.ofiNormalized;

    const logTerm = Math.log(
      1 + this.cfg.riskAversionGamma / Math.max(this.cfg.orderArrivalIntensityK, 1e-9),
    );
    const optimalHalfSpreadLogOdds =
      (1 / this.cfg.riskAversionGamma) * logTerm
      + 0.5 * this.cfg.riskAversionGamma * sigmaSquared * this.cfg.inventoryHorizonTau
      + this.cfg.vpinWideningEta * Math.max(0, input.currentVpin);

    const rawBidProb = logOddsToProbability(reservationLogOdds - optimalHalfSpreadLogOdds);
    const rawAskProb = logOddsToProbability(reservationLogOdds + optimalHalfSpreadLogOdds);

    const grid = this.cfg.tickSizeMicro;
    const rawBidMicro = Math.floor((rawBidProb * 1_000_000) / grid) * grid;
    const rawAskMicro = Math.ceil((rawAskProb * 1_000_000) / grid) * grid;

    const bidPriceMicro = Math.min(980_000 - grid, Math.max(20_000, rawBidMicro));
    const askPriceMicro = Math.min(980_000, Math.max(bidPriceMicro + grid, rawAskMicro));

    const bidProbability = bidPriceMicro / 1_000_000;
    const askProbability = askPriceMicro / 1_000_000;
    const halfSpreadProbability = (askProbability - bidProbability) / 2;

    return {
      bidProbability,
      askProbability,
      bidPriceMicro,
      askPriceMicro,
      halfSpreadProbability,
      reservationLogOdds,
      optimalHalfSpreadLogOdds,
      inventorySkewLogOdds,
    };
  }
}

/**
 * Conservative Maker queue simulator (`BT-TRAP-01`).
 * Only `queueProgressRatio` (default 20%) of newly observed maker cancellations at our
 * price level is credited as advancing our queue position (`Q_ahead`).
 */
export function advanceConservativeMakerQueue(
  currentQueueAheadShares: number,
  tradeExecutedSharesAtLevel: number,
  batchCanceledSharesAtLevel: number,
  queueProgressRatio = 0.20,
): { remainingQueueAheadShares: number; filledShares: number; queueClearedForOurFill: boolean } {
  const queueAhead = Math.max(0, currentQueueAheadShares);
  const tradeShares = Math.max(0, tradeExecutedSharesAtLevel);
  const cancelAdvance = Math.max(0, batchCanceledSharesAtLevel) * Math.max(0, Math.min(1, queueProgressRatio));
  const afterCancelAhead = Math.max(0, queueAhead - cancelAdvance);
  const remainingQueueAheadShares = Math.max(0, afterCancelAhead - tradeShares);
  const filledShares = Math.max(0, tradeShares - afterCancelAhead);
  return {
    remainingQueueAheadShares,
    filledShares,
    queueClearedForOurFill: remainingQueueAheadShares === 0 && (tradeShares > 0 || cancelAdvance > 0),
  };
}
