/**
 * Deterministic ClientOrderId & EIP-712 Salt Derivation with Restart-Safe Deduplication.
 *
 * Uses SHA-256 over canonical order-intent fields so retries after network
 * timeouts or restarts derive the exact same `clientOrderId` and `salt`.
 */

import { createHash } from 'node:crypto';

export interface DeterministicOrderIdInput {
  strategyId: string;
  marketId: string;
  tokenId: string;
  side: 'BUY' | 'SELL';
  priceMicro: number;
  sizeMicro: number;
  intentEpochMs: number;
  sequence: number;
}

export interface ClientOrderIdEntry {
  clientOrderId: string;
  salt: string;
  input: DeterministicOrderIdInput;
  createdAtMs: number;
  attempts: number;
}

export interface ClientOrderIdRegisterResult {
  clientOrderId: string;
  salt: string;
  isDuplicate: boolean;
  attempts: number;
}

export interface ClientOrderIdRegistrySnapshot {
  entries: ClientOrderIdEntry[];
}

function assertNonEmpty(label: string, value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new Error(`DeterministicOrderIdInput.${label} must be non-empty`);
  return trimmed;
}

function assertNonNegativeSafeInt(label: string, value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`DeterministicOrderIdInput.${label} must be a non-negative safe integer; got ${value}`);
  }
  return value;
}

function computeCanonicalDigestHex(input: DeterministicOrderIdInput): string {
  if (input.side !== 'BUY' && input.side !== 'SELL') {
    throw new Error('DeterministicOrderIdInput.side must be BUY or SELL');
  }
  const canonical = JSON.stringify([
    assertNonEmpty('strategyId', input.strategyId),
    assertNonEmpty('marketId', input.marketId),
    assertNonEmpty('tokenId', input.tokenId),
    input.side,
    assertNonNegativeSafeInt('priceMicro', input.priceMicro),
    assertNonNegativeSafeInt('sizeMicro', input.sizeMicro),
    assertNonNegativeSafeInt('intentEpochMs', input.intentEpochMs),
    assertNonNegativeSafeInt('sequence', input.sequence),
  ]);
  return createHash('sha256').update(canonical).digest('hex');
}

/** Derives a stable `poly_<32hex>` clientOrderId from canonical intent fields. */
export function deriveDeterministicClientOrderId(input: DeterministicOrderIdInput): string {
  return `poly_${computeCanonicalDigestHex(input).slice(0, 32)}`;
}

/** Derives a stable 128-bit unsigned decimal salt string for EIP-712 ExchangeV3 orders. */
export function deriveDeterministicOrderSalt(input: DeterministicOrderIdInput): string {
  return BigInt(`0x${computeCanonicalDigestHex(input).slice(32, 64)}`).toString(10);
}

/** Idempotency registry for deterministic clientOrderIds with restart-safe snapshots. */
export class ClientOrderIdRegistry {
  private readonly entries = new Map<string, ClientOrderIdEntry>();

  register(input: DeterministicOrderIdInput, nowMs: number = Date.now()): ClientOrderIdRegisterResult {
    const clientOrderId = deriveDeterministicClientOrderId(input);
    const existing = this.entries.get(clientOrderId);
    if (existing) {
      existing.attempts += 1;
      return { clientOrderId: existing.clientOrderId, salt: existing.salt, isDuplicate: true, attempts: existing.attempts };
    }
    const salt = deriveDeterministicOrderSalt(input);
    this.entries.set(clientOrderId, { clientOrderId, salt, input: { ...input }, createdAtMs: nowMs, attempts: 1 });
    return { clientOrderId, salt, isDuplicate: false, attempts: 1 };
  }

  has(clientOrderId: string): boolean { return this.entries.has(clientOrderId); }

  get(clientOrderId: string): ClientOrderIdEntry | undefined {
    const entry = this.entries.get(clientOrderId);
    return entry ? { ...entry, input: { ...entry.input } } : undefined;
  }

  size(): number { return this.entries.size; }

  serialize(): ClientOrderIdRegistrySnapshot {
    return { entries: Array.from(this.entries.values()).map((e) => ({ ...e, input: { ...e.input } })) };
  }

  hydrate(snapshot: ClientOrderIdRegistrySnapshot): void {
    this.entries.clear();
    for (const entry of snapshot.entries ?? []) {
      const expectedId = deriveDeterministicClientOrderId(entry.input);
      const expectedSalt = deriveDeterministicOrderSalt(entry.input);
      if (entry.clientOrderId !== expectedId || entry.salt !== expectedSalt) {
        throw new Error(`Corrupted ClientOrderIdRegistry entry for ${entry.clientOrderId}`);
      }
      this.entries.set(entry.clientOrderId, { ...entry, input: { ...entry.input } });
    }
  }
}
