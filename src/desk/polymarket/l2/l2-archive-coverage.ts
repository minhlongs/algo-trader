import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { verifyL2ArchiveManifest, type L2ArchiveManifest } from './l2-archive-manifest';
import { classifyL2CoverageDays, evaluateL2CoverageDays } from './l2-coverage-days';
import {
  archiveRelativePath, l2CoverageManifestSchema, l2CoveragePolicySchema, l2CoverageProvenanceSchema,
  policyUtcBounds, universeKey, type L2CoverageDay, type L2CoveragePolicy,
} from './l2-coverage-policy';
import { isSyntheticCoverageLabel, L2CoverageValidationError, readL2CoverageWal } from './l2-coverage-wal';

export interface L2ArchiveCoverageResult {
  readonly present: boolean;
  readonly manifestChecked: boolean;
  readonly manifestOk: boolean;
  readonly recordedL2Days: number;
  readonly days: readonly L2CoverageDay[];
}
export interface L2ArchiveCoverageOptions {
  readonly rootDir?: string;
  readonly manifestFilename: string;
  readonly policy?: L2CoveragePolicy;
  readonly generatedAtIso?: string;
}
function fail(message: string): never { throw new L2CoverageValidationError('INVALID', message); }

function readVerifiedFile(root: string, file: L2ArchiveManifest['files'][number]): Buffer {
  const bytes = readFileSync(join(root, file.relativePath));
  if (bytes.length !== file.sizeBytes || createHash('sha256').update(bytes).digest('hex') !== file.sha256) {
    fail('PROVENANCE file changed after manifest verification');
  }
  return bytes;
}

export function inspectL2ArchiveCoverage(options: L2ArchiveCoverageOptions, errors: string[]): L2ArchiveCoverageResult {
  let present = false, manifestChecked = false, manifestOk = false;
  let policy: L2CoveragePolicy | undefined;
  const result = (days: readonly L2CoverageDay[] = []): L2ArchiveCoverageResult => ({
    present, manifestChecked, manifestOk, days,
    recordedL2Days: days.filter((day) => day.status === 'QUALIFIED').length,
  });
  if (!options.rootDir) {
    manifestOk = true;
    return result();
  }
  try {
    const parsedPolicy = l2CoveragePolicySchema.safeParse(options.policy);
    if (parsedPolicy.success) policy = parsedPolicy.data;
    const root = resolve(options.rootDir);
    if (!existsSync(root)) {
      if (options.policy === undefined) {
        manifestOk = true;
        return result();
      }
      throw new L2CoverageValidationError('MISSING', 'archive directory does not exist');
    }
    present = true;
    if (!lstatSync(root).isDirectory()) fail('PROVENANCE archive must be a real directory');
    const filename = archiveRelativePath.parse(options.manifestFilename);
    const manifestPath = join(root, filename);
    if (!existsSync(manifestPath)) throw new L2CoverageValidationError('MISSING', 'verified L2 archive manifest');
    manifestChecked = true;
    if (!lstatSync(manifestPath).isFile()) fail('PROVENANCE manifest must be a regular file');
    const manifest = l2CoverageManifestSchema.parse(JSON.parse(readFileSync(manifestPath, 'utf8')));
    const verification = verifyL2ArchiveManifest(root, manifest);
    if (!verification.ok) {
      fail(`MANIFEST verification failed: missing=${verification.missing.length} mismatched=${verification.mismatched.length} unexpected=${verification.unexpected.length}`);
    }
    manifestOk = true;
    if (!parsedPolicy.success) return fail('POLICY missing/unknown coverage policy or explicit IC approval');
    const approvedPolicy = parsedPolicy.data;
    const evaluationMs = options.generatedAtIso === undefined ? Date.now() : Date.parse(options.generatedAtIso);
    if (!Number.isFinite(evaluationMs) || policyUtcBounds(approvedPolicy).endMs > evaluationMs ||
        Date.parse(approvedPolicy.icApproval.approvedAtIso) > evaluationMs) return fail('POLICY incomplete UTC day or future IC approval');
    if (approvedPolicy.expectedManifestSha256 !== manifest.manifestSha256) {
      manifestOk = false;
      return fail('MANIFEST digest does not match trusted policy');
    }
    const provenanceEntry = manifest.files.find((file) => file.relativePath === approvedPolicy.provenanceFilename);
    if (!provenanceEntry) return fail('PROVENANCE missing manifest-verified capture record');
    const provenance = l2CoverageProvenanceSchema.parse(JSON.parse(readVerifiedFile(root, provenanceEntry).toString('utf8')));
    if (provenance.dataKind !== 'genuine-market' || isSyntheticCoverageLabel(filename) ||
        isSyntheticCoverageLabel(approvedPolicy.provenanceFilename)) {
      throw new L2CoverageValidationError('SYNTHETIC', 'TEST_ONLY/synthetic capture excluded');
    }
    if (universeKey(provenance.universe) !== universeKey(approvedPolicy.expectedUniverse)) return fail('UNIVERSE market/token mapping does not match approved universe');
    const archivedFiles = manifest.files.filter((file) => file.relativePath !== approvedPolicy.provenanceFilename);
    if (new Set(provenance.files.map((file) => file.relativePath)).size !== provenance.files.length ||
        archivedFiles.length !== provenance.files.length || archivedFiles.some((file) =>
          !provenance.files.some((entry) => entry.relativePath === file.relativePath && entry.sha256 === file.sha256))) {
      return fail('PROVENANCE file inventory/digests do not match verified manifest');
    }
    const data = readL2CoverageWal(root, provenance.files, approvedPolicy);
    const days = evaluateL2CoverageDays(approvedPolicy, data);
    for (const day of days) {
      if (day.status !== 'QUALIFIED') errors.push(`L2 ${day.dayUtc} ${day.status}: ${day.reasons.join('; ')}`);
    }
    return result(days);
  } catch (error: unknown) {
    const status = error instanceof L2CoverageValidationError ? error.status : 'INVALID';
    const message = error instanceof Error ? error.message : String(error);
    errors.push(`L2 ${status}: ${message}`);
    return result(policy ? classifyL2CoverageDays(policy, status, message) : []);
  }
}
