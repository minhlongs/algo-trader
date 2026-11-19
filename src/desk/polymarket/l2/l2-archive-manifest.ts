/**
 * SHA-256 archive manifest, deterministic replay hashing, and WAL restore parity
 * verification for Polymarket L2 capture artifacts (`.wal`, `.jsonl`, `.parquet`).
 */

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';
import type { ReplayedBookStep } from './l2-replay';
import { listPolyBookWalSegments, readPolyBookWalDirectory, type PolyBookContinuityReport } from './poly-book-wal-bridge';

const ARCHIVE_EXTENSIONS = new Set(['.wal', '.jsonl', '.parquet']);
const MAX_HASHED_DEPTH = 10;

export interface L2ArchiveFileEntry {
  relativePath: string;
  sizeBytes: number;
  sha256: string;
}

export interface L2ArchiveManifest {
  version: 1;
  createdAtIso: string;
  rootDir: string;
  fileCount: number;
  totalBytes: number;
  files: L2ArchiveFileEntry[];
  manifestSha256: string;
}

export interface L2ManifestVerificationResult {
  ok: boolean;
  missing: string[];
  mismatched: string[];
  unexpected: string[];
}

export interface L2RestoreVerificationResult {
  ok: boolean;
  manifestCheck: L2ManifestVerificationResult;
  originalReplayHash: string;
  restoredReplayHash: string;
  replayHashMatched: boolean;
  originalSteps: number;
  restoredSteps: number;
  originalContinuity: PolyBookContinuityReport | null;
  restoredContinuity: PolyBookContinuityReport | null;
  continuityOk: boolean;
  error?: string;
}

const sha256 = (data: Buffer | string): string => createHash('sha256').update(data).digest('hex');

function collectArchiveFiles(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) {
      throw new Error(`L2 archive symlink rejected: ${join(dir, entry.name)}`);
    }
    const full = join(dir, entry.name);
    if (entry.isDirectory()) collectArchiveFiles(full, out);
    else if (entry.isFile() && ARCHIVE_EXTENSIONS.has(extname(entry.name).toLowerCase())) out.push(full);
  }
}

function computeManifestDigest(files: readonly L2ArchiveFileEntry[]): string {
  return sha256(JSON.stringify(files.map((f) => [f.relativePath, f.sizeBytes, f.sha256])));
}

export function buildL2ArchiveManifest(dirPath: string): L2ArchiveManifest {
  const fullPaths: string[] = [];
  collectArchiveFiles(dirPath, fullPaths);
  const files: L2ArchiveFileEntry[] = fullPaths
    .map((full) => ({
      relativePath: relative(dirPath, full).split(sep).join('/'),
      sizeBytes: statSync(full).size,
      sha256: sha256(readFileSync(full)),
    }))
    .sort((a, b) => (a.relativePath < b.relativePath ? -1 : a.relativePath > b.relativePath ? 1 : 0));
  return {
    version: 1,
    createdAtIso: new Date().toISOString(),
    rootDir: dirPath,
    fileCount: files.length,
    totalBytes: files.reduce((sum, f) => sum + f.sizeBytes, 0),
    files,
    manifestSha256: computeManifestDigest(files),
  };
}

export function verifyL2ArchiveManifest(dirPath: string, manifest: L2ArchiveManifest): L2ManifestVerificationResult {
  const actualByPath = new Map(buildL2ArchiveManifest(dirPath).files.map((f) => [f.relativePath, f]));
  const expectedByPath = new Map(manifest.files.map((f) => [f.relativePath, f]));
  const missing: string[] = [];
  const mismatched: string[] = [];
  const unexpected: string[] = [];

  for (const [relPath, expected] of expectedByPath) {
    const found = actualByPath.get(relPath);
    if (!found) missing.push(relPath);
    else if (found.sizeBytes !== expected.sizeBytes || found.sha256 !== expected.sha256) mismatched.push(relPath);
  }
  for (const relPath of actualByPath.keys()) {
    if (!expectedByPath.has(relPath)) unexpected.push(relPath);
  }

  missing.sort();
  mismatched.sort();
  unexpected.sort();
  const digestOk = computeManifestDigest(manifest.files) === manifest.manifestSha256;
  return { ok: digestOk && missing.length === 0 && mismatched.length === 0 && unexpected.length === 0, missing, mismatched, unexpected };
}

export function computeDeterministicReplayHash(steps: ReplayedBookStep[]): string {
  const canonical = steps
    .map((s) => ({
      tokenId: s.assetId,
      seq: s.sequence ?? null,
      recvTime: s.recvTimestampUs ?? null,
      exchangeTime: s.exchangeTimestampUs ?? null,
      t: s.t,
      eventType: s.eventType,
      bids: s.bids.slice(0, MAX_HASHED_DEPTH).map((l) => [l.price, l.size]),
      asks: s.asks.slice(0, MAX_HASHED_DEPTH).map((l) => [l.price, l.size]),
    }))
    .sort((a, b) =>
      a.tokenId !== b.tokenId ? (a.tokenId < b.tokenId ? -1 : 1)
      : (a.recvTime ?? 0) !== (b.recvTime ?? 0) ? (a.recvTime ?? 0) - (b.recvTime ?? 0)
      : (a.exchangeTime ?? 0) !== (b.exchangeTime ?? 0) ? (a.exchangeTime ?? 0) - (b.exchangeTime ?? 0)
      : (a.seq ?? 0) !== (b.seq ?? 0) ? (a.seq ?? 0) - (b.seq ?? 0)
      : a.t !== b.t ? a.t - b.t
      : a.eventType < b.eventType ? -1 : a.eventType > b.eventType ? 1 : 0,
    );
  return sha256(JSON.stringify(canonical));
}

async function resolveWalDir(baseDir: string): Promise<string> {
  if (existsSync(baseDir) && (await listPolyBookWalSegments(baseDir)).length > 0) return baseDir;
  const nested = join(baseDir, 'wal');
  return existsSync(nested) ? nested : baseDir;
}

const isContinuityClean = (c: PolyBookContinuityReport): boolean =>
  c.validFrames > 0 && c.corruptFrames === 0 && c.sequenceGaps === 0 && c.bookMismatches === 0;

export async function verifyWalRestoreParity(originalDir: string, restoredDir: string): Promise<L2RestoreVerificationResult> {
  const manifestCheck = verifyL2ArchiveManifest(restoredDir, buildL2ArchiveManifest(originalDir));
  try {
    const [origWalDir, restWalDir] = await Promise.all([resolveWalDir(originalDir), resolveWalDir(restoredDir)]);
    const [orig, rest] = await Promise.all([
      readPolyBookWalDirectory(origWalDir, { onCorruption: 'throw' }),
      readPolyBookWalDirectory(restWalDir, { onCorruption: 'throw' }),
    ]);
    const originalReplayHash = computeDeterministicReplayHash(orig.steps);
    const restoredReplayHash = computeDeterministicReplayHash(rest.steps);
    const replayHashMatched = originalReplayHash === restoredReplayHash;
    const continuityOk =
      isContinuityClean(orig.continuity) &&
      isContinuityClean(rest.continuity) &&
      orig.continuity.validFrames === rest.continuity.validFrames &&
      orig.steps.length === rest.steps.length;
    return {
      ok: manifestCheck.ok && replayHashMatched && continuityOk,
      manifestCheck,
      originalReplayHash,
      restoredReplayHash,
      replayHashMatched,
      originalSteps: orig.steps.length,
      restoredSteps: rest.steps.length,
      originalContinuity: orig.continuity,
      restoredContinuity: rest.continuity,
      continuityOk,
    };
  } catch (err: unknown) {
    return {
      ok: false,
      manifestCheck,
      originalReplayHash: '',
      restoredReplayHash: '',
      replayHashMatched: false,
      originalSteps: 0,
      restoredSteps: 0,
      originalContinuity: null,
      restoredContinuity: null,
      continuityOk: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
