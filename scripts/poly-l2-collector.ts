/**
 * CLI runner for bounded or continuous read-only Polymarket L2 collection.
 * Usage:
 *   npx tsx scripts/poly-l2-collector.ts --duration-sec 30 --out-dir /tmp/poly-g7-5-collector-drill --verify-restore --cost-report
 */

import { cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { verifyWalRestoreParity, type L2RestoreVerificationResult } from '../src/desk/polymarket/l2/l2-archive-manifest';
import { estimateL2CollectionStorageAndCost, type L2CostModelReport } from '../src/desk/polymarket/l2/l2-collector-cost-model';
import { L2CollectorRuntime, type CollectorRunSummary } from '../src/desk/polymarket/l2/l2-collector-runtime';

interface CliArgs {
  durationSec?: number;
  outDir: string;
  maxMarkets: number;
  rotateSec: number;
  verifyRestore: boolean;
  costReport: boolean;
}

function parsePositiveNum(flag: string, raw: string | undefined): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`Invalid ${flag}: ${raw}`);
  return n;
}

function parseArgs(argv: readonly string[]): CliArgs {
  let durationSec: number | undefined;
  let outDir = join(tmpdir(), `poly-l2-collector-${Date.now()}`);
  let maxMarkets = 10;
  let rotateSec = 3600;
  let verifyRestore = false;
  let costReport = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--duration-sec') durationSec = parsePositiveNum('--duration-sec', argv[++i]);
    else if (arg === '--out-dir' && argv[i + 1]) outDir = argv[++i]!;
    else if (arg === '--max-markets') maxMarkets = Math.floor(parsePositiveNum('--max-markets', argv[++i]));
    else if (arg === '--rotate-sec') rotateSec = parsePositiveNum('--rotate-sec', argv[++i]);
    else if (arg === '--verify-restore') verifyRestore = true;
    else if (arg === '--cost-report') costReport = true;
  }

  return { durationSec, outDir, maxMarkets, rotateSec, verifyRestore, costReport };
}

interface CollectorCliOutput {
  readOnly: true;
  outDir: string;
  durationSec: number;
  summary: CollectorRunSummary;
  restoreParity?: L2RestoreVerificationResult;
  costReport?: L2CostModelReport;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const outDir = resolve(args.outDir);
  const runtime = new L2CollectorRuntime({
    outDir,
    durationSec: args.durationSec,
    rotateIntervalSec: args.rotateSec,
    discovery: { maxMarkets: args.maxMarkets, minVolume24hUsd: 0 },
  });

  const summary = await runtime.start();
  const actualDurationSec = Math.max(1, Math.round((summary.health.uptimeMs / 1000) * 100) / 100);
  const output: CollectorCliOutput = {
    readOnly: true,
    outDir,
    durationSec: actualDurationSec,
    summary,
  };

  if (args.verifyRestore) {
    const restoreDir = join(outDir, 'restore');
    await rm(restoreDir, { recursive: true, force: true });
    await cp(summary.captureDir, restoreDir, { recursive: true });
    output.restoreParity = await verifyWalRestoreParity(summary.captureDir, restoreDir);
  }

  if (args.costReport) {
    const measuredMarkets = Math.max(1, Math.round(summary.tokensSubscribed.length / 2));
    output.costReport = estimateL2CollectionStorageAndCost({
      measuredBytes: summary.health.bytesWritten,
      durationSec: actualDurationSec,
      measuredMarkets,
    });
  }

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.stack ?? err.message : String(err);
  process.stderr.write(`[poly-l2-collector] ERROR: ${msg}\n`);
  process.exitCode = 1;
});
