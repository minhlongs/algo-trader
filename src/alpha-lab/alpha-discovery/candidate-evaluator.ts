import { evaluateWalkForward } from '../walkforward/walkforward-evaluator';
import { evaluateAlphaSurvivalGate } from '../attribution/alpha-survival-gate';
import { generateCandidateRejectionDiagnostics } from '../reports/candidate-rejection-diagnostics';
import type { CandleLike } from '../regimes/regime-types';
import type { ExperimentConfig, SplitConfig } from '../experiments/experiment-types';
import type { CandidateAlphaConfig } from './candidate-generator';
import type {
  DiscoveredAlphaCandidate,
  ContinuousDiscoveryPipelineConfig,
} from './continuous-discovery-types';

export const DEFAULT_SPLIT_CONFIG: SplitConfig = {
  mode: 'rolling',
  trainRatio: 0.3,
  valRatio: 0.2,
  testRatio: 0.5,
  numFolds: 5,
};

export function evaluateDiscoveryCandidate(
  cand: CandidateAlphaConfig,
  candles: CandleLike[],
  pipelineConfig: ContinuousDiscoveryPipelineConfig
): DiscoveredAlphaCandidate {
  const split: SplitConfig = {
    ...DEFAULT_SPLIT_CONFIG,
    ...pipelineConfig.split,
    ...(cand.experimentConfig.split?.numFolds !== undefined ? cand.experimentConfig.split : {}),
    numFolds: cand.experimentConfig.split?.numFolds ?? pipelineConfig.split?.numFolds ?? 5,
    mode: 'rolling',
  };
  const expConfig: ExperimentConfig = { ...cand.experimentConfig, split };
  const wfResult = evaluateWalkForward({ candles, config: expConfig });

  const gateResult = evaluateAlphaSurvivalGate({
    summary: wfResult.summary,
    trades: wfResult.allTestTrades,
    criteria: pipelineConfig.survivalGates,
    baselineFeeBps: expConfig.cost.feeBps,
    baselineSlippageBps: expConfig.cost.slippageBps,
  });

  const diagnostics = gateResult.passed
    ? undefined
    : generateCandidateRejectionDiagnostics(gateResult, wfResult.summary, expConfig);

  return {
    strategyId: cand.candidateId,
    familyId: cand.familyId,
    params: cand.params,
    config: expConfig,
    walkforwardResult: wfResult,
    walkforwardSummary: wfResult.summary,
    survivalGateResult: gateResult,
    status: gateResult.passed ? 'PASSED' : 'REJECTED',
    rejectionDiagnostics: diagnostics,
  };
}
