/**
 * Tests: BYOK KMS wrap/unwrap round-trip + key custody
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { wrapSubscriberSecret, unwrapSubscriberSecret, rewrapBundle } from '../../lib/byok-kms-wrap';
import {
  ingestSubscriberKey,
  retrieveSubscriberKey,
  hasSubscriberKey,
  setKeyCustodyStore,
  InMemoryKeyCustodyStore,
} from '../../lib/byok-key-custody';
import { generateDid } from '../did-binder';

describe('byok-kms-wrap — envelope encryption', () => {
  it('round-trips a subscriber secret', () => {
    const secret = 'sk-subscriber-api-key-12345';
    const bundle = wrapSubscriberSecret(secret);

    // No plaintext in bundle fields
    expect(JSON.stringify(bundle)).not.toContain(secret);

    const { plaintext } = unwrapSubscriberSecret(bundle);
    expect(plaintext).toBe(secret);
  });

  it('produces different ciphertexts for same input (random IV)', () => {
    const secret = 'same-secret';
    const b1 = wrapSubscriberSecret(secret);
    const b2 = wrapSubscriberSecret(secret);
    expect(b1.encryptedSecret).not.toBe(b2.encryptedSecret);
    expect(b1.wrappedDek).not.toBe(b2.wrappedDek);
  });

  it('fails to unwrap with tampered wrappedDek', () => {
    const bundle = wrapSubscriberSecret('secret');
    const tampered = { ...bundle, wrappedDek: Buffer.alloc(32).toString('base64') };
    expect(() => unwrapSubscriberSecret(tampered)).toThrow();
  });

  it('fails to unwrap with tampered encryptedSecret', () => {
    const bundle = wrapSubscriberSecret('secret');
    const tampered = { ...bundle, encryptedSecret: Buffer.alloc(32).toString('base64') };
    expect(() => unwrapSubscriberSecret(tampered)).toThrow();
  });

  it('rewraps DEK under new KEK version preserving plaintext', () => {
    const secret = 'rewrap-test-secret';
    const bundle = wrapSubscriberSecret(secret);

    // Simulate rotation: same key material but new version label
    const currentKekHex = process.env.CITADEL_KEK_HEX ?? 'dev0000000000000000000000000000000000000000000000000000000000000'.slice(0, 64);
    const newKek = { version: 2, keyHex: currentKekHex };
    const rewrapped = rewrapBundle(bundle, currentKekHex, newKek);

    expect(rewrapped.kekVersion).toBe(2);
    // Must still decrypt correctly when we override version check
    const restored = unwrapSubscriberSecret({ ...rewrapped, kekVersion: 1 });
    expect(restored.plaintext).toBe(secret);
  });
});

describe('byok-key-custody — in-memory store', () => {
  let store: InMemoryKeyCustodyStore;

  beforeEach(() => {
    store = new InMemoryKeyCustodyStore();
    setKeyCustodyStore(store);
  });

  it('ingests and retrieves a subscriber key', async () => {
    const { did } = generateDid();
    const subscriberId = 'sub-custody-001';
    const plaintext = 'exchange-api-key-abc';

    await ingestSubscriberKey({ subscriberId, did, plaintextApiKey: plaintext });
    const retrieved = await retrieveSubscriberKey({ subscriberId });

    expect(retrieved).toBe(plaintext);
  });

  it('emits an audit event on every unwrap', async () => {
    const { did } = generateDid();
    const subscriberId = 'sub-audit-001';

    await ingestSubscriberKey({ subscriberId, did, plaintextApiKey: 'key-to-audit' });
    await retrieveSubscriberKey({ subscriberId, actorIp: '1.2.3.4' });

    const events = store.drainAudit();
    expect(events).toHaveLength(1);
    expect(events[0]!.action).toBe('unwrap');
    expect(events[0]!.actorIp).toBe('1.2.3.4');
    expect(events[0]!.subscriberId).toBe(subscriberId);
  });

  it('returns false for unknown subscriber hasKey check', async () => {
    const has = await hasSubscriberKey('nonexistent-sub');
    expect(has).toBe(false);
  });

  it('returns true after ingest', async () => {
    const { did } = generateDid();
    const subscriberId = 'sub-has-001';
    await ingestSubscriberKey({ subscriberId, did, plaintextApiKey: 'key' });
    expect(await hasSubscriberKey(subscriberId)).toBe(true);
  });

  it('throws when retrieving key for unknown subscriber', async () => {
    await expect(retrieveSubscriberKey({ subscriberId: 'ghost' })).rejects.toThrow(
      /No BYOK key found/,
    );
  });
});
