/**
 * Polymarket Market-Blind Prospective Logger CLI (Node.js JSONL `0o600`).
 *
 * Usage:
 *   npx tsx scripts/poly-market-blind-logger.ts --ledger <path> commit --question-id <id> --raw-prob <p> --evidence <text> --model-version <ver> [--prompt-version <ver>] [--category <cat>] [--committed-at-ms <ms>]
 *   npx tsx scripts/poly-market-blind-logger.ts --ledger <path> attach-price --entry-hash <hash> --market-prob <p> [--read-at-ms <ms>]
 *   npx tsx scripts/poly-market-blind-logger.ts --ledger <path> resolve --question-id <id> --status RESOLVED_YES|RESOLVED_NO|VOIDED|CANCELLED|UMA_DISPUTED [--entry-hash <hash>] [--resolved-at-ms <ms>] [--market-prob <p>]
 *   npx tsx scripts/poly-market-blind-logger.ts --ledger <path> --checkpoint <independent-path> status --mode empirical --model-version <ver> --policy <approved-policy.json>
 * Chẩn đoán không phải bằng chứng IC. / Diagnostic reports are not empirical IC evidence.
 * Commit metadata: --forecast-id --research-question-id --event-id --market-id --forecast-horizon-ms
 * Nguồn thật / Real provenance: --provenance-kind REAL --provenance-source <source> --provenance-reference <ref>.
 * Không tạo phê duyệt; ledger cũ thiếu checkpoint bị từ chối. / No approval creation or unanchored-ledger migration.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { approvedPolicySchema, settlementProvenanceSchema } from '../src/desk/polymarket/market-blind/market-blind-pipeline-contract';
import { trustedSettlementVerifierRegistrySchema } from '../src/desk/polymarket/market-blind/settlement-verification-contract';
import {
  ProspectivePipelineLedger,
  attachPostCommitMarketSnapshot,
  evaluateProspectiveOosReport,
  recordMarketBlindResolution,
  submitMarketBlindForecast,
  type MarketBlindResolutionState,
} from '../src/desk/polymarket/market-blind/market-blind-prospective-pipeline';
import { createNodeJsonlAppendStore } from '../src/desk/polymarket/market-blind/node-market-blind-ledger-adapter';

const DEFAULT_LEDGER_PATH = 'data/polymarket/market-blind-prospective.jsonl';
const VALID_STATUSES = new Set<MarketBlindResolutionState>(['RESOLVED_YES', 'RESOLVED_NO', 'VOIDED', 'CANCELLED', 'UMA_DISPUTED']);

interface ParsedCli {
  command: string;
  flags: Map<string, string>;
}

function parseCli(argv: readonly string[]): ParsedCli {
  let command = '';
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]!;
    if (token.startsWith('--')) {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new Error(`Missing value for flag ${token}`);
      }
      const name = token.slice(2);
      const known = new Set(['ledger', 'checkpoint', 'question-id', 'raw-prob', 'evidence', 'model-version', 'prompt-version', 'category', 'prompt', 'committed-at-ms', 'forecast-id', 'research-question-id', 'event-id', 'market-id', 'forecast-horizon-ms', 'provenance-kind', 'provenance-source', 'provenance-reference', 'entry-hash', 'market-prob', 'read-at-ms', 'source', 'status', 'resolved-at-ms', 'note', 'settlement-provenance', 'mode', 'policy', 'verifier-registry']);
      if (!known.has(name) || flags.has(name)) throw new Error(`Unknown or duplicate flag ${token}`);
      flags.set(name, value);
      i += 1;
    } else if (!command) {
      command = token;
    } else {
      throw new Error(`Unexpected positional argument: ${token}`);
    }
  }
  if (!command) throw new Error('Missing subcommand: expected commit | attach-price | resolve | status');
  return { command, flags };
}

function requireFlag(flags: Map<string, string>, name: string): string {
  const v = flags.get(name)?.trim();
  if (!v) throw new Error(`Missing required flag --${name}`);
  return v;
}

function parseNumberFlag(flags: Map<string, string>, name: string, required: true): number;
function parseNumberFlag(flags: Map<string, string>, name: string, required?: false): number | undefined;
function parseNumberFlag(flags: Map<string, string>, name: string, required = false): number | undefined {
  const raw = flags.get(name);
  if (raw === undefined) {
    if (required) throw new Error(`Missing required flag --${name}`);
    return undefined;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid numeric value for --${name}: ${raw}`);
  return parsed;
}

function main(): void {
  const { command, flags } = parseCli(process.argv.slice(2));
  const ledgerPath = resolve(process.cwd(), flags.get('ledger') ?? DEFAULT_LEDGER_PATH);
  const checkpointPath = resolve(process.cwd(), flags.get('checkpoint') ?? `${ledgerPath}.checkpoint.json`);
  const store = createNodeJsonlAppendStore(ledgerPath, checkpointPath);
  const ledger = ProspectivePipelineLedger.hydrateFromStore(store);

  if (command === 'commit') {
    const receipt = submitMarketBlindForecast(ledger, {
      questionId: requireFlag(flags, 'question-id'),
      pRaw: parseNumberFlag(flags, 'raw-prob', true),
      evidence: requireFlag(flags, 'evidence'),
      modelVersion: requireFlag(flags, 'model-version'),
      promptVersion: flags.get('prompt-version') ?? 'v1',
      category: flags.get('category') ?? 'general',
      prompt: flags.get('prompt'),
      committedAtMs: parseNumberFlag(flags, 'committed-at-ms'),
      forecastId: flags.get('forecast-id'),
      researchQuestionId: flags.get('research-question-id'),
      eventId: flags.get('event-id'),
      marketId: flags.get('market-id'),
      forecastHorizonMs: parseNumberFlag(flags, 'forecast-horizon-ms'),
      provenance: flags.has('provenance-kind') ? {
        kind: (() => {
          const kind = requireFlag(flags, 'provenance-kind');
          if (kind !== 'REAL' && kind !== 'SYNTHETIC') throw new Error('Invalid --provenance-kind');
          return kind;
        })(),
        source: requireFlag(flags, 'provenance-source'),
        reference: requireFlag(flags, 'provenance-reference'),
      } : undefined,
    });
    process.stdout.write(`${JSON.stringify({ ledgerPath, receipt }, null, 2)}\n`);
    return;
  }

  if (command === 'attach-price') {
    const snapshot = attachPostCommitMarketSnapshot(ledger, requireFlag(flags, 'entry-hash'), {
      marketProb: parseNumberFlag(flags, 'market-prob', true),
      marketReadAtMs: parseNumberFlag(flags, 'read-at-ms'),
      source: flags.get('source'),
    });
    process.stdout.write(`${JSON.stringify({ ledgerPath, snapshot }, null, 2)}\n`);
    return;
  }

  if (command === 'resolve') {
    const rawStatus = requireFlag(flags, 'status') as MarketBlindResolutionState;
    if (!VALID_STATUSES.has(rawStatus)) {
      throw new Error(`Invalid --status: ${rawStatus}`);
    }
    const provenancePath = flags.get('settlement-provenance');
    const settlementProvenance = provenancePath
      ? settlementProvenanceSchema.parse(JSON.parse(readFileSync(resolve(process.cwd(), provenancePath), 'utf8')) as unknown)
      : undefined;
    const records = recordMarketBlindResolution(ledger, {
      questionId: flags.get('question-id'),
      entryHash: flags.get('entry-hash'),
      status: rawStatus,
      resolvedAtMs: parseNumberFlag(flags, 'resolved-at-ms'),
      marketProb: parseNumberFlag(flags, 'market-prob'),
      marketReadAtMs: parseNumberFlag(flags, 'read-at-ms'),
      note: flags.get('note'),
      settlementProvenance,
    });
    process.stdout.write(`${JSON.stringify({ ledgerPath, resolutions: records }, null, 2)}\n`);
    return;
  }

  if (command === 'status') {
    const mode = flags.get('mode') ?? 'diagnostic';
    if (mode !== 'diagnostic' && mode !== 'empirical') throw new Error('Invalid --mode');
    const policyPath = flags.get('policy');
    const policy = policyPath ? approvedPolicySchema.parse(JSON.parse(readFileSync(resolve(process.cwd(), policyPath), 'utf8')) as unknown) : undefined;
    const registryPath = flags.get('verifier-registry');
    const settlementVerifierRegistry = registryPath
      ? trustedSettlementVerifierRegistrySchema.parse(JSON.parse(readFileSync(resolve(process.cwd(), registryPath), 'utf8')) as unknown)
      : undefined;
    const report = evaluateProspectiveOosReport(ledger, { category: flags.get('category'), mode, modelVersion: flags.get('model-version'), policy, settlementVerifierRegistry });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }

  throw new Error(`Unknown subcommand: ${command}`);
}

try {
  main();
} catch (err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`[poly-market-blind-logger] ERROR: ${msg}\n`);
  process.exitCode = 1;
}
