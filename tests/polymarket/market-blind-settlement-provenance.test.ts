import { describe, expect, it } from 'vitest';
import { createInMemoryAppendOnlyStore } from '../../src/desk/polymarket/market-blind/market-blind-ledger-store';
import {
  MIN_ONCHAIN_SETTLEMENT_CONFIRMATIONS,
  ProspectivePipelineLedger,
  attachPostCommitMarketSnapshot,
  evaluateProspectiveOosReport,
  recordMarketBlindResolution,
  submitMarketBlindForecast,
  type ApprovedRepeatedForecastPolicy,
  type SettlementProvenance,
} from '../../src/desk/polymarket/market-blind/market-blind-prospective-pipeline';

const policy: ApprovedRepeatedForecastPolicy = {
  policyId: 'ic-policy-settlement-test',
  approvalStatus: 'APPROVED',
  approvedBy: 'ic-reviewer-1',
  approvedAtMs: 500,
  approvalEvidenceRef: 'ic-minutes-2026-11-22',
  modelVersion: 'model-v1',
  repeatedForecastRule: 'FIRST_COMMIT_PER_RESEARCH_QUESTION',
};
const empiricalOptions = { mode: 'empirical' as const, modelVersion: 'model-v1', policy };

function validProvenance(marketId: string, resolvedAtMs: number, overrides: Partial<SettlementProvenance> = {}): SettlementProvenance {
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

function commitAndAttach(ledger: ProspectivePipelineLedger, id: string, committedAtMs = 1000) {
  const receipt = submitMarketBlindForecast(ledger, {
    questionId: id,
    researchQuestionId: `rq-${id}`,
    eventId: `event-market-${id}`,
    marketId: `market-${id}`,
    forecastId: `fc-${id}`,
    forecastHorizonMs: 5000,
    provenance: { kind: 'REAL', source: 'official-publication', reference: `pub-${id}` },
    modelVersion: 'model-v1',
    pRaw: 0.85,
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

describe('market-blind authoritative settlement provenance trust boundary', () => {
  it('excludes missing, MANUAL_ADMIN, and bare GAMMA_API resolutions from empirical OOS counts and keeps w_skill = 0', () => {
    const ledger = new ProspectivePipelineLedger(createInMemoryAppendOnlyStore(), () => 1000);
    const rMissing = commitAndAttach(ledger, 'missing');
    recordMarketBlindResolution(ledger, { entryHash: rMissing.entryHash, status: 'RESOLVED_YES', resolvedAtMs: 2000 });

    const rManual = commitAndAttach(ledger, 'manual');
    recordMarketBlindResolution(ledger, {
      entryHash: rManual.entryHash,
      status: 'RESOLVED_YES',
      resolvedAtMs: 2000,
      settlementProvenance: validProvenance('market-manual', 2000, { source: 'MANUAL_ADMIN' }),
    });

    const rGamma = commitAndAttach(ledger, 'gamma');
    recordMarketBlindResolution(ledger, {
      entryHash: rGamma.entryHash,
      status: 'RESOLVED_YES',
      resolvedAtMs: 2000,
      settlementProvenance: validProvenance('market-gamma', 2000, { source: 'GAMMA_API' }),
    });

    const report = evaluateProspectiveOosReport(ledger, empiricalOptions);
    expect(report.resolvedEligibleCount).toBe(0);
    expect(report.resolvedScoredCount).toBe(0);
    expect(report.skillGate.wSkill).toBe(0);
    expect(report.skillGate.unlocked).toBe(false);
    expect(report.eligibilityReasons).toContain('UNVERIFIED_OR_NON_FINAL_SETTLEMENT_EXCLUDED');

    // Diagnostic mode continues to report scored counts for local debugging without unlocking empirical eligibility.
    const diagnostic = evaluateProspectiveOosReport(ledger);
    expect(diagnostic.resolvedScoredCount).toBe(3);
    expect(diagnostic.resolvedEligibleCount).toBe(0);
    expect(diagnostic.empiricalEligible).toBe(false);
  });

  it('distinguishes PROPOSED, DISPUTED, FINALIZED, and CORRECTED outcomes and enforces confirmation depth', () => {
    const ledger = new ProspectivePipelineLedger(createInMemoryAppendOnlyStore(), () => 1000);

    const rProposed = commitAndAttach(ledger, 'proposed');
    recordMarketBlindResolution(ledger, {
      entryHash: rProposed.entryHash,
      status: 'RESOLVED_YES',
      resolvedAtMs: 2000,
      settlementProvenance: validProvenance('market-proposed', 2000, { finalityStatus: 'PROPOSED' }),
    });

    const rDisputed = commitAndAttach(ledger, 'disputed');
    recordMarketBlindResolution(ledger, {
      entryHash: rDisputed.entryHash,
      status: 'RESOLVED_YES',
      resolvedAtMs: 2000,
      settlementProvenance: validProvenance('market-disputed', 2000, { finalityStatus: 'DISPUTED' }),
    });

    const rShallow = commitAndAttach(ledger, 'shallow');
    recordMarketBlindResolution(ledger, {
      entryHash: rShallow.entryHash,
      status: 'RESOLVED_YES',
      resolvedAtMs: 2000,
      settlementProvenance: validProvenance('market-shallow', 2000, {
        confirmations: MIN_ONCHAIN_SETTLEMENT_CONFIRMATIONS - 1,
      }),
    });

    const rFinal = commitAndAttach(ledger, 'final');
    recordMarketBlindResolution(ledger, {
      entryHash: rFinal.entryHash,
      status: 'RESOLVED_YES',
      resolvedAtMs: 2000,
      settlementProvenance: validProvenance('market-final', 2000, { finalityStatus: 'FINALIZED' }),
    });

    const rCorrected = commitAndAttach(ledger, 'corrected');
    recordMarketBlindResolution(ledger, {
      entryHash: rCorrected.entryHash,
      status: 'RESOLVED_NO',
      resolvedAtMs: 2000,
      settlementProvenance: validProvenance('market-corrected', 2000, {
        finalityStatus: 'CORRECTED',
        payoutNumerators: [0, 1],
        correctionReason: 'UMA DVM dispute overturned initial proposal',
      }),
    });

    const report = evaluateProspectiveOosReport(ledger, empiricalOptions);
    expect(report.resolvedEligibleCount).toBe(2);
    expect(report.eligibilityReasons).toContain('UNVERIFIED_OR_NON_FINAL_SETTLEMENT_EXCLUDED');
    expect(report.skillGate.wSkill).toBe(0);
  });

  it('rejects marketId mismatch, payout-outcome mismatch, pre-resolution observation, synthetic provenance, and incomplete CTF_ONCHAIN records', () => {
    const ledger = new ProspectivePipelineLedger(createInMemoryAppendOnlyStore(), () => 1000);
    const receipt = commitAndAttach(ledger, 'strict-checks');

    expect(() => recordMarketBlindResolution(ledger, {
      entryHash: receipt.entryHash,
      status: 'RESOLVED_YES',
      resolvedAtMs: 2000,
      settlementProvenance: validProvenance('market-wrong', 2000),
    })).toThrow(/marketId mismatch/);

    expect(() => recordMarketBlindResolution(ledger, {
      entryHash: receipt.entryHash,
      status: 'RESOLVED_YES',
      resolvedAtMs: 2000,
      settlementProvenance: validProvenance('market-strict-checks', 2000, { payoutNumerators: [0, 1] }),
    })).toThrow(/payoutNumerators/);

    expect(() => recordMarketBlindResolution(ledger, {
      entryHash: receipt.entryHash,
      status: 'RESOLVED_YES',
      resolvedAtMs: 2000,
      settlementProvenance: validProvenance('market-strict-checks', 2000, { observedAtMs: 1999 }),
    })).toThrow(/observedAtMs/);

    expect(() => recordMarketBlindResolution(ledger, {
      entryHash: receipt.entryHash,
      status: 'RESOLVED_YES',
      resolvedAtMs: 2000,
      settlementProvenance: validProvenance('market-strict-checks', 2000, { finalityStatus: 'CORRECTED' }),
    })).toThrow(/correctionReason/);

    expect(() => recordMarketBlindResolution(ledger, {
      entryHash: receipt.entryHash,
      status: 'RESOLVED_YES',
      resolvedAtMs: 2000,
      settlementProvenance: validProvenance('market-strict-checks', 2000, { txHash: undefined }),
    })).toThrow(/CTF_ONCHAIN/);

    // Synthetic reference is persisted if schema-valid, but strictly excluded from empirical scoring.
    recordMarketBlindResolution(ledger, {
      entryHash: receipt.entryHash,
      status: 'RESOLVED_YES',
      resolvedAtMs: 2000,
      settlementProvenance: validProvenance('market-strict-checks', 2000, { reference: 'synthetic-fixture-ref' }),
    });
    const report = evaluateProspectiveOosReport(ledger, empiricalOptions);
    expect(report.resolvedEligibleCount).toBe(0);
    expect(report.eligibilityReasons).toContain('UNVERIFIED_OR_NON_FINAL_SETTLEMENT_EXCLUDED');
  });

  it('preserves settlementProvenance across journal hydration and excludes ambiguous/voided/cancelled/disputed states', () => {
    const store = createInMemoryAppendOnlyStore();
    const ledger = new ProspectivePipelineLedger(store, () => 1000);
    const rFinal = commitAndAttach(ledger, 'hydrated');
    const prov = validProvenance('market-hydrated', 2000);
    recordMarketBlindResolution(ledger, {
      entryHash: rFinal.entryHash,
      status: 'RESOLVED_YES',
      resolvedAtMs: 2000,
      settlementProvenance: prov,
    });
    const rVoid = commitAndAttach(ledger, 'voided');
    recordMarketBlindResolution(ledger, { entryHash: rVoid.entryHash, status: 'VOIDED', resolvedAtMs: 2000 });
    const rUma = commitAndAttach(ledger, 'uma');
    recordMarketBlindResolution(ledger, { entryHash: rUma.entryHash, status: 'UMA_DISPUTED', resolvedAtMs: 2000 });

    const restored = ProspectivePipelineLedger.hydrateFromStore(store);
    expect(restored.resolutions.get(rFinal.entryHash)?.settlementProvenance).toEqual(prov);
    expect(Object.isFrozen(restored.resolutions.get(rFinal.entryHash)?.settlementProvenance)).toBe(true);

    const report = evaluateProspectiveOosReport(restored, empiricalOptions);
    expect(report.resolvedEligibleCount).toBe(1);
    expect(report.voidedCount).toBe(1);
    expect(report.umaDisputedCount).toBe(1);
    expect(report.skillGate.wSkill).toBe(0);
  });
});
