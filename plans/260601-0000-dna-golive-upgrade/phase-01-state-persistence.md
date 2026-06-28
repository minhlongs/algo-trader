# Phase 01: Persist Orchestrator State

## Mục tiêu
Khi `DnaEngine` restart (do deploy, crash, hoặc manual stop/start), không mất state đang cache: `_lastTfSignals`, `_lastRegime`, `_lastConsensus`. Engine restart phải nạp lại từ DB và tiếp tục từ chỗ dừng.

## Phạm vi thay đổi
- `src/strategies/dna/orchestrator.ts` — thêm `DnaStateStore` interface + DB-backed implementation
- `src/db/migrations/023_dna_engine_state.sql` — state table
- `src/db/schema.ts` — thêm map nếu cần

## Thiết kế

```
DnaEngine
  ├─ _stateStore: DnaStateStore   ← interface, có thể swap in-memory ↔ postgres
  ├─ start()
  │    ├─ stateStore.load() → hydrate _lastTfSignals / _lastRegime / _lastConsensus
  │    └─ bắt đầu scheduler
  └─ stop()
       └─ stateStore.save({ lastTfSignals, lastRegime, lastConsensus, savedAt })
```

### DnaStateStore interface
```ts
interface DnaStateStore {
  save(state: DnaEngineState): Promise<void>;
  load(): Promise<DnaEngineState | null>;
}

interface DnaEngineState {
  savedAt: number;
  lastTfSignals: [TfId, TfSignal][];
  lastRegime: RegimeSnapshot | null;
  lastConsensus: ConsensusSignal | null;
  traceCounter: number;
}
```

### Postgres-backed implementation
- Table `dna_engine_state` (1 row, PK = 'singleton')
- `save()`: upsert full JSONB state
- `load()`: select single row

### Migration 023
```sql
CREATE TABLE IF NOT EXISTS dna_engine_state (
  id TEXT PRIMARY KEY,           -- 'singleton'
  state JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO dna_engine_state (id, state) VALUES ('singleton', '{}'::jsonb)
  ON CONFLICT (id) DO NOTHING;
```

## Acceptance Criteria
- [ ] `startDnaEngine()` gọi `stateStore.load()` trước khi bật scheduler
- [ ] `stopDnaEngine()` gọi `stateStore.save()` trước khi clear timers
- [ ] Unit test: start → emit tick → stop → start → `_lastConsensus` được hydrate
- [ ] Migration 023 áp dụng thành công (idempotent)

