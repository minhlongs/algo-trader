import { z } from 'zod';

export const UTC_DAY_MS = 86_400_000;
const text = z.string().trim().min(1);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const utcDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((day) => {
  const timestamp = Date.parse(`${day}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === day;
});
const isoTime = z.string().datetime();
export const archiveRelativePath = z.string().min(1).refine((value) =>
  !value.startsWith('/') && !/[\\\x00-\x1f]/.test(value) &&
  value.split('/').every((part) => part !== '' && part !== '.' && part !== '..'),
);
const market = z.object({ marketId: text, tokenIds: z.array(text).min(1) }).strict();
const universe = z.array(market).min(1).refine((markets) => {
  const marketIds = markets.map((entry) => entry.marketId);
  const tokenIds = markets.flatMap((entry) => entry.tokenIds);
  return new Set(marketIds).size === marketIds.length && new Set(tokenIds).size === tokenIds.length;
}, 'Market and token identifiers must be unique');

/** Trusted caller configuration; no policy, threshold, universe, or IC approval is inferred. */
export const l2CoveragePolicySchema = z.object({
  policyId: z.literal('utc-day-max-gap-v1'),
  startDayUtc: utcDay,
  endDayUtc: utcDay,
  maxGapMs: z.number().int().positive().lt(UTC_DAY_MS),
  maxClockSkewMs: z.number().int().nonnegative().lt(UTC_DAY_MS),
  expectedUniverse: universe,
  expectedManifestSha256: sha256,
  provenanceFilename: archiveRelativePath.refine((value) => value.endsWith('.jsonl')),
  icApproval: z.object({
    status: z.literal('APPROVED'),
    reference: text,
    approvedBy: text,
    approvedAtIso: isoTime,
  }).strict(),
}).strict().refine((policy) => policy.startDayUtc <= policy.endDayUtc, 'Invalid UTC-day range');

export type L2CoveragePolicy = z.infer<typeof l2CoveragePolicySchema>;
export type L2CoverageUniverse = L2CoveragePolicy['expectedUniverse'];

export const l2CoverageProvenanceSchema = z.object({
  version: z.literal(1),
  dataKind: z.enum(['genuine-market', 'TEST_ONLY', 'synthetic']),
  venue: z.literal('polymarket'),
  captureSource: z.literal('public-market-feed'),
  universe,
  files: z.array(z.object({
    relativePath: archiveRelativePath,
    sha256,
    sourceSessionIds: z.array(text).min(1).refine((ids) => new Set(ids).size === ids.length),
  }).strict()),
}).strict();

export type L2CoverageProvenance = z.infer<typeof l2CoverageProvenanceSchema>;

export const l2CoverageManifestSchema = z.object({
  version: z.literal(1),
  createdAtIso: isoTime,
  rootDir: text,
  fileCount: z.number().int().nonnegative(),
  totalBytes: z.number().int().nonnegative().safe(),
  manifestSha256: sha256,
  files: z.array(z.object({
    relativePath: archiveRelativePath,
    sizeBytes: z.number().int().nonnegative().safe(),
    sha256,
  }).strict()),
}).strict().refine((manifest) =>
  manifest.fileCount === manifest.files.length &&
  manifest.totalBytes === manifest.files.reduce((sum, file) => sum + file.sizeBytes, 0) &&
  new Set(manifest.files.map((file) => file.relativePath)).size === manifest.files.length,
'Invalid manifest inventory');

export type L2CoverageDayStatus = 'QUALIFIED' | 'MISSING' | 'GAP' | 'ZERO_FRAMES' | 'INVALID' | 'SYNTHETIC';
export interface L2CoverageDay {
  readonly dayUtc: string;
  readonly status: L2CoverageDayStatus;
  readonly validBookFrames: number;
  readonly reasons: readonly string[];
}

export function universeKey(value: L2CoverageUniverse): string {
  return JSON.stringify(value.map((entry) => [entry.marketId, [...entry.tokenIds].sort()])
    .sort((a, b) => String(a[0]) < String(b[0]) ? -1 : String(a[0]) > String(b[0]) ? 1 : 0));
}

export function policyUtcBounds(policy: L2CoveragePolicy): { startMs: number; endMs: number } {
  return {
    startMs: Date.parse(`${policy.startDayUtc}T00:00:00.000Z`),
    endMs: Date.parse(`${policy.endDayUtc}T00:00:00.000Z`) + UTC_DAY_MS,
  };
}
