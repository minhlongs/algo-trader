/**
 * Market-Blind Bayesian Fair-Value Estimation & Shrunk Ensemble Calibration
 * (IC Report Strategy 6 & AI Governance Agents #2 & #3).
 */

export type MarketBlindErrorCode =
  | 'MARKET_ANCHOR_LEAKAGE_DETECTED'
  | 'HINDCAST_CONTAMINATION_BLOCKED'
  | 'INVALID_MARKET_BLIND_INPUT'
  | 'UNSEALED_FORECAST_RECEIPT';

export class MarketBlindError extends Error {
  readonly code: MarketBlindErrorCode;
  constructor(code: MarketBlindErrorCode, message: string) {
    super(`${code}: ${message}`);
    this.name = 'MarketBlindError';
    this.code = code;
  }
}

export interface MarketBlindDocumentInput {
  id: string;
  title: string;
  content: string;
  sourceUrl?: string;
  publishedAtMs?: number;
  metadata?: Record<string, unknown>;
}

export interface SanitizedMarketBlindDocument {
  id: string;
  title: string;
  content: string;
  sourceUrl?: string;
  publishedAtMs?: number;
  metadata: Record<string, unknown>;
  truncated: boolean;
}

export interface MarketBlindSanitizerConfig {
  maxDocumentChars: number;
  maxTotalContextChars: number;
  modelKnowledgeCutoffMs?: number;
}

export interface SanitizedMarketBlindContext {
  documents: SanitizedMarketBlindDocument[];
  totalChars: number;
  droppedDocuments: number;
  truncatedDocuments: number;
  contextHash: string;
}

export interface ProspectiveForecastInput {
  modelVersionId: string;
  stateVariant: string;
  questionId: string;
  category: string;
  pRaw: number;
  loggedAtMs: number;
  contextHash?: string;
  modelKnowledgeCutoffMs?: number;
  eventResolutionOrCutoffMs?: number;
}

export interface SealedForecastReceipt {
  readonly modelVersionId: string;
  readonly stateVariant: string;
  readonly questionId: string;
  readonly category: string;
  readonly pRaw: number;
  readonly loggedAtMs: number;
  readonly contextHash: string;
  readonly prevEntryHash: string;
  readonly entryHash: string;
}

export interface ResolvedForecastSample {
  readonly receipt: SealedForecastReceipt;
  readonly marketPriceAtCommit: number;
  readonly marketObservedAtMs: number;
  readonly outcome: 0 | 1;
  readonly resolvedAtMs: number;
}

export interface CalibrationSample { pRaw: number; outcome: 0 | 1; }
export interface IsotonicBlock {
  readonly minX: number; readonly maxX: number;
  readonly weight: number; readonly meanOutcome: number;
}
export interface IsotonicCalibratorModel {
  readonly kind: 'isotonic-pava';
  readonly sampleCount: number;
  readonly blocks: readonly IsotonicBlock[];
}
export interface LogitCalibratorModel {
  readonly kind: 'logit-platt';
  readonly sampleCount: number;
  readonly slope: number;
  readonly intercept: number;
}
export interface OosEvaluationRecord { pCal: number; pMarket: number; outcome: 0 | 1; }

export interface CalibrationMetrics {
  resolvedCount: number;
  bsModel: number;
  bsMarket: number;
  bssOos: number;
  bssLower95: number;
  ece: number;
  rolling100ModelBrier: number;
  rolling100MarketBrier: number;
}

export type SkillGateFailureReason =
  | 'INSUFFICIENT_RESOLVED_SAMPLES'
  | 'INSUFFICIENT_BSS_OOS'
  | 'NON_POSITIVE_BSS_LOWER95'
  | 'EXCESSIVE_ECE'
  | 'ROLLING_100_BRIER_WORSE_THAN_MARKET';

export interface MarketBlindPosteriorConfig {
  minResolvedQuestions: number; minBssOos: number; maxEce: number;
  wMax: number; shrinkageTau: number;
  minMarketPrice: number; maxMarketPrice: number;
  minConservativeEdge: number; minTakerNetEdge: number;
  maxInferenceCostFraction: number; tickSize: number;
}

export type MarketBlindExecutionStyle = 'post-only-improve-1tick' | 'taker';
export type ProposalRejectionReason =
  | 'SKILL_GATE_LOCKED'
  | 'MARKET_PRICE_OUTSIDE_BAND'
  | 'INSUFFICIENT_CONSERVATIVE_EDGE'
  | 'INFERENCE_COST_CAP_EXCEEDED';

export interface MarketBlindTradeProposal {
  questionId: string; category: string;
  executionStyle: MarketBlindExecutionStyle;
  limitPrice: number; pPost: number; wSkill: number;
  edgeCons: number; netEdgeAfterTaker: number;
  notionalPusd: number; inferenceCostPusd: number; inferenceCostFraction: number;
}

export interface ShrunkPosteriorInput {
  receipt: SealedForecastReceipt; pCal: number; marketPrice: number;
  marketObservedAtMs?: number; metrics: CalibrationMetrics;
  sigmaPost?: number; askPrice?: number; bestBid?: number;
  takerFeePerShare?: number; notionalPusd?: number; inferenceCostPusd?: number;
}

export interface ShrunkPosteriorResult {
  pPost: number; pCal: number; marketPrice: number;
  wSkill: number; loggingOnly: boolean;
  skillGateReasons: SkillGateFailureReason[];
  edgeCons: number; netEdgeAfterTaker: number;
  proposal: MarketBlindTradeProposal | null;
  proposalRejectionReason: ProposalRejectionReason | null;
}

export const DEFAULT_SANITIZER_CONFIG: MarketBlindSanitizerConfig = Object.freeze({
  maxDocumentChars: 6_000, maxTotalContextChars: 24_000,
});
export const DEFAULT_POSTERIOR_CONFIG: MarketBlindPosteriorConfig = Object.freeze({
  minResolvedQuestions: 150, minBssOos: 0.02, maxEce: 0.035, wMax: 0.35, shrinkageTau: 0.10,
  minMarketPrice: 0.10, maxMarketPrice: 0.90, minConservativeEdge: 0.03, minTakerNetEdge: 0.045,
  maxInferenceCostFraction: 0.0015, tickSize: 0.01,
});
