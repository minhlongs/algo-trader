export interface TradeTick {
  readonly timestampMs: number;
  readonly price: number;
  readonly volume: number;
}

export interface VolumeBucket {
  readonly bucketIndex: number;
  readonly totalVolume: number;
  readonly buyVolume: number;
  readonly sellVolume: number;
  readonly orderImbalance: number; // |V_B - V_S|
}

export interface VpinCalculationResult {
  readonly vpinScore: number; // in [0, 1]
  readonly completedBucketsCount: number;
  readonly bucketSize: number;
  readonly isToxicFlow: boolean;
  readonly toxicityRegime: 'LOW' | 'NORMAL' | 'ELEVATED' | 'EXTREME';
}
