/**
 * Citadel Protocol — barrel export
 * Phase 01 MVP: attestation stub + BYOK KMS wrap
 */

export { computeMeasurement, verifyMeasurement } from './measurement-hasher';
export type { Measurement, MeasurementInput } from './measurement-hasher';

export { generateDid, resolveDid } from './did-binder';
export type { DidKeyPair, DidDocument } from './did-binder';

export { issueAttestationQuote, verifyAttestationJwt, currentCitadelMode } from './quote-simulator';
export type { AttestationQuote, QuotePayload, CitadelMode } from './quote-simulator';

export { verifyAttestation } from './attestation-verifier';
export type { VerifyAttestationOpts, AttestationVerifyResult } from './attestation-verifier';
