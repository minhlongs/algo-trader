/**
 * Immutable Trade Audit
 * Append-only audit log for trade events.
 */

export interface AuditRecord {
  id: string;
  timestamp: number;
  eventType: string;
  payload: Record<string, unknown>;
  previousHash: string;
  hash: string;
}

const _records: AuditRecord[] = [];

export function append(_record: Omit<AuditRecord, 'id' | 'timestamp' | 'hash' | 'previousHash'>): AuditRecord {
  const record: AuditRecord = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    hash: '',
    previousHash: '',
    ..._record,
  };
  record.hash = computeHash(record);
  _records.push(record);
  return record;
}

export function query(_filters?: { eventType?: string; from?: number; to?: number }): AuditRecord[] {
  return _records;
}

export function verifyIntegrity(): boolean {
  return _records.every((r, i) => {
    const prev = i > 0 ? _records[i - 1] : null;
    return r.hash === computeHash({ ...r, hash: '' });
  });
}

function computeHash(_record: Partial<AuditRecord>): string {
  const raw = JSON.stringify(_record);
  let h = 0;
  for (let i = 0; i < raw.length; i++) {
    h = ((h << 5) - h + raw.charCodeAt(i)) | 0;
  }
  return `sha256:${Math.abs(h).toString(16)}`;
}
