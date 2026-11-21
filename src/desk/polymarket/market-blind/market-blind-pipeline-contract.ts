import { z } from 'zod';
import type { MarketBlindDocumentInput, MarketBlindPosteriorConfig, MarketBlindSanitizerConfig, SealedForecastReceipt, SkillGateFailureReason } from './market-blind-types';

export type MarketBlindResolutionState = 'RESOLVED_YES' | 'RESOLVED_NO' | 'VOIDED' | 'CANCELLED' | 'UMA_DISPUTED';
export type ProspectiveOosVerdict = 'INSUFFICIENT_DATA' | 'FAIL_CALIBRATION' | 'PASS_PROSPECTIVE_SKILL';
export interface ForecastProvenance { kind: 'REAL' | 'SYNTHETIC'; source: string; reference: string; }
export interface ProspectiveCommitInput {
  questionId: string; category?: string; pRaw: number; modelVersion: string; promptVersion?: string; prompt?: string;
  evidence: string | readonly MarketBlindDocumentInput[]; committedAtMs?: number;
  modelKnowledgeCutoffMs?: number; eventResolutionOrCutoffMs?: number; sanitizerConfig?: Partial<MarketBlindSanitizerConfig>;
  forecastId?: string; researchQuestionId?: string; eventId?: string; marketId?: string;
  forecastHorizonMs?: number; provenance?: ForecastProvenance;
}
export interface ProspectiveCommitReceipt {
  readonly entryHash: string; readonly prevChainHash: string; readonly committedAtMs: number; readonly recordedAtMs?: number; readonly modelVersion: string;
  readonly promptVersion: string; readonly questionId: string; readonly category: string; readonly pRaw: number;
  readonly contextHash: string; readonly sealedReceipt: SealedForecastReceipt; readonly forecastId: string;
  readonly researchQuestionId?: string; readonly eventId?: string; readonly marketId?: string;
  readonly forecastHorizonMs?: number; readonly provenance?: Readonly<ForecastProvenance>;
}
export interface PostCommitMarketSnapshotInput { marketProb: number; marketReadAtMs?: number; source?: string; }
export interface PostCommitMarketSnapshotRecord { readonly entryHash: string; readonly marketProb: number; readonly marketReadAtMs: number; readonly source: string; }
export interface MarketBlindResolutionInput {
  questionId?: string; entryHash?: string; status: MarketBlindResolutionState; resolvedAtMs?: number; marketProb?: number; marketReadAtMs?: number; note?: string;
}
export interface MarketBlindResolutionAuditRecord {
  readonly entryHash: string; readonly questionId: string; readonly status: MarketBlindResolutionState; readonly outcome: 0 | 1 | null;
  readonly resolvedAtMs: number; readonly marketProb: number | null; readonly marketReadAtMs: number | null; readonly note?: string;
}
/** Caller must supply an actual IC approval record; these fields are not an approval service. */
export interface ApprovedRepeatedForecastPolicy {
  policyId: string; approvalStatus: 'APPROVED'; approvedBy: string; approvedAtMs: number; approvalEvidenceRef: string;
  modelVersion: string; repeatedForecastRule: 'FIRST_COMMIT_PER_RESEARCH_QUESTION';
}
export interface ProspectiveOosReportOptions {
  category?: string; calibrate?: (pRaw: number) => number; config?: Partial<MarketBlindPosteriorConfig>;
  mode?: 'diagnostic' | 'empirical'; modelVersion?: string; policy?: ApprovedRepeatedForecastPolicy;
}
export interface ProspectiveOosReport {
  committedCount: number; resolvedScoredCount: number; voidedCount: number; cancelledCount: number; umaDisputedCount: number; pendingCount: number;
  brierModel: number | null; brierMarket: number | null; bssOos: number | null; bssLower95: number | null; ece: number | null;
  rolling100ModelBrier: number | null; rolling100MarketBrier: number | null;
  skillGate: { wSkill: number; unlocked: boolean; reasons: SkillGateFailureReason[] };
  verdict: ProspectiveOosVerdict; chainVerified: boolean; hindcastDetected: boolean;
  reportMode: 'diagnostic' | 'empirical'; resolvedEligibleCount: number; integrityVerified: boolean;
  empiricalEligible: boolean; eligibilityReasons: string[];
}
const identifier = z.string().trim().min(1);
const timestamp = z.number().int().positive().safe();
const probability = z.number().gt(0).lt(1);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const commitPayloadSchema = z.object({
  questionId: identifier, category: identifier, pRaw: probability, modelVersion: identifier, promptVersion: identifier,
  committedAtMs: timestamp, recordedAtMs: timestamp.optional(), contextHash: hash, forecastId: identifier.optional(), researchQuestionId: identifier.optional(),
  eventId: identifier.optional(), marketId: identifier.optional(), forecastHorizonMs: timestamp.optional(),
  provenance: z.object({ kind: z.enum(['REAL', 'SYNTHETIC']), source: identifier, reference: identifier }).strict().optional(),
}).strict();
export const storedCommitSchema = commitPayloadSchema.extend({ forecastEntryHash: hash, forecastPrevEntryHash: hash });
export const snapshotSchema = z.object({ entryHash: hash, marketProb: probability, marketReadAtMs: timestamp, source: identifier }).strict();
export const resolutionSchema = z.object({
  entryHash: hash, questionId: identifier, status: z.enum(['RESOLVED_YES', 'RESOLVED_NO', 'VOIDED', 'CANCELLED', 'UMA_DISPUTED']),
  outcome: z.union([z.literal(0), z.literal(1)]).nullable(), resolvedAtMs: timestamp,
  marketProb: probability.nullable(), marketReadAtMs: timestamp.nullable(), note: z.string().optional(),
}).strict();
export const approvedPolicySchema = z.object({
  policyId: identifier, approvalStatus: z.literal('APPROVED'), approvedBy: identifier, approvedAtMs: timestamp,
  approvalEvidenceRef: identifier, modelVersion: identifier, repeatedForecastRule: z.literal('FIRST_COMMIT_PER_RESEARCH_QUESTION'),
}).strict();
export type CommitPayload = z.infer<typeof commitPayloadSchema>;
