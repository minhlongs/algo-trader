/**
 * Atomic Multi-Leg Arbitrage Execution Coordinator.
 *
 * Coordinates concurrent and staged/sequential multi-leg orders with millisecond-precision timeouts,
 * pre-trade risk gates (ArbitrageRiskGuard), 6-state execution lifecycle tracking,
 * and automatic compensatory unwinding on partial fills or leg failures.
 *
 * @module desk/arbitrage/atomic-multileg-coordinator
 */

import { logger } from '../../shared/utils/logger';
import type { ArbitrageRiskGuard, MultiLegArbitrageBasket } from './arbitrage-risk-guard';
import {
  type ExecutionState,
  type ExecutionStateTransition,
  type MultiLegArbitrageOrder,
  type LegOrderParams,
  type LegExecutionReport,
  type MultiLegExecutionReport,
  MultiLegArbitrageOrderSchema,
  calculateMultiLegRealizedPnl,
} from './execution-types';
import {
  CompensatoryUnwindHandler,
  type ConnectorResolver,
} from './compensatory-unwind-handler';

export * from './execution-types';
export * from './compensatory-unwind-handler';

export interface CoordinatorOptions {
  /** ArbitrageRiskGuard instance for pre-trade risk gating & exposure tracking */
  riskGuard?: ArbitrageRiskGuard;
  /** CompensatoryUnwindHandler instance */
  unwindHandler?: CompensatoryUnwindHandler;
  /** Default leg timeout in ms if not specified per leg (default: 500ms) */
  defaultTimeoutMs?: number;
}

export class AtomicMultiLegCoordinator {
  private readonly unwindHandler: CompensatoryUnwindHandler;
  private readonly riskGuard?: ArbitrageRiskGuard;
  private readonly defaultTimeoutMs: number;

  constructor(
    private readonly connectorResolver: ConnectorResolver,
    unwindHandlerOrOptions?: CompensatoryUnwindHandler | CoordinatorOptions,
    riskGuard?: ArbitrageRiskGuard,
  ) {
    if (unwindHandlerOrOptions && 'executeUnwind' in unwindHandlerOrOptions) {
      this.unwindHandler = unwindHandlerOrOptions;
      this.riskGuard = riskGuard;
      this.defaultTimeoutMs = 500;
    } else {
      const opts = unwindHandlerOrOptions as CoordinatorOptions | undefined;
      this.unwindHandler =
        opts?.unwindHandler ?? new CompensatoryUnwindHandler(connectorResolver);
      this.riskGuard = opts?.riskGuard ?? riskGuard;
      this.defaultTimeoutMs = opts?.defaultTimeoutMs ?? 500;
    }
  }

  /**
   * Execute a multi-leg arbitrage order with atomic lifecycle guarantees.
   */
  async execute(order: MultiLegArbitrageOrder): Promise<MultiLegExecutionReport> {
    const startTime = Date.now();
    const stateHistory: ExecutionStateTransition[] = [];
    let currentState: ExecutionState = 'PENDING';

    const recordTransition = (to: ExecutionState, reason?: string) => {
      stateHistory.push({
        from: currentState,
        to,
        timestamp: Date.now(),
        reason,
      });
      currentState = to;
    };

    // 0. Validate input order schema
    const parsedOrder = MultiLegArbitrageOrderSchema.parse(order);
    const executionMode = parsedOrder.executionMode ?? 'concurrent';

    logger.info('[AtomicMultiLegCoordinator] Ingested arbitrage order for atomic execution', {
      orderId: parsedOrder.orderId,
      opportunityId: parsedOrder.opportunityId,
      mode: executionMode,
      legsCount: parsedOrder.legs.length,
    });

    // 1. Prepare basket representation for ArbitrageRiskGuard
    const basket: MultiLegArbitrageBasket = {
      basketId: parsedOrder.orderId,
      opportunityId: parsedOrder.opportunityId,
      strategyKey: parsedOrder.strategyKey,
      legs: parsedOrder.legs.map((l) => ({
        legId: l.legId,
        venue: l.venue,
        symbol: l.symbol,
        side: l.side,
        amount: l.amount,
        price: l.price,
        notionalUsd: l.amount * l.price,
      })),
      totalNotionalUsd: parsedOrder.legs.reduce((sum, l) => sum + l.amount * l.price, 0),
    };

    // 2. Pre-Trade Risk Gate Checks
    if (this.riskGuard) {
      const riskCheck = await this.riskGuard.checkBasket(basket);
      if (!riskCheck.allowed) {
        const errorMsg = `Pre-trade risk check failed: ${riskCheck.rejectionReason ?? 'RISK_REJECTED'}`;
        recordTransition('FAILED', errorMsg);
        logger.warn('[AtomicMultiLegCoordinator] Pre-trade risk gate rejected order', {
          orderId: parsedOrder.orderId,
          reason: riskCheck.rejectionReason,
        });

        return {
          executionId: parsedOrder.orderId,
          opportunityId: parsedOrder.opportunityId,
          state: 'FAILED',
          stateHistory,
          legs: [],
          latencyMs: Date.now() - startTime,
          error: errorMsg,
          timestamp: Date.now(),
        };
      }
    }

    // 3. Record Trade Opened in RiskGuard
    if (this.riskGuard) {
      this.riskGuard.recordTradeOpened(basket);
    }

    let legResults: LegExecutionReport[] = [];
    const abortController = new AbortController();

    try {
      recordTransition('SUBMITTED', 'Order dispatched to execution venues');

      if (executionMode === 'sequential') {
        legResults = await this.executeSequential(parsedOrder.legs, abortController.signal);
      } else {
        legResults = await this.executeConcurrent(parsedOrder.legs, abortController.signal);
      }

      // Check fill status across all legs
      const allFilled =
        legResults.length === parsedOrder.legs.length &&
        legResults.every(
          (leg) => leg.status === 'filled' && leg.remainingAmount === 0 && leg.filledAmount >= leg.requestedAmount,
        );

      if (allFilled) {
        recordTransition('FILLED', 'All arbitrage legs filled completely');
        const netRealizedPnlUsd = calculateMultiLegRealizedPnl(legResults);

        logger.info('[AtomicMultiLegCoordinator] Multi-leg order filled completely', {
          orderId: parsedOrder.orderId,
          netRealizedPnlUsd,
          latencyMs: Date.now() - startTime,
        });

        return {
          executionId: parsedOrder.orderId,
          opportunityId: parsedOrder.opportunityId,
          state: 'FILLED',
          stateHistory,
          legs: legResults,
          netRealizedPnlUsd,
          latencyMs: Date.now() - startTime,
          timestamp: Date.now(),
        };
      }

      // Partial fill or leg failure detected -> Trigger compensatory unwinds
      logger.warn('[AtomicMultiLegCoordinator] Order execution failed or partially filled; initiating unwind', {
        orderId: parsedOrder.orderId,
        failedLegs: legResults.filter((l) => l.status !== 'filled').map((l) => l.legId),
      });

      // a. Immediately cancel all pending/open legs
      await this.cancelOpenLegs(legResults);

      // Check if any leg actually filled
      const filledLegs = legResults.filter((l) => l.filledAmount > 0);

      if (filledLegs.length === 0) {
        // Zero exposure was created, no unwind needed
        recordTransition('FAILED', 'All legs failed with zero fills');
        return {
          executionId: parsedOrder.orderId,
          opportunityId: parsedOrder.opportunityId,
          state: 'FAILED',
          stateHistory,
          legs: legResults,
          error: 'All legs failed to fill; no exposure created',
          latencyMs: Date.now() - startTime,
          timestamp: Date.now(),
        };
      }

      // b. Transition state to PARTIAL_UNWINDING
      recordTransition('PARTIAL_UNWINDING', 'Canceling open legs and unwinding filled inventory');

      // c. Call CompensatoryUnwindHandler to unwind filled leg exposure
      const unwindResult = await this.unwindHandler.executeUnwind({
        executionId: parsedOrder.orderId,
        reason: 'Partial fill imbalance compensatory unwind',
        legsToUnwind: filledLegs.map((leg) => ({
          legId: leg.legId,
          venue: leg.venue,
          symbol: leg.symbol,
          side: leg.side,
          filledAmount: leg.filledAmount,
          entryPrice: leg.avgFillPrice ?? leg.price,
          orderId: leg.orderId,
        })),
      });

      // d. Transition to UNWOUND (if zero residual delta) or FAILED (if unhedged delta remains)
      if (unwindResult.success && unwindResult.unhedgedResidualDelta === 0) {
        recordTransition('UNWOUND', 'All filled inventory successfully liquidated/hedged');
      } else {
        recordTransition(
          'FAILED',
          `Unwind incomplete; unhedged delta of ${unwindResult.unhedgedResidualDelta} remains`,
        );
      }

      return {
        executionId: parsedOrder.orderId,
        opportunityId: parsedOrder.opportunityId,
        state: currentState,
        stateHistory,
        legs: legResults,
        unwindResult,
        error: unwindResult.success
          ? undefined
          : `Unwind failed: ${unwindResult.error ?? 'unknown error'} (unhedged delta: ${unwindResult.unhedgedResidualDelta})`,
        latencyMs: Date.now() - startTime,
        timestamp: Date.now(),
      };
    } finally {
      // 4. Record Trade Closed in RiskGuard upon reaching terminal state
      if (this.riskGuard) {
        this.riskGuard.recordTradeClosed(basket);
      }
    }
  }

  // ── Concurrent Execution ───────────────────────────────────────────────────

  private async executeConcurrent(
    legs: LegOrderParams[],
    abortSignal: AbortSignal,
  ): Promise<LegExecutionReport[]> {
    const promises = legs.map((leg) => this.executeSingleLegWithTimeout(leg, abortSignal));
    const settled = await Promise.allSettled(promises);

    const outRecords: LegExecutionReport[] = [];
    for (let i = 0; i < settled.length; i++) {
      const res = settled[i];
      if (res.status === 'fulfilled') {
        outRecords.push(res.value);
      } else {
        const leg = legs[i];
        outRecords.push({
          legId: leg.legId,
          venue: leg.venue,
          symbol: leg.symbol,
          side: leg.side,
          requestedAmount: leg.amount,
          filledAmount: 0,
          remainingAmount: leg.amount,
          price: leg.price,
          status: 'failed',
          latencyMs: 0,
          error: res.reason instanceof Error ? res.reason.message : String(res.reason),
        });
      }
    }
    return outRecords;
  }

  // ── Sequential Execution ───────────────────────────────────────────────────

  private async executeSequential(
    legs: LegOrderParams[],
    abortSignal: AbortSignal,
  ): Promise<LegExecutionReport[]> {
    const outRecords: LegExecutionReport[] = [];

    for (const leg of legs) {
      if (abortSignal.aborted) {
        outRecords.push({
          legId: leg.legId,
          venue: leg.venue,
          symbol: leg.symbol,
          side: leg.side,
          requestedAmount: leg.amount,
          filledAmount: 0,
          remainingAmount: leg.amount,
          price: leg.price,
          status: 'canceled',
          latencyMs: 0,
          error: 'Sequential execution aborted due to preceding leg failure',
        });
        break;
      }

      const record = await this.executeSingleLegWithTimeout(leg, abortSignal);
      outRecords.push(record);

      // In sequential mode, halt immediately if any leg does not fill 100%
      if (record.status !== 'filled' || record.remainingAmount > 0) {
        logger.warn('[AtomicMultiLegCoordinator] Staged leg did not fill 100%; halting subsequent legs', {
          legId: leg.legId,
          status: record.status,
          filled: record.filledAmount,
          requested: record.requestedAmount,
        });
        break;
      }
    }

    return outRecords;
  }

  // ── Single Leg Execution with Timeout ──────────────────────────────────────

  private async executeSingleLegWithTimeout(
    leg: LegOrderParams,
    abortSignal?: AbortSignal,
  ): Promise<LegExecutionReport> {
    const timeoutMs = leg.timeoutMs ?? this.defaultTimeoutMs;
    const start = Date.now();

    if (abortSignal?.aborted) {
      return {
        legId: leg.legId,
        venue: leg.venue,
        symbol: leg.symbol,
        side: leg.side,
        requestedAmount: leg.amount,
        filledAmount: 0,
        remainingAmount: leg.amount,
        price: leg.price,
        status: 'canceled',
        latencyMs: 0,
        error: 'Aborted prior to submission',
      };
    }

    const connector = this.connectorResolver(leg.venue);
    if (!connector) {
      return {
        legId: leg.legId,
        venue: leg.venue,
        symbol: leg.symbol,
        side: leg.side,
        requestedAmount: leg.amount,
        filledAmount: 0,
        remainingAmount: leg.amount,
        price: leg.price,
        status: 'failed',
        latencyMs: 0,
        error: `No connector found for venue "${leg.venue}"`,
      };
    }

    const clientOrderId = leg.clientOrderId ?? `${leg.legId}-${Date.now()}`;
    let timer: NodeJS.Timeout | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(
          new Error(
            `LEG_TIMEOUT: Leg ${leg.legId} on venue ${leg.venue} timed out after ${timeoutMs}ms`,
          ),
        );
      }, timeoutMs);
    });

    try {
      const orderPromise = connector.placeOrder({
        symbol: leg.symbol,
        side: leg.side,
        type: leg.type,
        amount: leg.amount,
        price: leg.type === 'limit' ? leg.price : undefined,
        clientOrderId,
      });

      const orderResult = await Promise.race([orderPromise, timeoutPromise]);
      if (timer) clearTimeout(timer);

      const fillAmount =
        orderResult.filled > 0
          ? orderResult.filled
          : (orderResult.status === 'closed' ? leg.amount : 0);
      const remainingAmount = Math.max(0, leg.amount - fillAmount);
      const isFilled = remainingAmount === 0 || orderResult.status === 'closed';

      return {
        legId: leg.legId,
        orderId: orderResult.orderId,
        clientOrderId: orderResult.clientOrderId ?? clientOrderId,
        venue: leg.venue,
        symbol: leg.symbol,
        side: leg.side,
        requestedAmount: leg.amount,
        filledAmount: fillAmount,
        remainingAmount,
        price: orderResult.price > 0 ? orderResult.price : leg.price,
        avgFillPrice: orderResult.price > 0 ? orderResult.price : leg.price,
        status: isFilled ? 'filled' : (fillAmount > 0 ? 'partial' : 'failed'),
        fee: orderResult.fee,
        latencyMs: Date.now() - start,
      };
    } catch (err) {
      if (timer) clearTimeout(timer);
      const errMsg = err instanceof Error ? err.message : String(err);
      const isTimeout = errMsg.includes('LEG_TIMEOUT');

      return {
        legId: leg.legId,
        clientOrderId,
        venue: leg.venue,
        symbol: leg.symbol,
        side: leg.side,
        requestedAmount: leg.amount,
        filledAmount: 0,
        remainingAmount: leg.amount,
        price: leg.price,
        status: isTimeout ? 'timed_out' : 'failed',
        latencyMs: Date.now() - start,
        error: errMsg,
      };
    }
  }

  // ── Open Leg Cancellation ──────────────────────────────────────────────────

  private async cancelOpenLegs(legs: LegExecutionReport[]): Promise<void> {
    const cancelPromises: Promise<boolean>[] = [];

    for (const leg of legs) {
      if (
        leg.orderId &&
        (leg.status === 'partial' || leg.status === 'submitted' || leg.status === 'pending')
      ) {
        const connector = this.connectorResolver(leg.venue);
        if (connector) {
          logger.info('[AtomicMultiLegCoordinator] Canceling open leg during unwind', {
            venue: leg.venue,
            orderId: leg.orderId,
            symbol: leg.symbol,
          });

          cancelPromises.push(
            connector.cancelOrder(leg.orderId, leg.symbol).catch((err) => {
              logger.warn('[AtomicMultiLegCoordinator] Failed to cancel open order', {
                venue: leg.venue,
                orderId: leg.orderId,
                error: err instanceof Error ? err.message : String(err),
              });
              return false;
            }),
          );
        }
      }
    }

    if (cancelPromises.length > 0) {
      await Promise.allSettled(cancelPromises);
    }
  }
}
