import {
  RoutingRequest,
  RoutingPlan,
  ExecutionProgress,
  SliceExecutionRecord,
} from './sor-types';
import { logger } from '../../shared/utils/logger';

export interface IcebergExecutionParams {
  request: RoutingRequest;
  displayChunkRatio?: number;
  varianceRatio?: number;
  minDelayMs?: number;
  maxDelayMs?: number;
  routeSlice: (sliceRequest: RoutingRequest) => Promise<RoutingPlan>;
  abortSignal?: AbortSignal;
  onProgress?: (progress: ExecutionProgress) => void;
}

export class IcebergExecutor {
  public sliceOrder(
    totalQty: number,
    displayChunkRatio = 0.20,
    varianceRatio = 0.20
  ): { visible: number; hidden: number }[] {
    const chunks: { visible: number; hidden: number }[] = [];
    let remaining = totalQty;
    const baseChunk = totalQty * displayChunkRatio;

    let step = 0;
    while (remaining > 0) {
      step++;
      // Pseudo-random variance between (1 - varianceRatio) and (1 + varianceRatio)
      const pseudoRand = ((step * 37 + 19) % 100) / 100;
      const factor = 1 + (pseudoRand * 2 - 1) * varianceRatio;
      const nominal = baseChunk * factor;
      const visible = Number(Math.min(remaining, Math.max(1e-4, nominal)).toFixed(6));
      remaining = Number(Math.max(0, remaining - visible).toFixed(6));
      chunks.push({ visible, hidden: remaining });
    }
    return chunks;
  }

  public getRandomDelay(minMs = 50, maxMs = 250): number {
    return Math.floor(minMs + Math.random() * (maxMs - minMs));
  }

  public async executeIceberg(params: IcebergExecutionParams): Promise<ExecutionProgress> {
    const { request, routeSlice, abortSignal, onProgress } = params;
    const displayRatio = params.displayChunkRatio ?? 0.20;
    const variance = params.varianceRatio ?? 0.20;
    const minDelay = params.minDelayMs ?? 50;
    const maxDelay = params.maxDelayMs ?? 250;

    const plannedChunks = this.sliceOrder(request.targetQuantity, displayRatio, variance);
    const progress: ExecutionProgress = {
      orderId: `iceberg-${Date.now()}`,
      strategy: 'ICEBERG',
      totalQuantity: request.targetQuantity,
      filledQuantity: 0,
      remainingQuantity: request.targetQuantity,
      completedSlices: 0,
      totalSlices: plannedChunks.length,
      averagePrice: 0,
      totalFeesUsd: 0,
      totalGasUsd: 0,
      status: 'RUNNING',
      slices: [],
    };

    let totalGrossUsd = 0;
    let step = 0;

    while (progress.remainingQuantity > 0) {
      if (abortSignal?.aborted) {
        progress.status = 'CANCELLED';
        logger.info('Iceberg execution cancelled by abort signal', 'IcebergExecutor', { orderId: progress.orderId });
        break;
      }

      const nominal = request.targetQuantity * displayRatio;
      const factor = 1 + (((step * 31 + 17) % 100) / 100 * 2 - 1) * variance;
      const visibleQty = Number(Math.min(progress.remainingQuantity, Math.max(1e-4, nominal * factor)).toFixed(6));

      try {
        const sliceReq: RoutingRequest = {
          ...request,
          targetQuantity: visibleQty,
        };
        const plan = await routeSlice(sliceReq);
        const fillGross = plan.totalQuantity * plan.expectedEffectivePrice;
        totalGrossUsd += fillGross;
        progress.filledQuantity += plan.totalQuantity;
        progress.remainingQuantity = Math.max(0, Number((progress.totalQuantity - progress.filledQuantity).toFixed(6)));
        progress.completedSlices++;
        progress.totalFeesUsd += plan.expectedTotalFeeUsd;
        progress.totalGasUsd += plan.expectedGasCostUsd;
        progress.averagePrice = progress.filledQuantity > 0 ? totalGrossUsd / progress.filledQuantity : 0;

        const record: SliceExecutionRecord = {
          sliceIndex: step,
          quantity: plan.totalQuantity,
          price: plan.expectedEffectivePrice,
          feeUsd: plan.expectedTotalFeeUsd,
          gasUsd: plan.expectedGasCostUsd,
          timestamp: Date.now(),
        };
        progress.slices.push(record);
        onProgress?.(progress);
        step++;

        if (progress.remainingQuantity > 0) {
          const delayMs = this.getRandomDelay(minDelay, maxDelay);
          await new Promise(res => setTimeout(res, delayMs));
        }
      } catch (err) {
        progress.status = 'FAILED';
        logger.warn('Iceberg slice fill error', 'IcebergExecutor', { error: String(err), step });
        break;
      }
    }

    if (progress.status === 'RUNNING') {
      progress.status = 'COMPLETED';
    }
    return progress;
  }
}
