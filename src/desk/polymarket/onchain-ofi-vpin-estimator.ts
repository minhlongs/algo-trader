/**
 * On-Chain Order Flow Imbalance (OFI) & Volume-Synchronized VPIN Estimator
 * (`POLY-ALPHA-HUNTER-V4` §0.5, §3.5 & Strategy 5/7)
 *
 * Public WebSocket trade-sign inference matches the true `OrderFilled` `aggressor_side`
 * only 59.2% volume-weighted (arXiv:2604.24366). This module decodes ground-truth side
 * directly from the `makerAssetId` field of on-chain CTF `OrderFilled` events and
 * derives 5-level OFI + volume-synchronized VPIN toxicity + 4-state regime.
 */

export type OnchainAggressorSide = 'BUY' | 'SELL';

export interface OnchainOrderFilledEvent {
  tokenId: string;
  /** `0` (`'0'`, `'0x0'`, `0`, `0n`) means Maker pledged USDC -> BUY print */
  makerAssetId: string | bigint | number;
  sharesMicro: number;
  notionalUsdMicro: number;
  blockNumber: number;
  transactionHash: string;
  logIndex: number;
}

export interface OfiBookLevelDelta {
  priceMicro: number;
  bidDeltaMicro: number;
  askDeltaMicro: number;
}

export interface OfiLevelComputation {
  priceMicro: number;
  bidDeltaMicro: number;
  askDeltaMicro: number;
  ofiLevelMicro: number;
  weight: number;
  weightedOfiMicro: number;
}

export interface OfiSnapshotResult {
  levelComputations: OfiLevelComputation[];
  totalOfiLevelsActive: number;
  ofiSignedMicro: number;
  ofiNormalized: number;
}

export interface VolumeBucket {
  bucketVolumeMicro: number;
  bucketBuyVolumeMicro: number;
  cumulativeVolumeMicro: number;
  cumulativeBuyVolumeMicro: number;
  vpin: number;
}

export type MarketRegimeState = 1 | 2 | 3 | 4;

export interface RegimeEstimate {
  state: MarketRegimeState;
  label: string;
  description: string;
  isToxicKillSwitchTriggered: boolean;
}

/**
 * Ground-truth aggressor side from on-chain CTF `OrderFilled` (`PATCH-05`):
 * `makerAssetId === 0` means the Maker provided collateral (`pUSD`/`USDC.e`).
 */
export function decodeOnchainAggressorSide(
  event: Pick<OnchainOrderFilledEvent, 'makerAssetId'>,
): OnchainAggressorSide {
  const raw = event.makerAssetId;
  if (typeof raw === 'number') return raw === 0 ? 'BUY' : 'SELL';
  if (typeof raw === 'bigint') return raw === 0n ? 'BUY' : 'SELL';
  const normalized = raw.trim().toLowerCase().replace(/^0x/, '');
  return normalized === '' || /^0+$/.test(normalized) ? 'BUY' : 'SELL';
}

/** Exponential depth-decay weight w_l = exp(-lambda * l) for level index l >= 0. */
export function ofiDecayWeight(levelIndex: number, lambda = 0.6): number {
  return Math.exp(-lambda * levelIndex);
}

/**
 * 5-level Order Flow Imbalance (`OFI^(5)_t`):
 *   OFI_l = bidDeltaMicro - askDeltaMicro
 *   weightedOfi = sum_{l=0..4} exp(-lambda * l) * OFI_l
 */
export function computeFiveLevelOfiMicro(
  levelDeltas: OfiBookLevelDelta[],
  lambda = 0.6,
): OfiSnapshotResult {
  const capped = levelDeltas.slice(0, 5);
  let weightedMagnitudeSum = 0;

  const levelComputations: OfiLevelComputation[] = capped.map((lvl, idx) => {
    const ofiLevelMicro = lvl.bidDeltaMicro - lvl.askDeltaMicro;
    const weight = ofiDecayWeight(idx, lambda);
    const weightedOfiMicro = ofiLevelMicro * weight;
    weightedMagnitudeSum += (Math.abs(lvl.bidDeltaMicro) + Math.abs(lvl.askDeltaMicro)) * weight;
    return {
      priceMicro: lvl.priceMicro,
      bidDeltaMicro: lvl.bidDeltaMicro,
      askDeltaMicro: lvl.askDeltaMicro,
      ofiLevelMicro,
      weight,
      weightedOfiMicro,
    };
  });

  const ofiSignedMicro = levelComputations.reduce((acc, item) => acc + item.weightedOfiMicro, 0);
  const totalOfiLevelsActive = levelComputations.filter((item) => item.ofiLevelMicro !== 0).length;
  const ofiNormalized =
    weightedMagnitudeSum > 0
      ? Math.max(-1, Math.min(1, ofiSignedMicro / weightedMagnitudeSum))
      : 0;

  return { levelComputations, totalOfiLevelsActive, ofiSignedMicro, ofiNormalized };
}

/** Rolling volume-bucket VPIN estimator synchronized on on-chain notional volume. */
export class VolumeSynchronizedVpinEstimator {
  private bufferVolumeMicro = 0;
  private bufferBuyVolumeMicro = 0;
  readonly completed: VolumeBucket[] = [];

  constructor(
    readonly targetBucketVolumeMicro: number,
    readonly maxCompletedBuckets = 50,
  ) {
    if (targetBucketVolumeMicro <= 0) throw new Error('targetBucketVolumeMicro must be positive');
  }

  addTrade(
    event: Pick<OnchainOrderFilledEvent, 'makerAssetId' | 'sharesMicro' | 'notionalUsdMicro'>,
  ): void {
    const side = decodeOnchainAggressorSide(event);
    let remainingTradeMicro = Math.max(0, event.notionalUsdMicro);

    while (remainingTradeMicro > 0) {
      const neededMicro = this.targetBucketVolumeMicro - this.bufferVolumeMicro;
      const takeMicro = Math.min(remainingTradeMicro, neededMicro);
      this.bufferVolumeMicro += takeMicro;
      if (side === 'BUY') this.bufferBuyVolumeMicro += takeMicro;
      remainingTradeMicro -= takeMicro;

      if (this.bufferVolumeMicro >= this.targetBucketVolumeMicro) {
        this.closeBucket(this.bufferBuyVolumeMicro, this.targetBucketVolumeMicro);
        this.bufferVolumeMicro = 0;
        this.bufferBuyVolumeMicro = 0;
      }
    }
  }

  private closeBucket(buyVolumeMicro: number, volumeMicro: number): void {
    const imbalanceRatio = Math.abs(2 * buyVolumeMicro - volumeMicro) / volumeMicro;
    const prior = this.completed[this.completed.length - 1];
    this.completed.push({
      bucketVolumeMicro: volumeMicro,
      bucketBuyVolumeMicro: buyVolumeMicro,
      cumulativeVolumeMicro: (prior?.cumulativeVolumeMicro ?? 0) + volumeMicro,
      cumulativeBuyVolumeMicro: (prior?.cumulativeBuyVolumeMicro ?? 0) + buyVolumeMicro,
      vpin: Math.max(0, Math.min(1, imbalanceRatio)),
    });
    if (this.completed.length > this.maxCompletedBuckets) this.completed.shift();
  }

  rollingVpin(window = 20): number {
    if (this.completed.length === 0) return 0;
    const size = Math.max(1, Math.min(window, this.completed.length));
    const recent = this.completed.slice(-size);
    return recent.reduce((acc, bucket) => acc + bucket.vpin, 0) / recent.length;
  }
}

export function estimateRegimeFromOfiVpin(
  ofiNormalized: number,
  vpin: number,
  killSwitchThreshold = 0.70,
  midProbability = 0.50,
): RegimeEstimate {
  if (vpin > killSwitchThreshold) {
    return { state: 3, label: 'Jump/Toxic', description: 'VPIN exceeds kill-switch threshold — cancel maker quotes in < 50ms.', isToxicKillSwitchTriggered: true };
  }
  if (midProbability <= 0.08 || midProbability >= 0.92) {
    return { state: 4, label: 'Near-Resolution', description: 'Probability near boundary — enforce strict two-sided quoting or hold.', isToxicKillSwitchTriggered: false };
  }
  if (Math.abs(ofiNormalized) >= 0.65 || vpin >= killSwitchThreshold * 0.75) {
    return { state: 2, label: 'Pre-Catalyst/Elevated', description: 'Directional order-flow pressure — widen spreads and skew reservation price.', isToxicKillSwitchTriggered: false };
  }
  return { state: 1, label: 'Calm/Mean-Reverting', description: 'Balanced order flow — harvest two-sided maker spread and quadratic rewards.', isToxicKillSwitchTriggered: false };
}
