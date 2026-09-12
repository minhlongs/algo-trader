/**
 * Run Card Types & Schema Definitions
 */

export type ResultClass =
  | { kind: 'IS' }
  | { kind: 'OOS' }
  | { kind: 'PAPER' }
  | { kind: 'LIVE' };

export type ResultClassName = ResultClass['kind'];

export interface DataSourceProvenance {
  /** Provider name (e.g. "gamma", "ccxt", "ohlcv-store"). */
  provider: string;
  /** Market / symbol identifier. */
  symbol: string;
  /** Candle timeframe. */
  timeframe: string;
  /** ISO-8601 start of the retrieved window. */
  start: string;
  /** ISO-8601 end of the retrieved window. */
  end: string;
  /** ISO-8601 when the data was retrieved. */
  retrievedAt: string;
  /** Number of candles in the window. */
  candleCount: number;
  /** Optional data-version tag (e.g. store schema version). */
  dataVersion?: string;
  /** Optional description of any transform applied to the raw series. */
  transform?: string;
}

export interface GateResult {
  gateId: string;
  passed: boolean;
  detail?: string;
}

/** Schema version of the run-card format. Bump on any breaking shape change. */
export const RUN_CARD_SCHEMA_VERSION = '1.0.0';

export interface RunCard {
  schemaVersion: typeof RUN_CARD_SCHEMA_VERSION;
  runId: string;
  /** SHA-256 of the canonicalised config (lower-cased keys, sorted). */
  configHash: string;
  /** ISO-8601 UTC timestamp when the card was written. */
  createdAt: string;
  resultClass: ResultClassName;
  strategyRef: string;
  hypothesis?: string;
  dataSources: DataSourceProvenance[];
  metrics: Record<string, number | undefined>;
  gateResults: GateResult[];
  warnings: string[];
  /** Set when the card file itself failed to write (fail-safe — never throws). */
  writeError?: string;
}

export interface WriteRunCardInput {
  runId: string;
  resultClass: ResultClassName;
  strategyRef: string;
  hypothesis?: string;
  dataSources: DataSourceProvenance[];
  metrics: Record<string, number | undefined>;
  gateResults?: GateResult[];
  warnings?: string[];
  /** Arbitrary frozen config object to hash for the reproducibility anchor. */
  config: Record<string, unknown>;
}
