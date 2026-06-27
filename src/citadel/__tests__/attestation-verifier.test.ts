/**
 * Tests: attestation verifier — happy path + tampered cases
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { generateDid } from '../did-binder';
import { computeMeasurement } from '../measurement-hasher';
import { issueAttestationQuote } from '../quote-simulator';
import { verifyAttestation } from '../attestation-verifier';

const AGENT_ID = 'test-agent-v1';

describe('attestation-verifier', () => {
  let did: string;
  let measurementHash: string;
  let subscriberId: string;

  beforeEach(() => {
    subscriberId = 'sub-test-001';
    did = generateDid().did;
    measurementHash = computeMeasurement({ agentIdentifier: AGENT_ID }).hash;
  });

  it('verifies a valid attestation JWT', async () => {
    const quote = await issueAttestationQuote({ subscriberId, did, measurementHash });
    const result = await verifyAttestation({ jwt: quote.jwt, expectedDid: did });
    expect(result.valid).toBe(true);
    expect(result.payload?.did).toBe(did);
    expect(result.payload?.sub).toBe(subscriberId);
  });

  it('verifies measurement re-check (happy path)', async () => {
    const quote = await issueAttestationQuote({ subscriberId, did, measurementHash });
    const result = await verifyAttestation({
      jwt: quote.jwt,
      expectedDid: did,
      measurementInput: { agentIdentifier: AGENT_ID },
    });
    expect(result.valid).toBe(true);
  });

  it('rejects tampered JWT signature', async () => {
    const quote = await issueAttestationQuote({ subscriberId, did, measurementHash });
    const parts = quote.jwt.split('.');
    // Corrupt the signature
    const tampered = `${parts[0]}.${parts[1]}.invalidsignature`;
    const result = await verifyAttestation({ jwt: tampered, expectedDid: did });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/JWT verification failed/);
  });

  it('rejects DID mismatch', async () => {
    const quote = await issueAttestationQuote({ subscriberId, did, measurementHash });
    const wrongDid = generateDid().did;
    const result = await verifyAttestation({ jwt: quote.jwt, expectedDid: wrongDid });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/DID mismatch/);
  });

  it('rejects stale attestation beyond maxAgeSeconds', async () => {
    const quote = await issueAttestationQuote({ subscriberId, did, measurementHash });
    // maxAgeSeconds=0 forces immediate expiry
    const result = await verifyAttestation({
      jwt: quote.jwt,
      expectedDid: did,
      maxAgeSeconds: 0,
    });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/too old/);
  });

  it('rejects wrong measurement', async () => {
    const quote = await issueAttestationQuote({ subscriberId, did, measurementHash });
    const result = await verifyAttestation({
      jwt: quote.jwt,
      expectedDid: did,
      measurementInput: { agentIdentifier: 'wrong-agent-id' },
    });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/Measurement mismatch/);
  });
});
