export interface VpinVolumeBucket {
  readonly buyVolume: number;
  readonly sellVolume: number;
}

export interface EasleyLopezDePrado2012Input {
  readonly bucketVolumeSize: number;
  readonly buckets: readonly VpinVolumeBucket[];
  readonly historicalVpinMean: number;
  readonly historicalVpinStd: number;
}

export interface EasleyLopezDePrado2012Output {
  readonly vpinMetric: number;
  readonly vpinCdfScore: number;
  readonly averageAbsOrderImbalance: number;
  readonly liquidityWithdrawalAction: 'NORMAL_QUOTING' | 'WIDEN_SPREADS_2X' | 'HALT_LIQUIDITY_PROVISION';
}
