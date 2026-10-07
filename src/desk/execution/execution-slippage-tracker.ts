import type {
  OrderExecutionRecord,
  SlippageAttribution,
  SlippageGrade,
  VenueQualityBenchmark,
} from './execution-slippage-types';

export class ExecutionSlippageTracker {
  private readonly history: OrderExecutionRecord[] = [];

  public recordExecution(record: OrderExecutionRecord): SlippageAttribution {
    this.history.push(record);
    return this.evaluateOrder(record);
  }

  public evaluateOrder(record: OrderExecutionRecord): SlippageAttribution {
    const { side, arrivalMidPrice, executedAvgPrice, filledQuantity, requestedQuantity, feesPaidUsd } = record;

    let priceDelta = 0;
    if (side === 'BUY') {
      priceDelta = executedAvgPrice - arrivalMidPrice;
    } else {
      priceDelta = arrivalMidPrice - executedAvgPrice;
    }

    const slippageBps = arrivalMidPrice > 0 ? (priceDelta / arrivalMidPrice) * 10000 : 0;
    const slippageCostUsd = priceDelta * filledQuantity;
    const executedNotionalUsd = executedAvgPrice * filledQuantity;
    const feeFrictionBps = executedNotionalUsd > 0 ? (feesPaidUsd / executedNotionalUsd) * 10000 : 0;
    const fillRatioPct = requestedQuantity > 0 ? (filledQuantity / requestedQuantity) * 100 : 0;

    let grade: SlippageGrade = 'POOR';
    if (slippageBps <= 5) {
      grade = 'EXCELLENT';
    } else if (slippageBps <= 15) {
      grade = 'GOOD';
    } else if (slippageBps <= 30) {
      grade = 'FAIR';
    }

    return {
      orderId: record.orderId,
      venue: record.venue,
      slippageBps: Math.round(slippageBps * 100) / 100,
      slippageCostUsd: Math.round(slippageCostUsd * 100) / 100,
      feeFrictionBps: Math.round(feeFrictionBps * 100) / 100,
      fillRatioPct: Math.round(fillRatioPct * 100) / 100,
      grade,
    };
  }

  public getVenueBenchmark(venue: string): VenueQualityBenchmark | null {
    const venueRecords = this.history.filter((r) => r.venue === venue);
    if (venueRecords.length === 0) return null;

    let totalNotional = 0;
    let totalLatency = 0;
    let totalFillRatio = 0;
    let totalSlippageWeighted = 0;

    for (const r of venueRecords) {
      const attribution = this.evaluateOrder(r);
      const notional = r.executedAvgPrice * r.filledQuantity;
      totalNotional += notional;
      totalLatency += r.executionLatencyMs;
      totalFillRatio += attribution.fillRatioPct;
      totalSlippageWeighted += attribution.slippageBps * (notional > 0 ? notional : 1);
    }

    const count = venueRecords.length;
    const avgSlippageBps = totalNotional > 0
      ? totalSlippageWeighted / totalNotional
      : totalSlippageWeighted / count;

    return {
      venue,
      totalOrders: count,
      totalNotionalUsd: Math.round(totalNotional * 100) / 100,
      avgSlippageBps: Math.round(avgSlippageBps * 100) / 100,
      avgLatencyMs: Math.round((totalLatency / count) * 100) / 100,
      avgFillRatioPct: Math.round((totalFillRatio / count) * 100) / 100,
    };
  }
}
