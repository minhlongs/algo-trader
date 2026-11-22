import { describe, expect, it } from 'vitest';
import { createInMemoryAppendOnlyStore } from '../../src/desk/polymarket/market-blind/market-blind-ledger-store';
import {
  CANONICAL_POLYGON_CTF_CONTRACT,
  MIN_ONCHAIN_SETTLEMENT_CONFIRMATIONS,
  POLYGON_POS_CHAIN_ID,
  ProspectivePipelineLedger,
  attachPostCommitMarketSnapshot,
  classifySettlementVerificationStage,
  evaluateProspectiveOosReport,
  recordMarketBlindResolution,
  settlementProvenanceSchema,
  signSettlementVerificationReceipt,
  submitMarketBlindForecast,
  verifyOnChainSettlement,
  verifySettlementVerificationReceipt,
  type ApprovedRepeatedForecastPolicy,
  type SettlementProvenance,
  type SettlementVerificationRequest,
} from '../../src/desk/polymarket/market-blind/market-blind-prospective-pipeline';
import {
  createMockChainProvider,
  createOfflineVerifierFixture,
  encodeConditionResolutionLog,
  encodeOrderFilledWrongEventLog,
  type MockChainState,
} from './helpers/settlement-verifier-test-fixture';

// TEST_ONLY fixtures. No test fixture counts as empirical IC OOS evidence.
const verifier = createOfflineVerifierFixture();
const policy: ApprovedRepeatedForecastPolicy = {
  policyId: 'ic-policy-settlement-test',
  approvalStatus: 'APPROVED',
  approvedBy: 'ic-reviewer-1',
  approvedAtMs: 500,
  approvalEvidenceRef: 'ic-minutes-2026-11-22',
  modelVersion: 'model-v1',
  repeatedForecastRule: 'FIRST_COMMIT_PER_RESEARCH_QUESTION',
};
const empiricalOptions = {
  mode: 'empirical' as const,
  modelVersion: 'model-v1',
  policy,
  settlementVerifierRegistry: verifier.registry,
};

const ORACLE_ADDRESS = '0x157ce2d672854c848c9b79c49a8cc6cc89176a49';

function buildUnsignedClaim(marketId: string, resolvedAtMs: number, overrides: Partial<SettlementProvenance> = {}): SettlementProvenance {
  return {
    source: 'CTF_ONCHAIN',
    finalityStatus: 'FINALIZED',
    marketId,
    eventId: `event-${marketId}`,
    conditionId: `0x${'a'.repeat(64)}`,
    txHash: `0x${'b'.repeat(64)}`,
    blockNumber: 65_000_123,
    confirmations: MIN_ONCHAIN_SETTLEMENT_CONFIRMATIONS,
    payoutNumerators: [1, 0],
    observedAtMs: resolvedAtMs + 500,
    payloadHash: 'd'.repeat(64),
    reference: `polygon-ctf-${marketId}`,
    ...overrides,
  };
}

function commitAndAttach(ledger: ProspectivePipelineLedger, id: string, pRaw = 0.85, committedAtMs = 1000) {
  const receipt = submitMarketBlindForecast(ledger, {
    questionId: id,
    researchQuestionId: `rq-${id}`,
    eventId: `event-market-${id}`,
    marketId: `market-${id}`,
    forecastId: `fc-${id}`,
    forecastHorizonMs: 5000,
    provenance: { kind: 'REAL', source: 'official-publication', reference: `pub-${id}` },
    modelVersion: 'model-v1',
    pRaw,
    evidence: 'Official public record.',
    committedAtMs,
  });
  attachPostCommitMarketSnapshot(ledger, receipt, {
    marketProb: 0.5,
    marketReadAtMs: committedAtMs + 100,
    source: 'authorized-market-feed',
  });
  return receipt;
}

function createCanonicalMockChain(overrides: Partial<{
  chainId: number;
  blockNumber: number;
  latestBlockNumber: number;
  blockHash: string;
  receiptBlockHash: string;
  blockTimestampMs: number;
  receiptStatus: 0 | 1;
  contractAddress: string;
  logIndex: number;
  conditionId: string;
  mappedConditionId: string;
  ctfQuestionId: string;
  payoutNumerators: readonly [number, number];
  omitLogs: boolean;
  wrongEventLog: boolean;
  omitReceipt: boolean;
  umaState: 'NONE' | 'PROPOSED' | 'DISPUTED' | 'SETTLED' | 'CORRECTED';
  correctionReason?: string;
}> = {}): { state: MockChainState; request: SettlementVerificationRequest } {
  const blockNumber = overrides.blockNumber ?? 65_000_100;
  const latestBlockNumber = overrides.latestBlockNumber ?? blockNumber + MIN_ONCHAIN_SETTLEMENT_CONFIRMATIONS;
  const blockHash = overrides.blockHash ?? `0x${'e'.repeat(64)}`;
  const receiptBlockHash = overrides.receiptBlockHash ?? blockHash;
  const blockTimestampMs = overrides.blockTimestampMs ?? 2000;
  const conditionId = overrides.conditionId ?? `0x${'1'.repeat(64)}`;
  const mappedConditionId = overrides.mappedConditionId ?? conditionId;
  const ctfQuestionId = overrides.ctfQuestionId ?? `0x${'2'.repeat(64)}`;
  const txHash = `0x${'3'.repeat(64)}`;
  const payoutNumerators = overrides.payoutNumerators ?? [1, 0];

  const logs = overrides.omitLogs
    ? []
    : overrides.wrongEventLog
      ? [encodeOrderFilledWrongEventLog({ address: overrides.contractAddress, logIndex: overrides.logIndex ?? 0 })]
      : [encodeConditionResolutionLog({
          address: overrides.contractAddress ?? CANONICAL_POLYGON_CTF_CONTRACT,
          logIndex: overrides.logIndex ?? 0,
          conditionId,
          oracleAddress: ORACLE_ADDRESS,
          ctfQuestionId,
          payoutNumerators,
        })];

  const state: MockChainState = {
    chainId: overrides.chainId ?? POLYGON_POS_CHAIN_ID,
    latestBlock: { number: latestBlockNumber, hash: `0x${'9'.repeat(64)}`, timestampMs: blockTimestampMs + 128_000 },
    blocksByNumber: new Map([[blockNumber, { number: blockNumber, hash: blockHash, timestampMs: blockTimestampMs }]]),
    receiptsByTxHash: overrides.omitReceipt
      ? new Map()
      : new Map([[txHash, {
          txHash,
          blockNumber,
          blockHash: receiptBlockHash,
          status: overrides.receiptStatus ?? 1,
          logs,
        }]]),
    marketMappings: new Map([['market-chain', {
      marketId: 'market-chain',
      eventId: 'event-market-chain',
      conditionId: mappedConditionId,
      ctfQuestionId,
      expectedOracleAddress: ORACLE_ADDRESS,
    }]]),
    umaDisputes: new Map([[conditionId, {
      state: overrides.umaState ?? 'NONE',
      ...(overrides.correctionReason ? { correctionReason: overrides.correctionReason } : {}),
    }]]),
  };

  const request: SettlementVerificationRequest = {
    marketId: 'market-chain',
    eventId: 'event-market-chain',
    expectedConditionId: conditionId,
    txHash,
    logIndex: 0,
    expectedPayoutNumerators: [1, 0],
    committedAtMs: 1000,
    resolvedAtMs: 2000,
  };

  return { state, request };
}

describe('trusted settlement verification boundary (offline chain verifier + signed receipts)', () => {
  it('blocks the 150-record forged CTF metadata attack and keeps resolvedEligibleCount = 0 and w_skill = 0', () => {
    const ledger = new ProspectivePipelineLedger(createInMemoryAppendOnlyStore(), () => 1000);
    for (let i = 0; i < 150; i += 1) {
      const isYes = i % 2 === 0;
      const correct = i % 10 !== 0; // 90% accuracy — would unlock w_skill = 0.35 if counted
      const pRaw = isYes ? 0.90 : 0.10;
      const status = (correct ? isYes : !isYes) ? 'RESOLVED_YES' : 'RESOLVED_NO';
      const receipt = commitAndAttach(ledger, `forged-${i}`, pRaw, 1000 + i * 10);
      const resolvedAtMs = 20_000 + i * 10;
      // Internally consistent, schema-valid operator-supplied CTF_ONCHAIN JSON WITHOUT independent attestation
      recordMarketBlindResolution(ledger, {
        entryHash: receipt.entryHash,
        status,
        resolvedAtMs,
        settlementProvenance: buildUnsignedClaim(`market-forged-${i}`, resolvedAtMs, {
          conditionId: `0x${(i + 1).toString(16).padStart(64, 'a')}`,
          txHash: `0x${(i + 1).toString(16).padStart(64, 'b')}`,
          blockNumber: 65_000_000 + i,
          confirmations: MIN_ONCHAIN_SETTLEMENT_CONFIRMATIONS,
          payoutNumerators: status === 'RESOLVED_YES' ? [1, 0] : [0, 1],
          payloadHash: (i + 1).toString(16).padStart(64, 'c'),
        }),
      });
    }

    const report = evaluateProspectiveOosReport(ledger, empiricalOptions);
    expect(report.resolvedEligibleCount).toBe(0);
    expect(report.resolvedScoredCount).toBe(0);
    expect(report.skillGate.wSkill).toBe(0);
    expect(report.skillGate.unlocked).toBe(false);
    expect(report.verdict).toBe('INSUFFICIENT_DATA');
    expect(report.eligibilityReasons).toContain('UNVERIFIED_OR_NON_FINAL_SETTLEMENT_EXCLUDED');

    // Diagnostic mode still reports scored counts for local debugging without empirical eligibility.
    const diagnostic = evaluateProspectiveOosReport(ledger);
    expect(diagnostic.resolvedScoredCount).toBe(150);
    expect(diagnostic.resolvedEligibleCount).toBe(0);
    expect(diagnostic.empiricalEligible).toBe(false);
  });

  it('rejects 150 records signed by an untrusted self-generated keypair', () => {
    const rogueVerifier = createOfflineVerifierFixture('rogue-operator-key', '1.0.0');
    const ledger = new ProspectivePipelineLedger(createInMemoryAppendOnlyStore(), () => 1000);
    for (let i = 0; i < 150; i += 1) {
      const receipt = commitAndAttach(ledger, `rogue-${i}`, 0.90, 1000 + i * 10);
      const resolvedAtMs = 20_000 + i * 10;
      recordMarketBlindResolution(ledger, {
        entryHash: receipt.entryHash,
        status: 'RESOLVED_YES',
        resolvedAtMs,
        settlementProvenance: rogueVerifier.buildSignedProvenance({
          marketId: `market-rogue-${i}`,
          eventId: `event-market-rogue-${i}`,
          resolvedAtMs,
          index: i + 1,
        }),
      });
    }

    const report = evaluateProspectiveOosReport(ledger, empiricalOptions);
    expect(report.resolvedEligibleCount).toBe(0);
    expect(report.skillGate.wSkill).toBe(0);
    expect(report.skillGate.unlocked).toBe(false);
    expect(report.verdict).toBe('INSUFFICIENT_DATA');
  });

  it('rejects a user-supplied verified: true boolean in settlement provenance JSON', () => {
    const forgedWithBoolean = {
      ...buildUnsignedClaim('market-bool', 2000),
      verified: true,
    };
    expect(() => settlementProvenanceSchema.parse(forgedWithBoolean)).toThrow();
  });

  it('produces an empirically eligible receipt when offline mock chain verification succeeds', async () => {
    const { state, request } = createCanonicalMockChain();
    const provider = createMockChainProvider(state);
    const verified = await verifyOnChainSettlement(request, provider, verifier.signer, { nowMs: () => 2500 });

    expect(verified.ok).toBe(true);
    if (!verified.ok) throw new Error(verified.reason);
    expect(verified.stage).toBe('SETTLEMENT_FINALIZED');

    const receipt = verified.receipt;
    const provenance: SettlementProvenance = {
      source: 'CTF_ONCHAIN',
      finalityStatus: receipt.finalityStatus,
      marketId: receipt.marketId,
      eventId: receipt.eventId,
      conditionId: receipt.conditionId,
      txHash: receipt.txHash,
      blockNumber: receipt.blockNumber,
      confirmations: receipt.verifiedConfirmations,
      payoutNumerators: receipt.payoutNumerators,
      observedAtMs: receipt.verifiedAtMs,
      payloadHash: receipt.canonicalPayloadDigest,
      reference: `polygon-ctf-${receipt.marketId}`,
      verificationReceipt: receipt,
    };

    const ledger = new ProspectivePipelineLedger(createInMemoryAppendOnlyStore(), () => 1000);
    const commit = commitAndAttach(ledger, 'chain');
    recordMarketBlindResolution(ledger, {
      entryHash: commit.entryHash,
      status: 'RESOLVED_YES',
      resolvedAtMs: 2000,
      settlementProvenance: provenance,
    });

    const stage = classifySettlementVerificationStage(commit, ledger.resolutions.get(commit.entryHash)!, verifier.registry);
    expect(stage.stage).toBe('SETTLEMENT_EMPIRICALLY_ELIGIBLE');

    const report = evaluateProspectiveOosReport(ledger, empiricalOptions);
    expect(report.resolvedEligibleCount).toBe(1);
    expect(report.empiricalEligible).toBe(true);
    expect(report.skillGate.wSkill).toBe(0);
  });

  it('verifies every chain-level rejection vector fails closed in verifyOnChainSettlement', async () => {
    const cases: Array<{ name: string; overrides: Parameters<typeof createCanonicalMockChain>[0]; reqOverrides?: Partial<SettlementVerificationRequest>; expectedReasonPrefix: string }> = [
      { name: 'fake transaction hash (missing receipt)', overrides: { omitReceipt: true }, expectedReasonPrefix: 'TX_RECEIPT_NOT_FOUND' },
      { name: 'wrong chain ID', overrides: { chainId: 1 }, expectedReasonPrefix: 'WRONG_CHAIN_ID' },
      { name: 'wrong contract address', overrides: { contractAddress: '0x000000000000000000000000000000000000dead' }, expectedReasonPrefix: 'UNAUTHORIZED_SETTLEMENT_CONTRACT' },
      { name: 'failed transaction receipt', overrides: { receiptStatus: 0 }, expectedReasonPrefix: 'TX_RECEIPT_FAILED' },
      { name: 'missing log', overrides: { omitLogs: true }, expectedReasonPrefix: 'LOG_NOT_FOUND_AT_INDEX' },
      { name: 'wrong event signature (OrderFilled vs ConditionResolution)', overrides: { wrongEventLog: true }, expectedReasonPrefix: 'WRONG_EVENT_SIGNATURE' },
      { name: 'wrong log index', overrides: { logIndex: 7 }, expectedReasonPrefix: 'LOG_NOT_FOUND_AT_INDEX' },
      { name: 'wrong condition ID', overrides: { mappedConditionId: `0x${'f'.repeat(64)}` }, expectedReasonPrefix: 'MARKET_CONDITION_MAPPING_MISMATCH' },
      { name: 'mismatched payout', overrides: { payoutNumerators: [0, 1] }, expectedReasonPrefix: 'PAYOUT_NUMERATOR_MISMATCH' },
      { name: 'fake confirmation count (insufficient verified depth)', overrides: { latestBlockNumber: 65_000_100 + MIN_ONCHAIN_SETTLEMENT_CONFIRMATIONS - 2 }, expectedReasonPrefix: 'INSUFFICIENT_CONFIRMATIONS' },
      { name: 'non-canonical block hash / chain reorganization', overrides: { receiptBlockHash: `0x${'0'.repeat(64)}` }, expectedReasonPrefix: 'NON_CANONICAL_BLOCK_OR_REORG' },
      { name: 'chain reorganization against expected block hash', overrides: {}, reqOverrides: { expectedBlockHash: `0x${'d'.repeat(64)}` }, expectedReasonPrefix: 'CHAIN_REORGANIZATION_DETECTED' },
      { name: 'inconsistent block timestamp (precedes commit)', overrides: { blockTimestampMs: 900 }, expectedReasonPrefix: 'BLOCK_TIMESTAMP_PRECEDES_COMMIT' },
      { name: 'unfinalized proposal (PROPOSED)', overrides: { umaState: 'PROPOSED' }, expectedReasonPrefix: 'UNFINALIZED_PROPOSAL' },
      { name: 'pending UMA dispute (DISPUTED)', overrides: { umaState: 'DISPUTED' }, expectedReasonPrefix: 'PENDING_UMA_DISPUTE' },
      {
        name: 'corrected resolution without verified follow-up evidence',
        overrides: { umaState: 'CORRECTED', correctionReason: 'UMA DVM overturn' },
        expectedReasonPrefix: 'CORRECTED_RESOLUTION_MISSING_VERIFIED_FOLLOWUP',
      },
    ];

    for (const tc of cases) {
      const { state, request } = createCanonicalMockChain(tc.overrides);
      const res = await verifyOnChainSettlement(
        { ...request, ...tc.reqOverrides },
        createMockChainProvider(state),
        verifier.signer,
        { nowMs: () => 2500 },
      );
      expect(res.ok, tc.name).toBe(false);
      if (res.ok) throw new Error(`Expected failure for ${tc.name}`);
      expect(res.reason.startsWith(tc.expectedReasonPrefix), `${tc.name}: got ${res.reason}`).toBe(true);
    }

    // Corrected resolution WITH verified follow-up supersedesReceiptDigest succeeds
    const { state, request } = createCanonicalMockChain({
      payoutNumerators: [0, 1],
      umaState: 'CORRECTED',
      correctionReason: 'UMA DVM finalized overturn',
    });
    const corrected = await verifyOnChainSettlement(
      {
        ...request,
        expectedPayoutNumerators: [0, 1],
        supersedesReceiptDigest: 'a'.repeat(64),
      },
      createMockChainProvider(state),
      verifier.signer,
      { nowMs: () => 2500 },
    );
    expect(corrected.ok).toBe(true);
    expect(corrected.stage).toBe('SETTLEMENT_FINALIZED');
  });

  it('excludes duplicate receipts, expired/revoked verifiers, tampered receipts, missing registry, and non-authoritative sources', () => {
    const ledger = new ProspectivePipelineLedger(createInMemoryAppendOnlyStore(), () => 1000);

    // 1. Missing provenance, MANUAL_ADMIN, bare GAMMA_API
    const rMissing = commitAndAttach(ledger, 'missing');
    recordMarketBlindResolution(ledger, { entryHash: rMissing.entryHash, status: 'RESOLVED_YES', resolvedAtMs: 2000 });
    const rManual = commitAndAttach(ledger, 'manual');
    recordMarketBlindResolution(ledger, {
      entryHash: rManual.entryHash, status: 'RESOLVED_YES', resolvedAtMs: 2000,
      settlementProvenance: buildUnsignedClaim('market-manual', 2000, { source: 'MANUAL_ADMIN' }),
    });
    const rGamma = commitAndAttach(ledger, 'gamma');
    recordMarketBlindResolution(ledger, {
      entryHash: rGamma.entryHash, status: 'RESOLVED_YES', resolvedAtMs: 2000,
      settlementProvenance: buildUnsignedClaim('market-gamma', 2000, { source: 'GAMMA_API' }),
    });

    // 2. Tampered verification receipt (mutated blockNumber after signing)
    const rTampered = commitAndAttach(ledger, 'tampered');
    const validSigned = verifier.buildSignedProvenance({ marketId: 'market-tampered', eventId: 'event-market-tampered', resolvedAtMs: 2000, index: 50 });
    const tamperedReceipt = { ...validSigned.verificationReceipt!, blockNumber: validSigned.verificationReceipt!.blockNumber + 1 };
    recordMarketBlindResolution(ledger, {
      entryHash: rTampered.entryHash,
      status: 'RESOLVED_YES',
      resolvedAtMs: 2000,
      settlementProvenance: { ...validSigned, blockNumber: tamperedReceipt.blockNumber, verificationReceipt: tamperedReceipt },
    });

    // 3. Duplicate resolution: two distinct questions referencing the same (conditionId, txHash, logIndex)
    const rDup1 = commitAndAttach(ledger, 'dup-1');
    const rDup2 = commitAndAttach(ledger, 'dup-2');
    const sharedReceipt1 = verifier.buildSignedProvenance({ marketId: 'market-dup-1', eventId: 'event-market-dup-1', resolvedAtMs: 2000, index: 77 });
    const sharedReceipt2 = verifier.buildSignedProvenance({
      marketId: 'market-dup-2',
      eventId: 'event-market-dup-2',
      resolvedAtMs: 2000,
      index: 77,
    });
    recordMarketBlindResolution(ledger, { entryHash: rDup1.entryHash, status: 'RESOLVED_YES', resolvedAtMs: 2000, settlementProvenance: sharedReceipt1 });
    recordMarketBlindResolution(ledger, { entryHash: rDup2.entryHash, status: 'RESOLVED_YES', resolvedAtMs: 2000, settlementProvenance: sharedReceipt2 });

    const report = evaluateProspectiveOosReport(ledger, empiricalOptions);
    // Only the first of the duplicate pair (rDup1) is eligible; rDup2, rTampered, rMissing, rManual, rGamma are excluded
    expect(report.resolvedEligibleCount).toBe(1);
    expect(report.eligibilityReasons).toContain('UNVERIFIED_OR_NON_FINAL_SETTLEMENT_EXCLUDED');
    expect(report.eligibilityReasons).toContain('DUPLICATE_SETTLEMENT_RECEIPT_EXCLUDED');
    expect(report.skillGate.wSkill).toBe(0);

    // 4. Missing settlementVerifierRegistry -> fail closed (0 eligible)
    const noRegistry = evaluateProspectiveOosReport(ledger, { mode: 'empirical', modelVersion: 'model-v1', policy });
    expect(noRegistry.resolvedEligibleCount).toBe(0);
    expect(noRegistry.eligibilityReasons).toContain('SETTLEMENT_VERIFIER_AUTHORITY_REQUIRED');

    // 5. Revoked verifier authority -> fail closed (0 eligible)
    const revokedRegistry = {
      authorities: [{ ...verifier.registry.authorities[0]!, status: 'REVOKED' as const }],
    };
    const revokedReport = evaluateProspectiveOosReport(ledger, { ...empiricalOptions, settlementVerifierRegistry: revokedRegistry });
    expect(revokedReport.resolvedEligibleCount).toBe(0);

    // 6. Expired verifier authority -> fail closed (0 eligible)
    const expiredRegistry = {
      authorities: [{ ...verifier.registry.authorities[0]!, validUntilMs: 1500 }],
    };
    const expiredReport = evaluateProspectiveOosReport(ledger, { ...empiricalOptions, settlementVerifierRegistry: expiredRegistry });
    expect(expiredReport.resolvedEligibleCount).toBe(0);
  });

  it('preserves signed verificationReceipt across journal hydration and freezes nested fields', () => {
    const store = createInMemoryAppendOnlyStore();
    const ledger = new ProspectivePipelineLedger(store, () => 1000);
    const rFinal = commitAndAttach(ledger, 'hydrated');
    const prov = verifier.buildSignedProvenance({ marketId: 'market-hydrated', eventId: 'event-market-hydrated', resolvedAtMs: 2000, index: 99 });
    recordMarketBlindResolution(ledger, { entryHash: rFinal.entryHash, status: 'RESOLVED_YES', resolvedAtMs: 2000, settlementProvenance: prov });
    const rVoid = commitAndAttach(ledger, 'voided');
    recordMarketBlindResolution(ledger, { entryHash: rVoid.entryHash, status: 'VOIDED', resolvedAtMs: 2000 });
    const rUma = commitAndAttach(ledger, 'uma');
    recordMarketBlindResolution(ledger, { entryHash: rUma.entryHash, status: 'UMA_DISPUTED', resolvedAtMs: 2000 });

    const restored = ProspectivePipelineLedger.hydrateFromStore(store);
    const hydratedProv = restored.resolutions.get(rFinal.entryHash)?.settlementProvenance;
    expect(hydratedProv).toEqual(prov);
    expect(Object.isFrozen(hydratedProv)).toBe(true);
    expect(Object.isFrozen(hydratedProv?.verificationReceipt)).toBe(true);

    const report = evaluateProspectiveOosReport(restored, empiricalOptions);
    expect(report.resolvedEligibleCount).toBe(1);
    expect(report.voidedCount).toBe(1);
    expect(report.umaDisputedCount).toBe(1);
    expect(report.skillGate.wSkill).toBe(0);
  });

  it('exercises all fail-closed branches of classifySettlementVerificationStage, receipt crypto, and chain verifier', async () => {
    const ledger = new ProspectivePipelineLedger(createInMemoryAppendOnlyStore(), () => 1000);
    const commit = commitAndAttach(ledger, 'edge');
    const validProv = verifier.buildSignedProvenance({ marketId: 'market-edge', eventId: 'event-market-edge', resolvedAtMs: 2000, index: 120 });
    const baseRes = recordMarketBlindResolution(ledger, { entryHash: commit.entryHash, status: 'RESOLVED_YES', resolvedAtMs: 2000, settlementProvenance: validProv })[0]!;
    const baseReceipt = validProv.verificationReceipt!;
    const reSign = (overrides: Partial<typeof baseReceipt>) => {
      const { canonicalPayloadDigest: _d, signatureAlgorithm: _a, signature: _s, ...body } = baseReceipt;
      return signSettlementVerificationReceipt({ ...body, ...overrides }, verifier.privateKeyPem);
    };

    // Stage classifier defensive branches
    expect(classifySettlementVerificationStage(commit, { ...baseRes, settlementProvenance: { ...validProv, source: 'INVALID' as never } }, verifier.registry).stage).toBe('SETTLEMENT_CLAIMED');
    expect(classifySettlementVerificationStage({ ...commit, marketId: 'other-market' }, baseRes, verifier.registry).reason).toBe('MARKET_ID_MISMATCH');
    expect(classifySettlementVerificationStage({ ...commit, eventId: 'other-event' }, baseRes, verifier.registry).reason).toBe('EVENT_ID_MISMATCH');
    expect(classifySettlementVerificationStage(commit, { ...baseRes, settlementProvenance: { ...validProv, conditionId: undefined } }, verifier.registry).reason).toBe('INCOMPLETE_ONCHAIN_COORDINATES');
    expect(classifySettlementVerificationStage(commit, { ...baseRes, settlementProvenance: { ...validProv, observedAtMs: 1500 } }, verifier.registry).reason).toBe('OBSERVED_BEFORE_RESOLVED');
    expect(classifySettlementVerificationStage(commit, { ...baseRes, settlementProvenance: { ...validProv, reference: 'synthetic-ref' } }, verifier.registry).reason).toBe('SYNTHETIC_SETTLEMENT_REFERENCE');
    expect(classifySettlementVerificationStage(commit, { ...baseRes, settlementProvenance: { ...validProv, verificationReceipt: reSign({ chainId: 1 }) } }, verifier.registry).reason).toBe('WRONG_CHAIN_ID:1');
    expect(classifySettlementVerificationStage(commit, { ...baseRes, settlementProvenance: { ...validProv, verificationReceipt: reSign({ contractAddress: '0x1111111111111111111111111111111111111111' }) } }, verifier.registry).reason).toBe('UNAUTHORIZED_SETTLEMENT_CONTRACT');
    expect(classifySettlementVerificationStage(commit, { ...baseRes, settlementProvenance: { ...validProv, verificationReceipt: reSign({ eventSignature: 'OrderFilled()' }) } }, verifier.registry).reason).toBe('WRONG_EVENT_SIGNATURE');
    expect(classifySettlementVerificationStage(commit, { ...baseRes, settlementProvenance: { ...validProv, verificationReceipt: reSign({ marketId: 'other-market' }) } }, verifier.registry).reason).toBe('RECEIPT_MARKET_MISMATCH');
    expect(classifySettlementVerificationStage(commit, { ...baseRes, settlementProvenance: { ...validProv, verificationReceipt: reSign({ eventId: 'other-event' }) } }, verifier.registry).reason).toBe('RECEIPT_EVENT_MISMATCH');
    expect(classifySettlementVerificationStage(commit, { ...baseRes, settlementProvenance: { ...validProv, verificationReceipt: reSign({ blockNumber: baseReceipt.blockNumber + 1 }) } }, verifier.registry).reason).toBe('RECEIPT_COORDINATE_MISMATCH');
    expect(classifySettlementVerificationStage(commit, { ...baseRes, settlementProvenance: { ...validProv, verificationReceipt: reSign({ blockTimestampMs: 900 }) } }, verifier.registry).reason).toBe('RECEIPT_TIMESTAMP_INCONSISTENT');
    expect(classifySettlementVerificationStage(commit, { ...baseRes, settlementProvenance: { ...validProv, verificationReceipt: reSign({ payoutNumerators: [0, 1] }) } }, verifier.registry).reason).toBe('RECEIPT_PAYOUT_MISMATCH');
    expect(classifySettlementVerificationStage(commit, { ...baseRes, settlementProvenance: { ...validProv, finalityStatus: 'PROPOSED' } }, verifier.registry).reason).toBe('NON_FINAL_PROVENANCE:PROPOSED');
    expect(classifySettlementVerificationStage(commit, { ...baseRes, settlementProvenance: { ...validProv, verificationReceipt: reSign({ finalityStatus: 'CORRECTED' }) } }, verifier.registry).reason).toBe('FINALITY_STATUS_MISMATCH');
    expect(classifySettlementVerificationStage(commit, { ...baseRes, settlementProvenance: { ...validProv, finalityStatus: 'CORRECTED', correctionReason: 'fix', verificationReceipt: reSign({ finalityStatus: 'CORRECTED', correctionReason: 'fix' }) } }, verifier.registry).reason).toBe('CORRECTED_WITHOUT_VERIFIED_FOLLOWUP');
    expect(classifySettlementVerificationStage(commit, { ...baseRes, settlementProvenance: { ...validProv, verificationReceipt: reSign({ verifiedConfirmations: 10 }) } }, verifier.registry).reason).toBe('INSUFFICIENT_VERIFIED_CONFIRMATIONS');
    const synthVerifier = createOfflineVerifierFixture('synthetic-verifier-v1');
    const synthProv = synthVerifier.buildSignedProvenance({ marketId: 'market-edge', eventId: 'event-market-edge', resolvedAtMs: 2000, index: 121 });
    expect(classifySettlementVerificationStage(commit, { ...baseRes, settlementProvenance: synthProv }, synthVerifier.registry).stage).toBe('SETTLEMENT_FINALIZED');

    // Receipt crypto defensive branches
    expect(verifySettlementVerificationReceipt({ ...baseReceipt, version: 2 as never }, verifier.registry).reason).toBe('RECEIPT_SCHEMA_INVALID');
    expect(verifySettlementVerificationReceipt(baseReceipt, { authorities: [{ ...verifier.registry.authorities[0]!, verifierId: 'other-id' }] }).reason).toBe('UNKNOWN_VERIFIER_AUTHORITY');
    expect(verifySettlementVerificationReceipt(baseReceipt, { authorities: [verifier.registry.authorities[0]!, verifier.registry.authorities[0]!] }).reason).toBe('AMBIGUOUS_VERIFIER_AUTHORITY');
    expect(verifySettlementVerificationReceipt({ ...baseReceipt, signature: 'AAAAAAAAAAAAAAAAAAAAAA==' }, verifier.registry).reason).toBe('INVALID_RECEIPT_SIGNATURE');
    expect(verifySettlementVerificationReceipt(baseReceipt, { authorities: [{ ...verifier.registry.authorities[0]!, publicKeyPem: '-----BEGIN PUBLIC KEY-----\ninvalid\n-----END PUBLIC KEY-----' }] }).reason).toBe('INVALID_RECEIPT_SIGNATURE');

    // Chain verifier & log decoder defensive branches
    const conditionId = `0x${'a1'.repeat(32)}`;
    const questionId = `0x${'b1'.repeat(32)}`;
    const oracle = '0x2222222222222222222222222222222222222222';
    const txHash = `0x${'c1'.repeat(32)}`;
    const blockHash = `0x${'d1'.repeat(32)}`;
    const baseState = (): MockChainState => ({
      chainId: POLYGON_POS_CHAIN_ID,
      latestBlock: { number: 70000100, hash: `0x${'e1'.repeat(32)}`, timestampMs: 2500 },
      blocksByNumber: new Map([[70000000, { number: 70000000, hash: blockHash, timestampMs: 2000 }]]),
      receiptsByTxHash: new Map([[txHash, {
        txHash, status: 1, blockNumber: 70000000, blockHash,
        logs: [encodeConditionResolutionLog({ contractAddress: CANONICAL_POLYGON_CTF_CONTRACT, logIndex: 4, conditionId, oracleAddress: oracle, ctfQuestionId: questionId, payoutNumerators: [1, 0] })],
      }]]),
      marketMappings: new Map([['market-edge', { marketId: 'market-edge', eventId: 'event-market-edge', conditionId, ctfQuestionId: questionId, expectedOracleAddress: oracle }]]),
      umaDisputes: new Map([[conditionId, { state: 'SETTLED' }]]),
    });
    const req: SettlementVerificationRequest = {
      marketId: 'market-edge', eventId: 'event-market-edge', txHash, logIndex: 4,
      expectedConditionId: conditionId, expectedBlockHash: blockHash, committedAtMs: 1000, resolvedAtMs: 2000, expectedPayoutNumerators: [1, 0],
    };

    const cases: Array<[string, (s: MockChainState) => void, Partial<SettlementVerificationRequest>?]> = [
      ['TX_HASH_MISMATCH', (s) => { s.receiptsByTxHash.set(txHash, { ...s.receiptsByTxHash.get(txHash)!, txHash: `0x${'ff'.repeat(32)}` }); }],
      ['CANONICAL_BLOCK_NOT_FOUND', (s) => { s.blocksByNumber.clear(); }],
      ['CHAIN_HEAD_BEHIND_RECEIPT', (s) => { s.latestBlock = { number: 69999999, hash: blockHash, timestampMs: 2500 }; }],
      ['INCONSISTENT_BLOCK_TIMESTAMP', (s) => { s.blocksByNumber.set(70000000, { number: 70000000, hash: blockHash, timestampMs: 0 }); }],
      ['BLOCK_TIMESTAMP_PRECEDES_COMMIT', () => {}, { committedAtMs: 2500 }],
      ['RESOLVED_TIMESTAMP_MISMATCH', () => {}, { resolvedAtMs: 99_999_999 }],
      ['NON_BINARY_OUTCOME_SLOTS', (s) => {
        s.receiptsByTxHash.set(txHash, { ...s.receiptsByTxHash.get(txHash)!, logs: [encodeConditionResolutionLog({ contractAddress: CANONICAL_POLYGON_CTF_CONTRACT, logIndex: 4, conditionId, oracleAddress: oracle, ctfQuestionId: questionId, payoutNumerators: [1, 0, 0] })] });
      }],
      ['AMBIGUOUS_OR_INVALID_PAYOUT_VECTOR', (s) => {
        s.receiptsByTxHash.set(txHash, { ...s.receiptsByTxHash.get(txHash)!, logs: [encodeConditionResolutionLog({ contractAddress: CANONICAL_POLYGON_CTF_CONTRACT, logIndex: 4, conditionId, oracleAddress: oracle, ctfQuestionId: questionId, payoutNumerators: [1, 1] })] });
      }],
      ['CONDITION_RESOLUTION_ABI_DECODE_FAILED', (s) => {
        const prev = s.receiptsByTxHash.get(txHash)!;
        s.receiptsByTxHash.set(txHash, { ...prev, logs: [{ ...prev.logs[0]!, data: '0xdeadbeef' }] });
      }],
      ['MARKET_MAPPING_NOT_FOUND', (s) => { s.marketMappings.clear(); }],
      ['EVENT_ID_MAPPING_MISMATCH', () => {}, { eventId: 'wrong-event' }],
      ['MARKET_QUESTION_MAPPING_MISMATCH', (s) => { s.marketMappings.set('market-edge', { ...s.marketMappings.get('market-edge')!, ctfQuestionId: `0x${'99'.repeat(32)}` }); }],
      ['ORACLE_ADDRESS_MISMATCH', (s) => { s.marketMappings.set('market-edge', { ...s.marketMappings.get('market-edge')!, expectedOracleAddress: '0x3333333333333333333333333333333333333333' }); }],
      ['UNKNOWN_UMA_DISPUTE_STATE', (s) => { s.umaDisputes.set(conditionId, { state: 'UNEXPECTED' as never }); }],
    ];
    for (const [expectedReason, mutate, reqOverride] of cases) {
      const s = baseState();
      mutate(s);
      const res = await verifyOnChainSettlement({ ...req, ...reqOverride }, createMockChainProvider(s), verifier.signer, { nowMs: () => 2500 });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.reason).toBe(expectedReason);
    }
  });
});
