/**
 * Provenance — public barrel export.
 */

export {
  writeRunCard,
  renderMarkdown,
  canonicaliseConfig,
  hashConfig,
  RUN_CARD_SCHEMA_VERSION,
} from './run-card';
export type {
  RunCard,
  WriteRunCardInput,
  ResultClass,
  ResultClassName,
  DataSourceProvenance,
  GateResult,
} from './run-card';

export {
  appendLedgerRecord,
  readLedgerRecords,
  verifyLedgerChain,
  DEFAULT_LEDGER_PATH,
} from './research-ledger';
export type { LedgerRecord, LedgerWriteResult } from './research-ledger';
