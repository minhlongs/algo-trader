import {
  RoutingRequest,
  RoutingPlan,
  ExecutionProgress,
  SliceExecutionRecord,
} from './sor-types';
import { logger } from '../../shared/utils/logger';

export interface VwapExecutionParams {
  request: RoutingRequest;
  volumeProfile?: readonly number[];
  intervalMs?: number;
  kappa?: number;
  routeSlice: (sliceRequest: RoutingRequest) => Promise<RoutingPlan>;
  getMarketVolume?: (sliceIndex: number) => { actual: number; expected: number };
  abortSignal?: AbortSignal;
  onProgress?: (progress: ExecutionProgress) => void;
}

export class VwapExecutor {
  public static readonly DEFAULT_PROFILE: readonly number[] = [
    0.25, 0.15, 0.10, 0.10, 0.15, 0.25,
  ];

  public sliceOrder(totalQty: number, volumeProfile: readonly number[] = VwapExecutor.DEFAULT_PROFILE): number[] {
    if (totalQty <= 0 || volumeProfile.length === 0) return [];
    const totalWeight = volumeProfile.reduce((a, b) => a + b, 0);
    if (totalWeight <= 0) return [totalQty];

    let allocated = 0;
    const slices: number[] = [];
    for (let i = 0; i < volumeProfile.length - 1; i++) {
      const slice = Number(((volumeProfile[i] / totalWeight) * totalQty).toFixed(6));
      slices.push(slice);
      allocated += slice;
    }
    const finalSlice = Number((totalQty - allocated).toFixed(6));
    slices.push(Math.max(0, finalSlice));
    return slices;
  }

  public adaptSlice(
    targetSlice: number,
    actualMarketVolume: number,
    expectedMarketVolume: number,
    kappa = 0.3
  ): number {
    if (expectedMarketVolume <= 0 || actualMarketVolume <= 0) return targetSlice;
    const volumeRatio = actualMarketVolume / expectedMarketVolume;
    const factor = 1 + kappa * (volumeRatio - 1);
    // Bound adaptation factor between 0.5x and 2.0x
    const boundedFactor = Math.max(0.5, Math.min(2.0, factor));
    return Number((targetSlice * boundedFactor).toFixed(6));
  }

  public async executeVwap(params: VwapExecutionParams): Promise<ExecutionProgress> {
    const { request, routeSlice, getMarketVolume, abortSignal, onProgress } = params;
    const profile = params.volumeProfile ?? VwapExecutor.DEFAULT_PROFILE;
    const intervalMs = params.intervalMs ?? 50;
    const kappa = params.kappa ?? 0.3;

    const baseSlices = this.sliceOrder(request.targetQuantity, profile);
    const progress: ExecutionProgress = {
      orderId: `vwap-${Date.now()}`,
      strategy: 'VWAP',
      totalQuantity: request.targetQuantity,
      filledQuantity: 0,
      remainingQuantity: request.targetQuantity,
      completedSlices: 0,
      totalSlices: baseSlices.length,
      averagePrice: 0,
      totalFeesUsd: 0,
      totalGasUsd: 0,
      status: 'RUNNING',
      slices: [],
    };

    let totalGrossUsd = 0;

    for (let i = 0; i < baseSlices.length; i++) {
      if (abortSignal?.aborted) {
        progress.status = 'CANCELLED';
        logger.info('VWAP execution cancelled by abort signal', 'VwapExecutor', { orderId: progress.orderId });
        break;
      }

      let targetQty = baseSlices[i];
      if (getMarketVolume) {
        const { actual, expected } = getMarketVolume(i);
        targetQty = this.adaptSlice(targetQty, actual, expected, kappa);
      }
      // On final slice, fill whatever is remaining to guarantee zero residual
      if (i === baseSlices.length - 1) {
        targetQty = progress.remainingQuantity;
      }
      targetQty = Math.min(progress.remainingQuantity, Math.max(1e-6, targetQty));

      try {
        const sliceReq: RoutingRequest = {
          ...request,
          targetQuantity: targetQty,
        };
        const plan = await routeSlice(sliceReq);
        const fillGross = plan.totalQuantity * plan.expectedEffectivePrice;
        totalGrossUsd += fillGross;
        progress.filledQuantity += plan.totalQuantity;
        progress.remainingQuantity = Math.max(0, progress.totalQuantity - progress.filledQuantity);
        progress.completedSlices++;
        progress.totalFeesUsd += plan.expectedTotalFeeUsd;
        progress.totalGasUsd += plan.expectedGasCostUsd;
        progress.averagePrice = progress.filledQuantity > 0 ? totalGrossUsd / progress.filledQuantity : 0;

        const record: SliceExecutionRecord = {
          sliceIndex: i,
          quantity: plan.totalQuantity,
          price: plan.expectedEffectivePrice,
          feeUsd: plan.expectedTotalFeeUsd,
          gasUsd: plan.expectedGasCostUsd,
          timestamp: Date.now(),
        };
        progress.slices.push(record);
        onProgress?.(progress);

        if (i < baseSlices.length - 1 && intervalMs > 0) {
          await new Promise(res => setTimeout(res, intervalMs));
        }
      } catch (err) {
        progress.status = 'FAILED';
        logger.warn('Slice execution failed in VWAP', 'VwapExecutor', { error: String(err), sliceIndex: i });
        break;
      }
    }

    if (progress.status === 'RUNNING') {
      progress.status = 'COMPLETED';
    }
    return progress;
  }
}
