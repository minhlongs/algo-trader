/**
 * Dynamic Cross-Chain Bridge Fee & Gas Estimator
 * Models L1 calldata security fees, relayer profit margins, and destination execution overhead.
 *
 * @module desk/interop/dynamic-bridge-fee-estimator
 */

import { BridgeFeeEstimate, SupportedChain } from './interop-types';

export class DynamicBridgeFeeEstimator {
  private readonly l1BaseFeeUsd: number;
  private readonly destinationGasCostMap: Record<SupportedChain, number>;

  public constructor(l1BaseFeeUsd = 1.25) {
    this.l1BaseFeeUsd = l1BaseFeeUsd;
    this.destinationGasCostMap = {
      ethereum: 15.0,
      arbitrum: 0.15,
      optimism: 0.18,
      base: 0.12,
      polygon: 0.08,
      solana: 0.01,
    };
  }

  public estimateFee(
    source: SupportedChain,
    target: SupportedChain,
    transferVolumeUsd: number
  ): BridgeFeeEstimate {
    const routeId = `${source}->${target}`;
    const destinationGas = this.destinationGasCostMap[target] ?? 0.5;

    // Relayer fee: 5 bps of transferred volume or min $0.25
    const variableRelayerFee = Math.max(0.25, (transferVolumeUsd * 5) / 10000);
    const l1SecurityFee = (source === 'ethereum' || target === 'ethereum') ? this.l1BaseFeeUsd : 0.05;

    const totalFee = Number((l1SecurityFee + variableRelayerFee + destinationGas).toFixed(3));
    const estimatedFinality = this.getEstimatedFinalitySeconds(source, target);

    return {
      routeId,
      baseL1FeeUsd: l1SecurityFee,
      variableRelayerFeeUsd: Number(variableRelayerFee.toFixed(3)),
      destinationGasOverheadUsd: destinationGas,
      totalFeeUsd: totalFee,
      estimatedFinalitySeconds: estimatedFinality,
    };
  }

  private getEstimatedFinalitySeconds(source: SupportedChain, target: SupportedChain): number {
    if (source === 'ethereum' || target === 'ethereum') return 60;
    if (source === 'solana' || target === 'solana') return 5;
    return 15;
  }
}
