/**
 * Alpha-Lab Autonomous Pipeline Promotion, Signal Routing, & Risk Handoff
 */

import { hashConfig } from '../provenance/run-card';
import type { LedgerRecord, LedgerWriteResult } from '../provenance/research-ledger';
import type { DiscoveredAlphaCandidate } from '../alpha-discovery/continuous-discovery-pipeline';
import {
  AlphaLifecycleStateMachine,
  type PromotionStateTransition,
} from '../attribution/alpha-lifecycle-state-machine';
import type { AISignal } from '../../desk/strategies/ai-signal-adapter';
import type { AISignalPaperRouter, SignalRoutingOutcome } from '../../desk/strategies/ai-signal-paper-router';
import type { LiveGuardHandoffCoordinator, LiveOrderHandoffVerdict } from '../../desk/execution/live-guard-handoff';
import type { PolymarketOrder } from '../../desk/execution/polymarket-signer';
import type { TradeSignal } from '../../desk/polymarket/strategy-live-bridge-types';
import type { GateEvaluatorInput } from '../gates/gate-evaluator-types';
import { recordPromotionProvenance } from './alpha-lab-pipeline-provenance';

/**
 * Ingests a discovered candidate into the paper state machine.
 */
export function ingestCandidateToPaperStateMachine(
  candidate: DiscoveredAlphaCandidate,
  stateMachines: Map<string, AlphaLifecycleStateMachine>,
  candidateConfigs: Map<string, Record<string, unknown>>,
  lastKnownCandidates: Map<string, DiscoveredAlphaCandidate>,
  persistLedger: (input: Omit<LedgerRecord, 'prevHash' | 'recordedAt' | 'entryHash'>) => Promise<LedgerWriteResult>,
  reason?: string,
): PromotionStateTransition {
  let sm = stateMachines.get(candidate.strategyId);
  if (!sm) {
    sm = new AlphaLifecycleStateMachine(candidate.strategyId, 'DISCOVERED');
    stateMachines.set(candidate.strategyId, sm);
  }
  candidateConfigs.set(
    candidate.strategyId,
    candidate.config as unknown as Record<string, unknown>,
  );
  lastKnownCandidates.set(candidate.strategyId, candidate);

  const transition = sm.startPaperTrading(reason);

  const config = (candidate.config ?? candidateConfigs.get(candidate.strategyId) ?? {}) as unknown as Record<string, unknown>;
  void persistLedger({
    runId: `paper-ingest-${candidate.strategyId}-${transition.timestamp}`,
    configHash: hashConfig(config),
    resultClass: 'PAPER',
    strategyRef: candidate.familyId ?? candidate.strategyId,
    lifecycleState: 'PAPER_ACTIVE',
    gates: candidate.survivalGateResult?.checks ?? {},
  });

  return transition;
}

/**
 * Routes an array of AISignals through validation and paper execution.
 */
export async function routeCandidateSignals(
  paperRouter: AISignalPaperRouter,
  stateMachines: Map<string, AlphaLifecycleStateMachine>,
  signals: AISignal[],
  marketPrice: number,
  defaultSymbol: string,
): Promise<SignalRoutingOutcome[]> {
  const outcomes: SignalRoutingOutcome[] = [];

  for (const signal of signals) {
    const sm = signal.strategyId ? stateMachines.get(signal.strategyId) : undefined;
    const symbol = signal.symbol ?? defaultSymbol;
    if (sm && sm.isRetired()) {
      outcomes.push({
        status: 'REJECTED',
        signal,
        symbol,
        marketPrice,
        validation: {
          valid: false,
          signal,
          rejectionReasons: ['Strategy is in RETIRED state'],
        },
        reason: 'Strategy is in RETIRED state',
        timestamp: Date.now(),
      });
      continue;
    }

    const outcome = await paperRouter.routeSignal(signal, marketPrice);
    outcomes.push(outcome);
  }

  return outcomes;
}

/**
 * Evaluates active paper strategies against 10+1 canonical criteria and retirement triggers.
 */
export async function evaluateActivePaperPromotions(
  stateMachines: Map<string, AlphaLifecycleStateMachine>,
  candidateConfigs: Map<string, Record<string, unknown>>,
  symbol: string,
  timeframe: string,
  runCardDir: string,
  persistLedger: (input: Omit<LedgerRecord, 'prevHash' | 'recordedAt' | 'entryHash'>) => Promise<LedgerWriteResult>,
  gateInputs?: Map<string, GateEvaluatorInput>,
): Promise<PromotionStateTransition[]> {
  const transitions: PromotionStateTransition[] = [];

  for (const [strategyId, sm] of stateMachines.entries()) {
    if (sm.getState() !== 'PAPER_ACTIVE') {
      continue;
    }

    const input = gateInputs?.get(strategyId);
    if (!input) {
      continue;
    }

    const evalResult = sm.evaluate(input);
    if (evalResult.transition) {
      const transition = evalResult.transition;
      transitions.push(transition);

      const config = candidateConfigs.get(strategyId) ?? {};
      await recordPromotionProvenance(
        transition,
        strategyId,
        config,
        symbol,
        timeframe,
        runCardDir,
        persistLedger,
      );
    }
  }

  return transitions;
}

/**
 * Evaluates a live order against the multi-tier pre-trade risk gate handoff.
 */
export function evaluateLiveRiskHandoff(
  liveCoordinator: LiveGuardHandoffCoordinator,
  stateMachines: Map<string, AlphaLifecycleStateMachine>,
  defaultSymbol: string,
  request: {
    strategyId: string;
    order: PolymarketOrder;
    signal?: TradeSignal | AISignal;
  },
): LiveOrderHandoffVerdict {
  const lifecycleState =
    stateMachines.get(request.strategyId)?.getState() ?? 'DISCOVERED';

  const signal: TradeSignal | AISignal = request.signal ?? {
    strategyId: request.strategyId,
    signalId: `sig-live-${request.strategyId}-${Date.now()}`,
    direction: request.order.side === 'BUY' ? 'BUY' : 'SELL',
    action: request.order.side === 'BUY' ? 'BUY' : 'SELL',
    symbol: defaultSymbol,
    confidence: 1.0,
    expectancy: 0.05,
    regime: 'TREND_UP',
    timestamp: Date.now(),
  };

  return liveCoordinator.evaluateLiveOrder({
    strategyId: request.strategyId,
    lifecycleState,
    signal,
    order: request.order,
  });
}
