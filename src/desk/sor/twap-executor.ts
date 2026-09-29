import {
  RoutingRequest,
  RoutingPlan,
  ExecutionProgress,
  SliceExecutionRecord,
} from './sor-types';
import { logger } from '../../shared/utils/logger';

export interface TwapExecutionParams {
  request: RoutingRequest;
  slices?: number;
  intervalMs?: number;
  jitterBps?: number;
  routeSlice: (sliceRequest: RoutingRequest) => Promise<RoutingPlan>;
  getAvailableDepth?: () => number;
  abortSignal?: AbortSignal;
  onProgress?: (progress: ExecutionProgress) => void;
}

export class TwapExecutor {
  /**
   * Generates discrete slices with +/- Gaussian/bounded jitter.
   * Total strictly sums to totalQty with zero drift.
   */
  public sliceOrder(totalQty: number, slices = 5, jitterBps = 1500): number[] {
    if (totalQty <= 0 || slices <= 0) return [];
    if (slices === 1) return [totalQty];

    const base = totalQty / slices;
    const maxJitter = jitterBps / 10000;
    const rawSlices: number[] = [];
    let sumRaw = 0;

    for (let i = 0; i < slices; i++) {
      // Deterministic Box-Muller pseudo-Gaussian variable bounded to [-maxJitter, maxJitter]
      const u1 = Math.max(1e-6, ((i * 17 + 31) % 97) / 97);
      const u2 = ((i * 37 + 13) % 89) / 89;
      const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
      const jitter = Math.max(-maxJitter, Math.min(maxJitter, z0 * (maxJitter * 0.5)));
      const raw = Math.max(1e-6, base * (1 + jitter));
      rawSlices.push(raw);
      sumRaw += raw;
    }

    // Exact normalization to totalQty
    const result: number[] = [];
    let accumulated = 0;
    for (let i = 0; i < slices - 1; i++) {
      const normalized = Number(((rawSlices[i] / sumRaw) * totalQty).toFixed(6));
      result.push(normalized);
      accumulated += normalized;
    }
    const finalSlice = Number((totalQty - accumulated).toFixed(6));
    result.push(Math.max(0, finalSlice));
    return result;
  }

  public async executeTwap(params: TwapExecutionParams): Promise<ExecutionProgress> {
    const { request, routeSlice, getAvailableDepth, abortSignal, onProgress } = params;
    const slicesCount = params.slices ?? 5;
    const intervalMs = params.intervalMs ?? 50;
    const jitterBps = params.jitterBps ?? 1500;

    const sliceSizes = this.sliceOrder(request.targetQuantity, slicesCount, jitterBps);
    const progress: ExecutionProgress = {
      orderId: `twap-${Date.now()}`,
      strategy: 'TWAP',
      totalQuantity: request.targetQuantity,
      filledQuantity: 0,
      remainingQuantity: request.targetQuantity,
      completedSlices: 0,
      totalSlices: sliceSizes.length,
      averagePrice: 0,
      totalFeesUsd: 0,
      totalGasUsd: 0,
      status: 'RUNNING',
      slices: [],
    };

    let totalGrossUsd = 0;

    for (let i = 0; i < sliceSizes.length; i++) {
      if (abortSignal?.aborted) {
        progress.status = 'CANCELLED';
        logger.info('TWAP execution cancelled by abort signal', 'TwapExecutor', { orderId: progress.orderId });
        break;
      }

      let currentSliceQty = sliceSizes[i];
      if (getAvailableDepth) {
        const depth = getAvailableDepth();
        if (depth > 0 && currentSliceQty > depth) {
          currentSliceQty = Math.max(depth * 0.8, 1e-4);
        }
      }

      try {
        const sliceReq: RoutingRequest = {
          ...request,
          targetQuantity: currentSliceQty,
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

        if (i < sliceSizes.length - 1 && intervalMs > 0) {
          await new Promise(res => setTimeout(res, intervalMs));
        }
      } catch (err) {
        progress.status = 'FAILED';
        logger.warn('Slice execution failed in TWAP', 'TwapExecutor', { error: String(err), sliceIndex: i });
        break;
      }
    }

    if (progress.status === 'RUNNING') {
      progress.status = 'COMPLETED';
    }
    return progress;
  }
}
