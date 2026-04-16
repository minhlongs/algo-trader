/**
 * BYOK Key Custody
 * Orchestrates subscriber API-key ingestion: DEK generation, envelope wrap, D1 persistence stub.
 * Actual D1 persistence wired at Phase 03 (IronClaw). MVP: in-memory store for unit tests.
 * Audit log emitted on every unwrap (feeds Phase 03 IronClaw DLP stream).
 */

import crypto from 'crypto';
import { wrapSubscriberSecret, unwrapSubscriberSecret, type WrappedKeyBundle } from './byok-kms-wrap';

export interface StoredKeyRecord {
  id: string;
  subscriberId: string;
  did: string;
  bundle: WrappedKeyBundle;
  createdAt: number;
  updatedAt: number;
}

export interface UnwrapAuditEvent {
  id: string;
  subscriberId: string;
  did: string;
  kekVersion: number;
  action: 'unwrap';
  actorIp?: string;
  createdAt: number;
}

/** Storage adapter interface — swap in D1 adapter at Phase 03 */
export interface KeyCustodyStore {
  save(record: StoredKeyRecord): Promise<void>;
  findBySubscriber(subscriberId: string): Promise<StoredKeyRecord | null>;
  logAudit(event: UnwrapAuditEvent): Promise<void>;
}

/** In-memory store (default for MVP / unit tests) */
export class InMemoryKeyCustodyStore implements KeyCustodyStore {
  private records = new Map<string, StoredKeyRecord>();
  private auditLog: UnwrapAuditEvent[] = [];

  async save(record: StoredKeyRecord): Promise<void> {
    this.records.set(record.subscriberId, record);
  }

  async findBySubscriber(subscriberId: string): Promise<StoredKeyRecord | null> {
    return this.records.get(subscriberId) ?? null;
  }

  async logAudit(event: UnwrapAuditEvent): Promise<void> {
    this.auditLog.push(event);
  }

  /** Test helper: drain audit events */
  drainAudit(): UnwrapAuditEvent[] {
    const events = [...this.auditLog];
    this.auditLog = [];
    return events;
  }
}

/** Singleton store — override in tests via setStore() */
let _store: KeyCustodyStore = new InMemoryKeyCustodyStore();

export function setKeyCustodyStore(store: KeyCustodyStore): void {
  _store = store;
}

export function getKeyCustodyStore(): KeyCustodyStore {
  return _store;
}

/**
 * Ingest a subscriber's plaintext API key into custody.
 * Wraps it under envelope encryption and persists the bundle.
 * Returns the record ID — caller stores this for future unwrap.
 */
export async function ingestSubscriberKey(opts: {
  subscriberId: string;
  did: string;
  plaintextApiKey: string;
}): Promise<StoredKeyRecord> {
  const bundle = wrapSubscriberSecret(opts.plaintextApiKey);
  const now = Math.floor(Date.now() / 1000);

  const record: StoredKeyRecord = {
    id: crypto.randomUUID(),
    subscriberId: opts.subscriberId,
    did: opts.did,
    bundle,
    createdAt: now,
    updatedAt: now,
  };

  await _store.save(record);
  return record;
}

/**
 * Retrieve and decrypt a subscriber's API key.
 * Emits an audit event on every call — feeds IronClaw DLP.
 */
export async function retrieveSubscriberKey(opts: {
  subscriberId: string;
  actorIp?: string;
}): Promise<string> {
  const record = await _store.findBySubscriber(opts.subscriberId);
  if (!record) {
    throw new Error(`No BYOK key found for subscriber: ${opts.subscriberId}`);
  }

  const { plaintext } = unwrapSubscriberSecret(record.bundle);

  // Emit audit event (async, fire-and-forget — must not block caller)
  const audit: UnwrapAuditEvent = {
    id: crypto.randomUUID(),
    subscriberId: opts.subscriberId,
    did: record.did,
    kekVersion: record.bundle.kekVersion,
    action: 'unwrap',
    actorIp: opts.actorIp,
    createdAt: Math.floor(Date.now() / 1000),
  };
  void _store.logAudit(audit);

  return plaintext;
}

/**
 * Check whether a subscriber already has a key in custody.
 */
export async function hasSubscriberKey(subscriberId: string): Promise<boolean> {
  const record = await _store.findBySubscriber(subscriberId);
  return record !== null;
}
