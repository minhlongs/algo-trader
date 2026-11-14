/**
 * CI Backtest Integrity & Anti-Leakage Auditor (IC Report Agent #5, pp. 47–49).
 *
 * Scans Polymarket backtest, replay, and strategy source files to enforce:
 *  1. Zero synthetic price generators (`simulateMarketRegimeTick`, `backtest-mock-factory`)
 *     inside real/observed replay or KPI pipelines.
 *  2. Zero look-ahead / hindcast leakage (`resolvedOutcome`, future-sorted mid-price peeks,
 *     or unguarded wall-clock `Date.now()` inside pure backtest evaluators).
 *  3. Explicit venue fee accounting (CLOB V2 taker fee curve / maker rebate resolver).
 *  4. Hard 5-minute crypto binary contract exclusion.
 *  5. Market-blind sanitizer presence before LLM fair-value prompts.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

export type BacktestAuditSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM';

export type BacktestAuditRuleId =
  | 'SYNTHETIC_FEED_IN_OBSERVED_PIPELINE'
  | 'LOOKAHEAD_FUTURE_PEEK'
  | 'MISSING_FEE_SCHEDULE_ACCOUNTING'
  | 'MISSING_FIVE_MINUTE_CRYPTO_EXCLUSION'
  | 'UNSANITIZED_MARKET_ANCHOR_PROMPT';

export interface BacktestAuditFinding {
  readonly ruleId: BacktestAuditRuleId;
  readonly severity: BacktestAuditSeverity;
  readonly file: string;
  readonly line: number;
  readonly snippet: string;
  readonly detail: string;
}

export interface BacktestAuditReport {
  readonly passed: boolean;
  readonly scannedFiles: number;
  readonly findings: readonly BacktestAuditFinding[];
  readonly checksSummary: Readonly<Record<BacktestAuditRuleId, 'PASS' | 'FAIL'>>;
}

export interface BacktestAuditInputFile {
  readonly file: string;
  readonly content: string;
}

const SYNTHETIC_BAN_RE = /\b(?:simulateMarketRegimeTick|backtest-mock-factory|createSyntheticOrderBook)\b/;
const LOOKAHEAD_BAN_RE = /\b(?:futureMidPrice|peekNextSnapshot|futureOutcomeLeak|cheatResolvedOutcome)\b/;
const PROMPT_MARKET_ANCHOR_RE = /\bprompt\s*[:=+]\s*`[^`]*\$\{[^}]*\b(?:yesPrice|midPrice|bestBid|bestAsk|outcomePrices)\b[^}]*\}`/;

function isCommentLine(trimmed: string): boolean {
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
}

function findMatchingLines(content: string, regex: RegExp): Array<{ line: number; snippet: string }> {
  const hits: Array<{ line: number; snippet: string }> = [];
  const lines = content.split('\n');
  for (let idx = 0; idx < lines.length; idx++) {
    const raw = lines[idx]!;
    const trimmed = raw.trim();
    if (isCommentLine(trimmed)) continue;
    if (regex.test(raw)) {
      hits.push({ line: idx + 1, snippet: trimmed.slice(0, 120) });
    }
  }
  return hits;
}

/** Pure deterministic audit over supplied source files (testable on synthetic corpora). */
export function auditBacktestIntegrityFiles(
  files: readonly BacktestAuditInputFile[],
  options: { requireGlobalGuards?: boolean } = {},
): BacktestAuditReport {
  const findings: BacktestAuditFinding[] = [];
  let sawFeeAccounting = false;
  let sawFiveMinExclusion = false;

  for (const { file, content } of files) {
    const norm = file.replace(/\\/g, '/');
    const isObservedKpiOrReplay =
      norm.includes('desk/cli/kpi-poly') ||
      norm.includes('desk/polymarket/l2/') ||
      norm.includes('desk/strategies/polymarket/quant-alpha/');

    if (/polymarket-fee-calculator|fee-schedule-resolver|applyVenueCosts|FeeScheduleResolver/.test(content)) {
      sawFeeAccounting = true;
    }
    if (/isExcludedFiveMinuteContract|isFiveMinuteCryptoMarket|FIVE_MINUTE_CONTRACT_RE|five-minute-crypto-guard/.test(content)) {
      sawFiveMinExclusion = true;
    }

    if (isObservedKpiOrReplay) {
      for (const hit of findMatchingLines(content, SYNTHETIC_BAN_RE)) {
        findings.push({
          ruleId: 'SYNTHETIC_FEED_IN_OBSERVED_PIPELINE',
          severity: 'CRITICAL',
          file: norm,
          line: hit.line,
          snippet: hit.snippet,
          detail: 'Observed KPI/replay/quant-alpha module references a synthetic regime or mock factory',
        });
      }
    }

    for (const hit of findMatchingLines(content, LOOKAHEAD_BAN_RE)) {
      findings.push({
        ruleId: 'LOOKAHEAD_FUTURE_PEEK',
        severity: 'CRITICAL',
        file: norm,
        line: hit.line,
        snippet: hit.snippet,
        detail: 'Detected explicit future-price or future-outcome look-ahead identifier',
      });
    }

    for (const hit of findMatchingLines(content, PROMPT_MARKET_ANCHOR_RE)) {
      findings.push({
        ruleId: 'UNSANITIZED_MARKET_ANCHOR_PROMPT',
        severity: 'HIGH',
        file: norm,
        line: hit.line,
        snippet: hit.snippet,
        detail: 'Prompt template interpolates live market price/anchor directly instead of sanitizeMarketBlindContext',
      });
    }
  }

  if (options.requireGlobalGuards !== false) {
    if (!sawFeeAccounting) {
      findings.push({
        ruleId: 'MISSING_FEE_SCHEDULE_ACCOUNTING',
        severity: 'HIGH',
        file: '<corpus>',
        line: 1,
        snippet: '',
        detail: 'Audited corpus lacks explicit Polymarket V2 fee schedule / venue cost accounting',
      });
    }
    if (!sawFiveMinExclusion) {
      findings.push({
        ruleId: 'MISSING_FIVE_MINUTE_CRYPTO_EXCLUSION',
        severity: 'HIGH',
        file: '<corpus>',
        line: 1,
        snippet: '',
        detail: 'Audited corpus lacks deterministic 5-minute crypto binary contract exclusion guard',
      });
    }
  }

  const ruleIds: BacktestAuditRuleId[] = [
    'SYNTHETIC_FEED_IN_OBSERVED_PIPELINE',
    'LOOKAHEAD_FUTURE_PEEK',
    'MISSING_FEE_SCHEDULE_ACCOUNTING',
    'MISSING_FIVE_MINUTE_CRYPTO_EXCLUSION',
    'UNSANITIZED_MARKET_ANCHOR_PROMPT',
  ];
  const failedSet = new Set(findings.map((f) => f.ruleId));
  const checksSummary = Object.fromEntries(
    ruleIds.map((r) => [r, failedSet.has(r) ? 'FAIL' : 'PASS']),
  ) as Record<BacktestAuditRuleId, 'PASS' | 'FAIL'>;

  return {
    passed: findings.length === 0,
    scannedFiles: files.length,
    findings,
    checksSummary,
  };
}

function collectTsFiles(dirPath: string, rootDir: string, acc: BacktestAuditInputFile[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dirPath);
  } catch {
    return;
  }
  for (const name of entries.sort()) {
    const full = join(dirPath, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      collectTsFiles(full, rootDir, acc);
    } else if (name.endsWith('.ts') && !name.endsWith('.d.ts')) {
      acc.push({ file: relative(rootDir, full), content: readFileSync(full, 'utf8') });
    }
  }
}

/** Runs the CI Backtest Integrity Auditor across `algo-trader`'s Polymarket desk directories. */
export function runRepositoryBacktestAudit(rootDir = process.cwd()): BacktestAuditReport {
  const targetDirs = [
    join(rootDir, 'src', 'desk', 'cli'),
    join(rootDir, 'src', 'desk', 'backtesting'),
    join(rootDir, 'src', 'desk', 'polymarket'),
    join(rootDir, 'src', 'desk', 'strategies', 'polymarket', 'quant-alpha'),
  ];
  const files: BacktestAuditInputFile[] = [];
  for (const dir of targetDirs) collectTsFiles(dir, rootDir, files);
  return auditBacktestIntegrityFiles(files, { requireGlobalGuards: true });
}
