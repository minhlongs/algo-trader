/**
 * Read-Only IC Evidence Loader (POLY-G7.5 Phase 5).
 *
 * Aggregates verified L2 archive days and prospective Market-Blind OOS ledger
 * state into an `ICScorecardInput` for `evaluateICKpiScorecard`.
 *
 * Fail-closed invariants:
 * - Missing directories, tampered L2 manifests, or corrupted Market-Blind
 *   hash chains collapse empirical sample counts to 0 and record explicit
 *   integrity errors.
 * - Never fabricates maker fills, NegRisk trades, or hindcast forecasts.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ICScorecardInput, ICEmpiricalSamples } from './ic-kpi-scorecard';
import { inspectL2ArchiveCoverage } from './l2/l2-archive-coverage';
import type { L2CoveragePolicy } from './l2/l2-coverage-policy';
import { createNodeJsonlAppendStore } from './market-blind/node-market-blind-ledger-adapter';
import {
  evaluateProspectiveOosReport,
  ProspectivePipelineLedger,
  type ProspectiveOosReport,
} from './market-blind/market-blind-prospective-pipeline';

export interface ICEvidenceLoaderOptions {
  readonly l2ArchiveDir?: string;
  readonly marketBlindLedgerPath?: string;
  readonly manifestFilename?: string;
  readonly l2CoveragePolicy?: L2CoveragePolicy;
  readonly mode?: 'sim' | 'pilot';
  readonly strategyClass?: 'mm' | 'event';
  readonly generatedAtIso?: string;
}

export interface ICEvidenceIntegritySummary {
  readonly l2DirPresent: boolean;
  readonly l2ManifestChecked: boolean;
  readonly l2ManifestOk: boolean;
  readonly marketBlindLedgerPresent: boolean;
  readonly marketBlindChainOk: boolean;
  readonly errors: readonly string[];
}

export interface ICEvidenceLoadResult {
  readonly samples: ICEmpiricalSamples;
  readonly integrity: ICEvidenceIntegritySummary;
  readonly marketBlindReport: ProspectiveOosReport | null;
  readonly scorecardInput: ICScorecardInput;
}

function inspectMarketBlindLedger(
  ledgerPath: string | undefined,
  errors: string[],
): { present: boolean; chainOk: boolean; report: ProspectiveOosReport | null; resolvedCount: number } {
  if (!ledgerPath) {
    return { present: false, chainOk: true, report: null, resolvedCount: 0 };
  }
  const absPath = resolve(ledgerPath);
  if (!existsSync(absPath)) {
    return { present: false, chainOk: true, report: null, resolvedCount: 0 };
  }
  try {
    const store = createNodeJsonlAppendStore(absPath);
    const ledger = ProspectivePipelineLedger.hydrateFromStore(store);
    const report = evaluateProspectiveOosReport(ledger);
    if (!report.chainVerified || report.hindcastDetected) {
      errors.push(
        `Market-Blind integrity violation: chainVerified=${report.chainVerified} hindcastDetected=${report.hindcastDetected}`,
      );
      return { present: true, chainOk: false, report, resolvedCount: 0 };
    }
    return { present: true, chainOk: true, report, resolvedCount: report.resolvedScoredCount };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Market-Blind ledger tamper/error: ${msg}`);
    return { present: true, chainOk: false, report: null, resolvedCount: 0 };
  }
}

export function loadICEvidenceForScorecard(options: ICEvidenceLoaderOptions = {}): ICEvidenceLoadResult {
  const errors: string[] = [];
  const manifestFilename = options.manifestFilename ?? 'l2-archive-manifest.json';
  const l2 = inspectL2ArchiveCoverage({
    rootDir: options.l2ArchiveDir,
    manifestFilename,
    policy: options.l2CoveragePolicy,
    generatedAtIso: options.generatedAtIso,
  }, errors);
  const mb = inspectMarketBlindLedger(options.marketBlindLedgerPath, errors);

  const samples: ICEmpiricalSamples = {
    recordedL2Days: l2.recordedL2Days,
    qualifyingMakerFills: 0,
    resolvedOosForecasts: mb.resolvedCount,
  };

  const scorecardInput: ICScorecardInput = {
    generatedAtIso: options.generatedAtIso,
    mode: options.mode ?? 'sim',
    strategyClass: options.strategyClass ?? 'mm',
    samples,
    ...(mb.report && mb.chainOk && mb.report.bssOos !== null && mb.report.ece !== null
      ? {
          brierSkillScoreOos: mb.report.bssOos,
          brierEce: mb.report.ece,
        }
      : {}),
  };

  return {
    samples,
    integrity: {
      l2DirPresent: l2.present,
      l2ManifestChecked: l2.manifestChecked,
      l2ManifestOk: l2.manifestOk,
      marketBlindLedgerPresent: mb.present,
      marketBlindChainOk: mb.chainOk,
      errors,
    },
    marketBlindReport: mb.report,
    scorecardInput,
  };
}
