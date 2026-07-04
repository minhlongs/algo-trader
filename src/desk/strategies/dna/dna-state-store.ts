/**
 * DnaStateStore — persistence layer for DnaEngine state.
 *
 * Explicit dependency: requires a `query()` function (matching postgres-client signature)
 * so the orchestrator stays testable (swap with in-memory for tests).
 *
 * State shape is versioned via `schemaVersion` so future upgrades can migrate.
 */

import {
  TfId,
  TfSignal,
  RegimeSnapshot,
  ConsensusSignal,
} from './multi-tf-types.js';

export interface DnaEngineState {
  schemaVersion: string;
  savedAt: number;
  traceCounter: number;
  lastTfSignals: [TfId, TfSignal][];     // tuples so we can Map.set on load
  lastRegime: RegimeSnapshot | null;
  lastConsensus: ConsensusSignal | null;
}

export interface DnaStateStore {
  save(state: DnaEngineState): Promise<void>;
  load(): Promise<DnaEngineState | null>;
}

/** In-memory fallback / test double — explicit, no hidden globals. */
export class InMemoryStateStore implements DnaStateStore {
  private _state: DnaEngineState | null = null;
  async save(state: DnaEngineState): Promise<void> { this._state = state; }
  async load(): Promise<DnaEngineState | null> { return this._state; }
}

/** Postgres-backed store — uses postgres-client `query()` signature. */
export class PostgresStateStore implements DnaStateStore {
  constructor(private _queryFn: (sql: string, params?: any[]) => Promise<any>) {}

  async save(state: DnaEngineState): Promise<void> {
    await this._queryFn(
      `INSERT INTO dna_engine_state (id, state, updated_at)
       VALUES ('singleton', $1::jsonb, now())
       ON CONFLICT (id) DO UPDATE SET state = $1::jsonb, updated_at = now()`,
      [JSON.stringify(state)],
    );
  }

  async load(): Promise<DnaEngineState | null> {
    const res = await this._queryFn(
      `SELECT state FROM dna_engine_state WHERE id = 'singleton' LIMIT 1`,
    );
    if (!res.rows?.[0]?.state) return null;
    try {
      return JSON.parse(res.rows[0].state) as DnaEngineState;
    } catch {
      return null;
    }
  }
}

/** Convenience factory — imports postgres-client lazily to keep this module tree-shakeable. */
export async function createPostgresStateStore(): Promise<PostgresStateStore> {
  const { query } = await import('../../db/postgres-client');
  return new PostgresStateStore((sql, params) => query(sql, params));
}
