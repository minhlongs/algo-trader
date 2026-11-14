/**
 * Sidecar Process Lifecycle CLI (`status`, `doctor`, `drill-ghost`, `capture-sample`)
 * for the vendored MIT Rust sidecars (`sidecars/poly-book` and `sidecars/ghost-guard`).
 *
 * Tracks every spawned child PID and enforces deterministic teardown
 * (`SIGTERM` -> bounded wait -> `SIGKILL` fallback) in `finally` blocks so
 * `capture-sample` and `drill-ghost` never leave background processes or sockets behind.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  KNOWN_GHOST_FILL_TX_HASH,
  runKnownGhostFillDrill,
  startGhostGuardDrillRpcServer,
} from '../src/desk/polymarket/ghost-guard-drill-rpc';
import {
  GOLDEN_V3_HEX,
  decodePolyBookWalRecord,
  encodePolyBookWalRecord,
} from '../src/desk/polymarket/l2/poly-book-wal-codec';
import { encodePolyBookWalFrame } from '../src/desk/polymarket/l2/poly-book-wal-crc32c';
import {
  listPolyBookWalSegments,
  readPolyBookWalDirectory,
} from '../src/desk/polymarket/l2/poly-book-wal-bridge';
import { createPolyKillSwitch } from '../src/desk/risk/poly-kill-switch';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..');

export interface SidecarBinaryStatus {
  name: 'poly-book' | 'ghostguard';
  manifestPath: string;
  manifestExists: boolean;
  binaryPath: string | null;
}

export interface ManagedRunResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

const activeChildren = new Map<number, ChildProcess>();

export function getActiveManagedPids(): number[] {
  return [...activeChildren.keys()];
}

function resolveBinary(envKey: string, sidecarDir: string, binName: string): string | null {
  const fromEnv = process.env[envKey];
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  const candidates = [
    join(sidecarDir, 'target', 'release', binName),
    join(sidecarDir, 'target', 'debug', binName),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export function inspectSidecarBinaries(rootDir = REPO_ROOT): {
  polyBook: SidecarBinaryStatus;
  ghostGuard: SidecarBinaryStatus;
} {
  const polyDir = join(rootDir, 'sidecars', 'poly-book');
  const ghostDir = join(rootDir, 'sidecars', 'ghost-guard');
  return {
    polyBook: {
      name: 'poly-book',
      manifestPath: join(polyDir, 'Cargo.toml'),
      manifestExists: existsSync(join(polyDir, 'Cargo.toml')),
      binaryPath: resolveBinary('POLY_BOOK_BIN', polyDir, 'poly-book'),
    },
    ghostGuard: {
      name: 'ghostguard',
      manifestPath: join(ghostDir, 'Cargo.toml'),
      manifestExists: existsSync(join(ghostDir, 'Cargo.toml')),
      binaryPath: resolveBinary('GHOSTGUARD_BIN', ghostDir, 'ghostguard'),
    },
  };
}

export async function terminateManagedChild(child: ChildProcess, graceMs = 1_500): Promise<void> {
  const pid = child.pid;
  if (pid === undefined || child.exitCode !== null || child.signalCode !== null) {
    if (pid !== undefined) activeChildren.delete(pid);
    return;
  }

  const exited = new Promise<void>((resolveExit) => {
    child.once('close', () => resolveExit());
    child.once('exit', () => resolveExit());
  });

  try {
    child.kill('SIGTERM');
  } catch {
    // Process already exited.
  }

  let graceTimer: ReturnType<typeof setTimeout> | undefined;
  const didExitInGrace = await Promise.race([
    exited.then(() => true),
    new Promise<boolean>((r) => {
      graceTimer = setTimeout(() => r(false), graceMs);
    }),
  ]);
  if (graceTimer !== undefined) clearTimeout(graceTimer);

  if (!didExitInGrace && child.exitCode === null && child.signalCode === null) {
    try {
      child.kill('SIGKILL');
    } catch {
      // Process already exited.
    }
    await exited;
  }

  activeChildren.delete(pid);
}

export async function terminateAllManagedChildren(graceMs = 1_500): Promise<void> {
  const children = [...activeChildren.values()];
  await Promise.allSettled(children.map((c) => terminateManagedChild(c, graceMs)));
  activeChildren.clear();
}

export async function runBoundedProcess(
  command: string,
  args: readonly string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs: number; graceMs?: number },
): Promise<ManagedRunResult> {
  const child = spawn(command, [...args], {
    cwd: options.cwd ?? REPO_ROOT,
    env: options.env ?? process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (child.pid !== undefined) activeChildren.set(child.pid, child);

  let stdout = '';
  let stderr = '';
  child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); });
  child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });

  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    const completion = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((res, rej) => {
      child.once('error', rej);
      child.once('close', (code, signal) => res({ code, signal }));
    });
    timer = setTimeout(() => {
      timedOut = true;
      void terminateManagedChild(child, options.graceMs ?? 1_500);
    }, options.timeoutMs);

    const { code, signal } = await completion;
    return { exitCode: code, signal, stdout, stderr, timedOut };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    await terminateManagedChild(child, options.graceMs ?? 1_500);
  }
}

export async function cmdStatus(walDir?: string): Promise<Record<string, unknown>> {
  const binaries = inspectSidecarBinaries();
  const targetWal = walDir ?? join(REPO_ROOT, 'sidecars', 'poly-book', 'data', 'wal');
  const segments = existsSync(targetWal) ? await listPolyBookWalSegments(targetWal) : [];
  return {
    ok: binaries.polyBook.manifestExists && binaries.ghostGuard.manifestExists,
    sidecars: binaries,
    walDir: targetWal,
    walSegments: segments.length,
    activeManagedPids: getActiveManagedPids(),
  };
}

export async function cmdDoctor(): Promise<Record<string, unknown>> {
  const binaries = inspectSidecarBinaries();
  const goldenBytes = Uint8Array.from(Buffer.from(GOLDEN_V3_HEX, 'hex'));
  const decodedGolden = decodePolyBookWalRecord(goldenBytes);
  const cargoCheck = await runBoundedProcess('cargo', ['--version'], { timeoutMs: 5_000 }).catch(() => null);

  let polyBookDoctorOk: boolean | null = null;
  if (binaries.polyBook.binaryPath) {
    const res = await runBoundedProcess(
      binaries.polyBook.binaryPath,
      ['--config', join(REPO_ROOT, 'sidecars', 'poly-book', 'config', 'default.toml'), 'doctor', '--skip-network'],
      { cwd: join(REPO_ROOT, 'sidecars', 'poly-book'), timeoutMs: 10_000 },
    );
    polyBookDoctorOk = res.exitCode === 0;
  }

  return {
    ok: binaries.polyBook.manifestExists && binaries.ghostGuard.manifestExists && decodedGolden.tag === 'Book',
    cargoVersion: cargoCheck?.exitCode === 0 ? cargoCheck.stdout.trim() : null,
    goldenCodecV3Verified: decodedGolden.tag === 'Book' && decodedGolden.assetId === 'tok1',
    polyBookDoctorOk,
    binaries,
    activeManagedPids: getActiveManagedPids(),
  };
}

export async function cmdDrillGhost(): Promise<Record<string, unknown>> {
  const killSwitch = createPolyKillSwitch({
    cancelAll: async () => ({ ok: true, status: 200, body: '{"canceled":"all"}' }),
  });
  const tsDrill = await runKnownGhostFillDrill(killSwitch);
  const binaries = inspectSidecarBinaries();
  let rustBinaryVerified: boolean | null = null;

  if (binaries.ghostGuard.binaryPath) {
    const rpcServer = await startGhostGuardDrillRpcServer();
    try {
      const res = await runBoundedProcess(
        binaries.ghostGuard.binaryPath,
        ['--rpc', rpcServer.url, '--verify-tx', KNOWN_GHOST_FILL_TX_HASH, '--timeout', '3', '--poll-ms', '50'],
        { timeoutMs: 5_000 },
      );
      rustBinaryVerified = res.exitCode === 0 && res.stdout.includes('[GHOST]') && res.stdout.includes('TRANSFER_FROM_FAILED');
    } finally {
      await terminateAllManagedChildren();
      await rpcServer.close();
    }
  }

  return {
    ok: tsDrill.verdict.verdict === 'Ghost' && killSwitch.isFired() && tsDrill.webhookResult.latched,
    txHash: KNOWN_GHOST_FILL_TX_HASH,
    verdict: tsDrill.verdict,
    killSwitchLatched: killSwitch.isFired(),
    auditEntries: killSwitch.getAudit().length,
    elapsedMs: Math.round(tsDrill.elapsedMs * 100) / 100,
    rustBinaryVerified,
    activeManagedPids: getActiveManagedPids(),
  };
}

export async function cmdCaptureSample(opts: { walDir?: string; durationMs?: number; live?: boolean } = {}): Promise<Record<string, unknown>> {
  const durationMs = Math.max(200, opts.durationMs ?? 1_500);
  const tempCreated = !opts.walDir;
  const walDir = opts.walDir ?? (await mkdtemp(join(tmpdir(), 'poly-book-sample-')));
  await mkdir(walDir, { recursive: true });

  try {
    const binaries = inspectSidecarBinaries();
    if (opts.live && binaries.polyBook.binaryPath) {
      await runBoundedProcess(
        binaries.polyBook.binaryPath,
        ['ingest', '--auto-rotate', '--parquet=false', '--metrics=false'],
        {
          cwd: join(REPO_ROOT, 'sidecars', 'poly-book'),
          env: { ...process.env, PB__WAL__BASE_PATH: walDir },
          timeoutMs: durationMs,
        },
      );
    } else {
      const snapBid = encodePolyBookWalFrame(encodePolyBookWalRecord({
        tag: 'Book', assetId: 'sample-token', kind: 'Snapshot', side: 'Bid',
        priceRaw: 4900, price: '0.4900', sizeRaw: 50_000_000n, size: '50.000000',
        provenance: { recvTimestampUs: 1_700_000_000_000_000, exchangeTimestampUs: 1_700_000_000_000_000, source: 'WebSocket', sequence: 1, ingestOrdinal: 1 },
      }));
      const snapAsk = encodePolyBookWalFrame(encodePolyBookWalRecord({
        tag: 'Book', assetId: 'sample-token', kind: 'Snapshot', side: 'Ask',
        priceRaw: 5100, price: '0.5100', sizeRaw: 60_000_000n, size: '60.000000',
        provenance: { recvTimestampUs: 1_700_000_000_000_000, exchangeTimestampUs: 1_700_000_000_000_000, source: 'WebSocket', sequence: 1, ingestOrdinal: 2 },
      }));
      const deltaBid = encodePolyBookWalFrame(encodePolyBookWalRecord({
        tag: 'Book', assetId: 'sample-token', kind: 'Delta', side: 'Bid',
        priceRaw: 5000, price: '0.5000', sizeRaw: 25_000_000n, size: '25.000000',
        provenance: { recvTimestampUs: 1_700_000_000_100_000, exchangeTimestampUs: 1_700_000_000_090_000, source: 'WebSocket', sequence: 2, ingestOrdinal: 3 },
      }));
      const segPath = join(walDir, 'segment_00000000000000000000.wal');
      await writeFile(segPath, Buffer.concat([snapBid, snapAsk, deltaBid]));
    }

    const replay = await readPolyBookWalDirectory(walDir);
    return {
      ok: replay.continuity.validFrames > 0 && getActiveManagedPids().length === 0,
      walDir: tempCreated ? '(ephemeral)' : walDir,
      stepsEmitted: replay.steps.length,
      continuity: replay.continuity,
      activeManagedPids: getActiveManagedPids(),
    };
  } finally {
    await terminateAllManagedChildren();
    if (tempCreated) await rm(walDir, { recursive: true, force: true });
  }
}

async function runCli(argv: readonly string[]): Promise<void> {
  const sub = argv[0] ?? 'status';
  let walDir: string | undefined;
  let durationMs: number | undefined;
  let live = false;
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === '--wal-dir' && argv[i + 1]) walDir = argv[++i];
    else if (argv[i] === '--duration-ms' && argv[i + 1]) durationMs = Number(argv[++i]);
    else if (argv[i] === '--live') live = true;
  }

  let output: Record<string, unknown>;
  if (sub === 'status') output = await cmdStatus(walDir);
  else if (sub === 'doctor') output = await cmdDoctor();
  else if (sub === 'drill-ghost') output = await cmdDrillGhost();
  else if (sub === 'capture-sample') output = await cmdCaptureSample({ walDir, durationMs, live });
  else throw new Error(`Unknown subcommand "${sub}". Expected: status | doctor | drill-ghost | capture-sample`);

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (output.ok === false) process.exitCode = 1;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  const onSignal = (): void => {
    void terminateAllManagedChildren().finally(() => process.exit(130));
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  runCli(process.argv.slice(2)).catch((err: unknown) => {
    const msg = err instanceof Error ? err.stack ?? err.message : String(err);
    process.stderr.write(`[poly-sidecars] ERROR: ${msg}\n`);
    process.exitCode = 1;
  });
}
