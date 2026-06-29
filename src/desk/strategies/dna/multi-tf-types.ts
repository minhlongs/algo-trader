/**
 * Cheetahclaws-DNA: Multi-Timeframe Consensus Engine
 * ────────────────────────────────────────────────────────────────────────────
 * Canonical type contract for the 3-TF strategy.
 *
 * All modules in src/strategies/dna/ import from this file ONLY.
 * Nothing else may add TF-specific types — this file is the single source of
 * truth for TF identifiers, candle shapes, indicator outputs, signal shapes,
 * regime definitions, and journal entries.
 *
 * Why this exists:
 *  - Legibility  : a reader sees this file and knows the full data model.
 *  - Explicitness: TF names are string literals ('1m'|'5m'|'15m'|'1h'|'4h'|'1d'),
 *                 not magic numbers.
 *  - Tractability: the journal entry type is append-only; every execution is
 *                 re-playable by re-reading the journal table.
 */

// ─── TF vocabulary (explicit — no dynamic TF strings) ───────────────────────

export type TfId = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

export const TF_RESOLUTIONS: Record<TfId, number> = {
  '1m': 60_000,
  '5m': 300_000,
  '15m': 900_000,
  '1h': 3_600_000,
  '4h': 14_400_000,
  '1d': 86_400_000,
};

export function tfLabel(tf: TfId): string {
  return tf;
}

// ─── Candle (OHLCV) ──────────────────────────────────────────────────────────

export interface Candle {
  timestamp: number; // epoch-ms, open of this candle
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// ─── Indicator outputs per TF ─────────────────────────────────────────────────

export interface TrendIndicators {
  ema20: number;
  ema50: number;
  ema200: number | null; // null on TFs that don't have enough history
  adx: number;
  adxTrend: 'up' | 'down' | 'sideways';
}

export interface MomentumIndicators {
  rsi: number;
  macdLine: number;
  macdSignal: number;
  macdHist: number;
}

export interface VolatilityIndicators {
  atr: number;
  atrPct: number; // ATR / close
  bollingerUpper: number;
  bollingerMid: number;
  bollingerLower: number;
  bollingerWidthPct: number;
}

export interface MicroStructureIndicators {
  // Short-TF only (1m, 5m). Null on higher TFs.
  obi: number | null;      // order-book imbalance -1..1
  vwap: number | null;
  deltaCandle: number | null; // buy-vol - sell-vol per candle
}

export interface TimeframeIndicators {
  tf: TfId;
  candles: Candle[];
  trend: TrendIndicators;
  momentum: MomentumIndicators;
  volatility: VolatilityIndicators;
  microstructure: MicroStructureIndicators;
  computedAt: number; // epoch-ms
}

// ─── TF-specific signal (before consensus) ────────────────────────────────────

export type TfSignalAction = 'bull' | 'bear' | 'neutral';

export interface TfSignal {
  tf: TfId;
  action: TfSignalAction;
  confidence: number;        // 0..1
  entryHint: number | null; // suggested entry price (null = market)
  slHint: number | null;    // suggested stop-loss
  tpHint: number | null;    // suggested take-profit
  reason: string;            // LEGIBILITY: human-readable reason
  indicatorSnap: Pick<TimeframeIndicators, 'trend' | 'momentum' | 'volatility'>;
  emittedAt: number; // epoch-ms
}

// ─── Regime (market context) ─────────────────────────────────────────────────

export type MarketRegime = 'trending_up' | 'trending_down' | 'ranging' | 'volatile';

export interface RegimeSnapshot {
  regime: MarketRegime;
  regimeConfidence: number; // 0..1
  dominantTf: TfId;         // the TF that "leads" this regime
  reason: string;
  validFrom: number;
  validUntil: number | null; // null = still valid
}

// ─── Consensus output (final signal) ─────────────────────────────────────────

export type ConsensusAction = 'enter_long' | 'enter_short' | 'hold';

export interface ConsensusSignal {
  action: ConsensusAction;
  confidence: number;              // 0..1 composite
  direction?: 'long' | 'short';    // undefined if action === 'hold'
  entryPrice: number | null;
  slPrice: number | null;
  tpPrice: number | null;
  // Per-TF breakdown — EXPLICITNESS: all evidence surfaced, nothing hidden.
  tfSignals: Array<{ tf: TfId; action: TfSignalAction; confidence: number; weight: number }>;
  weightedBullScore: number;
  weightedBearScore: number;
  regime: MarketRegime;
  reason: string;
  traceId: string;                 // TRACTABILITY: end-to-end id
  emittedAt: number;
}

// ─── DNA Journal (append-only — tractability anchor) ─────────────────────────
//
// Every execution of the engine writes exactly ONE journal entry.
// The journal is the replay log; nothing is stored outside it.

export type JournalDecision = 'executed' | 'rejected_tf_mismatch'
  | 'rejected_low_confidence' | 'rejected_regime_anomaly'
  | 'rejected_volatility_too_high' | 'paper_only' | 'aborted';

export interface PaperJournalEntry {
  id: string;
  traceId: string;
  at: number;
  action: 'enter_long' | 'enter_short' | 'exit_long' | 'exit_short' | 'hold';
  confidence: number;
  regime: MarketRegime;
  reason: string | null;
  source: string;
  executedBy: 'paper' | 'live';
  tfSignals: { tf: TfId; action: string; confidence: number }[];
  fillPrice: number | null;
  trade?: {
    marketId: string;
    side: 'long' | 'short';
    sizeUsd: number;
    entryPrice: number;
  };
}

export interface DnaJournalEntry {
  id: string;                  // uuid
  traceId: string;
  timestamp: number;           // epoch-ms of the decision
  action: ConsensusAction;
  decision: JournalDecision;
  confidence: number;
  weightedBullScore: number;
  weightedBearScore: number;
  regime: MarketRegime;
  tfSignalsJson: string;       // JSON of tfSignals[] — queryable
  reason: string;
  executedBy: 'live' | 'paper' | 'none';
  errorMessage: string | null;
  // Replay metadata
  candleSnapshotTfs: TfId[];   // which TF candles were used
  candleTimestampRange: { from: number; to: number } | null;
}

// ─── Engine configuration (config-as-code — explicitness) ────────────────────

export interface DnaEngineConfig {
  // Which TFs participate in consensus (order = priority weight fallback)
  tfOrder: TfId[];
  // Per-TF minimum confidence to count as a valid vote (explicit thresholds)
  minConfidencePerTf: Partial<Record<TfId, number>>;
  // Minimum aggregated confidence to produce an actionable signal
  minConsensusConfidence: number;
  // Bull/bear spread threshold (e.g. 0.15 = bull must lead bear by ≥15 pp)
  consensusSpread: number;
  // Max ATR% allowed to trade; above = reject (volatility circuit breaker)
  maxAtpPct: number;
  // If all TFs disagree → reject; if N of M agree → pass
  minTfAgreement: number;
  // Trace/logging
  journalTableName: string;
  logSignalLevel: 'debug' | 'info' | 'warn';
}

export const DEFAULT_DNA_CONFIG: DnaEngineConfig = {
  tfOrder: ['1m', '5m', '15m', '1h', '4h', '1d'],
  minConfidencePerTf: { '1m': 0.55, '5m': 0.55, '15m': 0.50, '1h': 0.45, '4h': 0.40, '1d': 0.35 },
  minConsensusConfidence: 0.60,
  consensusSpread: 0.15,
  maxAtpPct: 0.05,
  minTfAgreement: 3,
  journalTableName: 'dna_journal',
  logSignalLevel: 'info',
};

// ─── Scheduler / lifecycle hooks (explicitness: typed events) ─────────────────

export type DnaLifecycleEvent =
  | { type: 'tick'; tf: TfId; at: number }
  | { type: 'tf_ready'; tf: TfId; candleCount: number }
  | { type: 'consensus_computed'; signal: ConsensusSignal | null }
  | { type: 'journal_written'; entry: DnaJournalEntry }
  | { type: 'paper_executed'; entry: PaperJournalEntry }
  | { type: 'paper_mode_changed'; enabled: boolean; at: number }
  | { type: 'error'; err: Error; context: string };

export type DnaLifecycleListener = (ev: DnaLifecycleEvent) => void;
