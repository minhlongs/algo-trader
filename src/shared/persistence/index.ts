/**
 * Shared Persistence — barrel export
 * File-based persistence utilities (JSONL append, atomic JSON).
 */

export {
  cashclawPath,
  appendJsonl,
  readJsonl,
  writeJsonState,
  readJsonState,
} from './file-store';
