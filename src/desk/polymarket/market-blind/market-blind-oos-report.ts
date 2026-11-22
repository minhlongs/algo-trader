import { evaluateCalibrationMetrics } from './market-blind-calibrator';
import { evaluateSkillGate } from './market-blind-shrunk-posterior';
import { DEFAULT_POSTERIOR_CONFIG, type OosEvaluationRecord } from './market-blind-types';
import {
  approvedPolicySchema,
  type ProspectiveCommitReceipt,
  type ProspectiveOosReport,
  type ProspectiveOosReportOptions,
  type MarketBlindResolutionAuditRecord,
} from './market-blind-pipeline-contract';
import { trustedSettlementVerifierRegistrySchema } from './settlement-verification-contract';
import {
  classifySettlementVerificationStage,
  hasEmpiricalMetadata,
  isSyntheticIdentifier,
} from './settlement-stage-classifier';
import type { ProspectivePipelineLedger } from './market-blind-prospective-pipeline';

export { classifySettlementVerificationStage, type SettlementStageAssessment } from './settlement-stage-classifier';

const numOrNull = (n: number, value: number): number | null => n > 0 && Number.isFinite(value) ? value : null;

/** Diagnostic scores are never IC evidence. Empirical mode requires external approval and retained checkpoint. */
export function evaluateProspectiveOosReport(ledger: ProspectivePipelineLedger, options: ProspectiveOosReportOptions = {}): ProspectiveOosReport {
  const mode = options.mode ?? 'diagnostic', strict = mode === 'empirical';
  const all = [...ledger.commitsByHash.values()].filter((c) => options.category === undefined || c.category === options.category);
  const commits = all.filter((c) => options.modelVersion === undefined || c.modelVersion === options.modelVersion);
  const reasons: string[] = [];
  const chainVerified = ledger.verifyChainIntegrity(), integrityVerified = ledger.integrityVerified();
  const policy = approvedPolicySchema.safeParse(options.policy);
  const parsedRegistry = options.settlementVerifierRegistry
    ? trustedSettlementVerifierRegistrySchema.safeParse(options.settlementVerifierRegistry)
    : null;
  const activeRegistry = parsedRegistry?.success && parsedRegistry.data.authorities.some((a) => a.status === 'ACTIVE')
    ? parsedRegistry.data
    : undefined;
  if (!strict) reasons.push('DIAGNOSTIC_ONLY');
  if (!integrityVerified) reasons.push('INDEPENDENT_CHECKPOINT_REQUIRED_OR_INTEGRITY_FAILED');
  if (!policy.success) reasons.push('APPROVED_REPEATED_FORECAST_POLICY_REQUIRED');
  if (strict && !activeRegistry) reasons.push('SETTLEMENT_VERIFIER_AUTHORITY_REQUIRED');
  if (strict && !options.modelVersion) reasons.push('MODEL_VERSION_REQUIRED');
  if (new Set(commits.map((c) => c.modelVersion)).size > 1) reasons.push('CROSS_MODEL_POOLING_FORBIDDEN');
  if (policy.success && policy.data.modelVersion !== options.modelVersion) reasons.push('POLICY_MODEL_MISMATCH');
  if (strict && policy.success && [policy.data.policyId, policy.data.approvedBy, policy.data.approvalEvidenceRef].some(isSyntheticIdentifier)) {
    reasons.push('SYNTHETIC_POLICY_FORBIDDEN');
  }
  if (strict && (options.calibrate || options.config)) reasons.push('UNAPPROVED_SCORING_OVERRIDE');
  // Select the first commitment, not the first resolved/favourable revision.
  const selected = new Map<string, ProspectiveCommitReceipt>();
  const seenQuestions = new Set<string>(), seenResearch = new Set<string>(), seenMarkets = new Set<string>();
  for (const c of commits) {
    const key = c.researchQuestionId ?? c.questionId;
    const duplicate = seenQuestions.has(c.questionId) || seenResearch.has(key) || !!(c.marketId && seenMarkets.has(c.marketId));
    // Record aliases even for rejected repeats so chains of renamed questions cannot inflate the denominator.
    seenQuestions.add(c.questionId); seenResearch.add(key);
    if (c.marketId) seenMarkets.add(c.marketId);
    if (!duplicate) selected.set(key, c);
  }
  const scored: Array<{ commit: ProspectiveCommitReceipt; res: MarketBlindResolutionAuditRecord }> = [];
  let voidedCount = 0, cancelledCount = 0, umaDisputedCount = 0, pendingCount = 0;
  let hindcastDetected = ledger.hasHindcastViolation(), excludedMetadata = 0, excludedBeforeApproval = 0, excludedUnattested = 0, excludedUnverifiedSettlement = 0, excludedDuplicateReceipt = 0;
  const seenReceiptKeys = new Set<string>();
  for (const c of selected.values()) {
    const r = ledger.resolutions.get(c.entryHash), s = ledger.snapshots.get(c.entryHash);
    if (s && s.marketReadAtMs < c.committedAtMs) hindcastDetected = true;
    if (!r) { pendingCount += 1; continue; }
    if (r.resolvedAtMs <= c.committedAtMs || (r.marketReadAtMs !== null && (r.marketReadAtMs < c.committedAtMs || r.marketReadAtMs >= r.resolvedAtMs))) hindcastDetected = true;
    if (r.status === 'VOIDED') { voidedCount += 1; continue; }
    if (r.status === 'CANCELLED') { cancelledCount += 1; continue; }
    if (r.status === 'UMA_DISPUTED') { umaDisputedCount += 1; continue; }
    if (!Number.isFinite(c.recordedAtMs) || c.recordedAtMs! <= 0 || c.recordedAtMs! >= r.resolvedAtMs) {
      excludedUnattested += 1;
      if (strict) continue;
    }
    if (strict && (!hasEmpiricalMetadata(c) || !s || isSyntheticIdentifier(s.source))) { excludedMetadata += 1; continue; }
    if (strict && policy.success && c.committedAtMs < policy.data.approvedAtMs) { excludedBeforeApproval += 1; continue; }
    if (strict) {
      const stageAssessment = classifySettlementVerificationStage(c, r, activeRegistry);
      if (stageAssessment.stage !== 'SETTLEMENT_EMPIRICALLY_ELIGIBLE') { excludedUnverifiedSettlement += 1; continue; }
      const vr = r.settlementProvenance!.verificationReceipt!;
      const receiptKey = `${vr.conditionId.toLowerCase()}:${vr.txHash.toLowerCase()}:${vr.logIndex}`;
      if (seenReceiptKeys.has(receiptKey)) { excludedDuplicateReceipt += 1; continue; }
      seenReceiptKeys.add(receiptKey);
    }
    if (r.outcome !== null && r.marketProb !== null) scored.push({ commit: c, res: r });
  }
  const globalBlock = reasons.some((r) => r !== 'DIAGNOSTIC_ONLY');
  if (excludedUnattested) reasons.push('UNATTESTED_OR_BACKFILL_FORECASTS_EXCLUDED');
  if (excludedMetadata) reasons.push('FORECASTS_WITHOUT_REAL_PROVENANCE_OR_METADATA_EXCLUDED');
  if (excludedBeforeApproval) reasons.push('PRE_APPROVAL_FORECASTS_EXCLUDED');
  if (excludedUnverifiedSettlement) reasons.push('UNVERIFIED_OR_NON_FINAL_SETTLEMENT_EXCLUDED');
  if (excludedDuplicateReceipt) reasons.push('DUPLICATE_SETTLEMENT_RECEIPT_EXCLUDED');
  if (hindcastDetected) reasons.push('HINDCAST_DETECTED');
  if ((strict && globalBlock) || reasons.includes('CROSS_MODEL_POOLING_FORBIDDEN')) scored.length = 0;
  scored.sort((a, b) => a.res.resolvedAtMs - b.res.resolvedAtMs || a.commit.committedAtMs - b.commit.committedAtMs);
  const oos: OosEvaluationRecord[] = scored.map(({ commit, res }) => ({ pCal: !strict && options.calibrate ? options.calibrate(commit.pRaw) : commit.pRaw, pMarket: res.marketProb!, outcome: res.outcome! }));
  const m = evaluateCalibrationMetrics(oos), gate = evaluateSkillGate(m, strict ? undefined : options.config), n = scored.length;
  const empiricalEligible = strict && !globalBlock && chainVerified && !hindcastDetected;
  const unlocked = gate.passed && chainVerified && !hindcastDetected && (!strict || empiricalEligible);
  const minResolved = strict ? DEFAULT_POSTERIOR_CONFIG.minResolvedQuestions : options.config?.minResolvedQuestions ?? DEFAULT_POSTERIOR_CONFIG.minResolvedQuestions;
  return {
    committedCount: commits.length, resolvedScoredCount: n, voidedCount, cancelledCount, umaDisputedCount, pendingCount,
    brierModel: numOrNull(n, m.bsModel), brierMarket: numOrNull(n, m.bsMarket), bssOos: numOrNull(n, m.bssOos), bssLower95: numOrNull(n, m.bssLower95),
    ece: numOrNull(n, m.ece), rolling100ModelBrier: numOrNull(n, m.rolling100ModelBrier), rolling100MarketBrier: numOrNull(n, m.rolling100MarketBrier),
    skillGate: { wSkill: unlocked ? gate.wSkill : 0, unlocked, reasons: gate.reasons },
    verdict: n < minResolved ? 'INSUFFICIENT_DATA' : unlocked ? 'PASS_PROSPECTIVE_SKILL' : 'FAIL_CALIBRATION',
    chainVerified, hindcastDetected, reportMode: mode, resolvedEligibleCount: empiricalEligible ? n : 0,
    integrityVerified, empiricalEligible, eligibilityReasons: reasons,
  };
}
