/**
 * CLI entrypoint for the bounded read-only Polymarket L2 public capture drill.
 * Usage:
 *   npx tsx scripts/poly-l2-capture-drill.ts --duration-sec 30 --out-dir /tmp/poly-g7-drill
 */

import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  runPublicL2CaptureDrill,
  type PublicCaptureDrillOptions,
} from '../src/desk/polymarket/l2/l2-public-capture-drill';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..');

function parseArgs(argv: readonly string[]): PublicCaptureDrillOptions & { strict: boolean } {
  let durationSec = 30;
  let outDir = join(tmpdir(), `poly-g7-drill-${Date.now()}`);
  let tokenIds: string[] | undefined;
  let preferPolyBook = true;
  let buildPolyBookIfMissing = false;
  let strict = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--duration-sec' && argv[i + 1]) {
      const parsed = Number(argv[++i]);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`Invalid --duration-sec: ${argv[i]}`);
      }
      durationSec = parsed;
    } else if (arg === '--out-dir' && argv[i + 1]) {
      outDir = argv[++i]!;
    } else if (arg === '--tokens' && argv[i + 1]) {
      tokenIds = argv[++i]!.split(',').map((t) => t.trim()).filter(Boolean);
    } else if (arg === '--ws-only') {
      preferPolyBook = false;
    } else if (arg === '--build-poly-book') {
      buildPolyBookIfMissing = true;
    } else if (arg === '--strict') {
      strict = true;
    }
  }

  return {
    outDir,
    durationSec,
    tokenIds,
    preferPolyBook,
    buildPolyBookIfMissing,
    repoRoot: REPO_ROOT,
    strict,
  };
}

async function main(): Promise<void> {
  const { strict, ...options } = parseArgs(process.argv.slice(2));
  const report = await runPublicL2CaptureDrill(options);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (strict && report.status !== 'CAPTURE_READY') {
    process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.stack ?? err.message : String(err);
  process.stderr.write(`[poly-l2-capture-drill] ERROR: ${msg}\n`);
  process.exitCode = 1;
});
