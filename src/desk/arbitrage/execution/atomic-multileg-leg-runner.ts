/**
* Single-leg and concurrent/staged order execution helpers for Multi-Leg Coordinator.
*
* @module desk/arbitrage/execution/atomic-multileg-leg-runner
*/

import type { IExchangeConnector } from '../connectors/types';
import type {
  MultiLegExecutionPlan,
  LegExecutionRecord,
  LegOrderSpec,
} from './atomic-multileg-types';

export async function executeSingleLeg(
  leg: LegOrderSpec,
  connectorResolver: (venue: string) => IExchangeConnector | undefined,
): Promise<LegExecutionRecord> {
  const connector = connectorResolver(leg.venue);
  const start = Date.now();
  if (!connector) {
    return {
      legId: leg.legId,
      venue: leg.venue,
      symbol: leg.symbol,
      side: leg.side,
      requestedAmount: leg.amount,
      filledAmount: 0,
      price: leg.price,
      status: 'failed',
      latencyMs: 0,
      error: `No connector found for venue ${leg.venue}`,
    };
  }

  const timeout = leg.timeoutMs ?? 500;
  try {
    const orderPromise = connector.placeOrder({
      symbol: leg.symbol,
      side: leg.side,
      type: leg.type,
      amount: leg.amount,
      price: leg.price,
      clientOrderId: `${leg.legId}-${Date.now()}`,
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Leg ${leg.legId} timed out after ${timeout}ms`)), timeout),
    );

    const res = await Promise.race([orderPromise, timeoutPromise]);
    const isFilled = res.status === 'closed' || res.filled >= leg.amount;

    return {
      legId: leg.legId,
      orderId: res.orderId,
      clientOrderId: res.clientOrderId,
      venue: leg.venue,
      symbol: leg.symbol,
      side: leg.side,
      requestedAmount: leg.amount,
      filledAmount: res.filled,
      price: res.price,
      avgFillPrice: res.price,
      status: isFilled ? 'filled' : res.filled > 0 ? 'partial' : 'failed',
      fee: res.fee,
      latencyMs: Date.now() - start,
    };
  } catch (err) {
    return {
      legId: leg.legId,
      venue: leg.venue,
      symbol: leg.symbol,
      side: leg.side,
      requestedAmount: leg.amount,
      filledAmount: 0,
      price: leg.price,
      status: 'failed',
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function executeConcurrentLegs(
  plan: MultiLegExecutionPlan,
  outRecords: LegExecutionRecord[],
  connectorResolver: (venue: string) => IExchangeConnector | undefined,
): Promise<void> {
  const promises = plan.legs.map((leg) => executeSingleLeg(leg, connectorResolver));
  const settled = await Promise.allSettled(promises);

  for (let i = 0; i < settled.length; i++) {
    const res = settled[i];
    if (res.status === 'fulfilled') {
      outRecords.push(res.value);
    } else {
      const leg = plan.legs[i];
      outRecords.push({
        legId: leg.legId,
        venue: leg.venue,
        symbol: leg.symbol,
        side: leg.side,
        requestedAmount: leg.amount,
        filledAmount: 0,
        price: leg.price,
        status: 'failed',
        latencyMs: 0,
        error: res.reason instanceof Error ? res.reason.message : String(res.reason),
      });
    }
  }
}

export async function executeStagedLegs(
  plan: MultiLegExecutionPlan,
  outRecords: LegExecutionRecord[],
  connectorResolver: (venue: string) => IExchangeConnector | undefined,
): Promise<void> {
  for (const leg of plan.legs) {
    const record = await executeSingleLeg(leg, connectorResolver);
    outRecords.push(record);
    if (record.status !== 'filled' || record.filledAmount < record.requestedAmount) break;
  }
}
