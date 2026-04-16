/**
 * generate-monthly-milestone.ts
 *
 * Scans full-month data from data/algo-trade.db and git log, then writes
 * a long-form markdown draft to plans/drafts/YYYY-MM-monthly.md.
 *
 * Intended for HN Show/Tell or long-form Twitter/X at month-end.
 * Human writes the narrative top section before posting (~10 min review).
 *
 * Deps: none beyond Node.js stdlib + sqlite3 CLI on PATH.
 */

import { execSync } from "child_process";
import { mkdirSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";

const PROJECT_ROOT = join(dirname(__filename), "..");
const DB_PATH = join(PROJECT_ROOT, "data", "algo-trade.db");
const DRAFTS_DIR = join(PROJECT_ROOT, "plans", "drafts");

// ---------- date helpers ----------

function monthSlug(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

function monthStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ---------- sqlite helpers ----------

function querySqlite(sql: string): string {
  if (!existsSync(DB_PATH)) return "";
  try {
    return execSync(`sqlite3 "${DB_PATH}" "${sql.replace(/"/g, '\\"')}"`, {
      encoding: "utf8",
      timeout: 15_000,
    }).trim();
  } catch {
    return "";
  }
}

interface MonthStats {
  totalTrades: number;
  resolvedTrades: number;
  wins: number;
  losses: number;
  winRate: string;
  monthPnl: string;
  cumulativePnl: string;
  avgEdge: string;
  bestMarket: string;
  worstMarket: string;
  activeDays: number;
}

function fetchMonthStats(since: Date): MonthStats {
  const sinceIso = since.toISOString();

  const totalTradesRaw = querySqlite(
    `SELECT COUNT(*) FROM trades WHERE created_at >= '${sinceIso}';`
  );
  const resolvedRaw = querySqlite(
    `SELECT COUNT(*) FROM trades WHERE resolved_at >= '${sinceIso}' AND status='resolved';`
  );
  const winsRaw = querySqlite(
    `SELECT COUNT(*) FROM trades WHERE resolved_at >= '${sinceIso}' AND outcome='win';`
  );
  const lossesRaw = querySqlite(
    `SELECT COUNT(*) FROM trades WHERE resolved_at >= '${sinceIso}' AND outcome='loss';`
  );
  const monthPnlRaw = querySqlite(
    `SELECT ROUND(SUM(pnl),2) FROM trades WHERE resolved_at >= '${sinceIso}';`
  );
  const cumPnlRaw = querySqlite(
    `SELECT ROUND(SUM(pnl),2) FROM trades WHERE status='resolved';`
  );
  const avgEdgeRaw = querySqlite(
    `SELECT ROUND(AVG(edge),4) FROM trades WHERE created_at >= '${sinceIso}';`
  );
  // Best market by total pnl this month
  const bestRaw = querySqlite(
    `SELECT market_slug FROM trades WHERE resolved_at >= '${sinceIso}' GROUP BY market_slug ORDER BY SUM(pnl) DESC LIMIT 1;`
  );
  const worstRaw = querySqlite(
    `SELECT market_slug FROM trades WHERE resolved_at >= '${sinceIso}' GROUP BY market_slug ORDER BY SUM(pnl) ASC LIMIT 1;`
  );
  const activeDaysRaw = querySqlite(
    `SELECT COUNT(DISTINCT DATE(created_at)) FROM trades WHERE created_at >= '${sinceIso}';`
  );

  const resolvedTrades = parseInt(resolvedRaw) || 0;
  const wins = parseInt(winsRaw) || 0;
  const winRate =
    resolvedTrades > 0
      ? `${((wins / resolvedTrades) * 100).toFixed(1)}%`
      : "n/a";

  return {
    totalTrades: parseInt(totalTradesRaw) || 0,
    resolvedTrades,
    wins,
    losses: parseInt(lossesRaw) || 0,
    winRate,
    monthPnl: monthPnlRaw || "0",
    cumulativePnl: cumPnlRaw || "0",
    avgEdge: avgEdgeRaw || "n/a",
    bestMarket: bestRaw || "n/a",
    worstMarket: worstRaw || "n/a",
    activeDays: parseInt(activeDaysRaw) || 0,
  };
}

// ---------- git helpers ----------

function fetchGitLog(since: Date): string[] {
  try {
    const raw = execSync(
      `git -C "${PROJECT_ROOT}" log --since="${since.toISOString()}" --oneline`,
      { encoding: "utf8", timeout: 10_000 }
    ).trim();
    if (!raw) return [];
    return raw.split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

function fetchGitStats(since: Date): { files: number; insertions: number; deletions: number } {
  try {
    const raw = execSync(
      `git -C "${PROJECT_ROOT}" diff --stat "$(git -C "${PROJECT_ROOT}" rev-list -1 --before="${since.toISOString()}" HEAD)" HEAD`,
      { encoding: "utf8", timeout: 10_000 }
    ).trim();
    // Parse last summary line: "X files changed, Y insertions(+), Z deletions(-)"
    const match = raw.match(/(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/);
    if (match) {
      return {
        files: parseInt(match[1]) || 0,
        insertions: parseInt(match[2]) || 0,
        deletions: parseInt(match[3]) || 0,
      };
    }
  } catch {
    // fallback: count commits
  }
  return { files: 0, insertions: 0, deletions: 0 };
}

// ---------- template ----------

function buildDraft(
  slug: string,
  since: Date,
  now: Date,
  stats: MonthStats,
  commits: string[],
  diffStats: { files: number; insertions: number; deletions: number }
): string {
  const commitsBlock =
    commits.length > 0
      ? commits.map((c) => `- \`${c}\``).join("\n")
      : "_No commits this month._";

  const winRateNum = parseFloat(stats.winRate);
  const accuracyNote =
    !isNaN(winRateNum) && winRateNum >= 55
      ? `**${stats.winRate}** — above the 55% live threshold outlined in the methodology.`
      : !isNaN(winRateNum)
      ? `**${stats.winRate}** — below the 55% threshold. Methodology adjustment in progress.`
      : "n/a — insufficient resolved trades.";

  return `---
draft: true
month: ${slug}
generated: ${now.toISOString()}
period: ${formatDate(since)} → ${formatDate(now)}
---

# Monthly Milestone · ${slug}

> **[HUMAN: write the opening narrative here — 3–5 sentences]**
> _What was the single most important thing that changed this month? What surprised you? What would you do differently? Be specific — generic recap = low engagement._

---

## The Numbers · ${slug}

| Metric | Value |
|---|---|
| Active trading days | ${stats.activeDays} |
| Total positions opened | ${stats.totalTrades} |
| Resolved | ${stats.resolvedTrades} |
| Wins / Losses | ${stats.wins} / ${stats.losses} |
| Win rate (resolved) | ${stats.winRate} |
| Month P&L | \$${stats.monthPnl} |
| Cumulative P&L | \$${stats.cumulativePnl} |
| Avg edge per position | ${stats.avgEdge} |
| Best market (by P&L) | ${stats.bestMarket} |
| Worst market (by P&L) | ${stats.worstMarket} |

**Accuracy note:** ${accuracyNote}

_All numbers verifiable live at [quant.cashclaw.cc](https://quant.cashclaw.cc)._

---

## Engineering This Month

| Metric | Value |
|---|---|
| Commits | ${commits.length} |
| Files changed | ${diffStats.files} |
| Lines added | +${diffStats.insertions} |
| Lines removed | -${diffStats.deletions} |

<details>
<summary>Commit log (${commits.length} commits)</summary>

${commitsBlock}

</details>

---

## What Worked

> _[HUMAN: 2–4 bullet points — specific strategies, signals, or process improvements that had measurable impact]_

-

## What Didn't

> _[HUMAN: honest list — wrong calls, failed experiments, time wasted. Bad months are the most credible posts.]_

-

## Methodology Update

> _[HUMAN: did you change any strategy parameters, market filters, or position-sizing rules this month? Describe the change and why.]_

_No changes_ / _Changed: ..._

## Next Month

> _[HUMAN: 2–3 concrete objectives with success criteria]_

1.
2.
3.

---

## Show HN / Context

> _[HUMAN: optional — paste a 3-sentence Show HN blurb here if posting to HN]_
> Format: "Show HN: [title] | [one-line description] | [link]"

---

_Solo quant desk operating on binary outcome markets. Methodology + all data public. No team, no outside capital._
_Read the full methodology: [docs/manifesto.md](../docs/manifesto.md)_
_#BuildInPublic #AlgorithmicTrading #SoloFounder_
`;
}

// ---------- main ----------

function main(): void {
  const now = new Date();
  const since = monthStart(now);
  const slug = monthSlug(now);
  const outFile = join(DRAFTS_DIR, `${slug}-monthly.md`);

  mkdirSync(DRAFTS_DIR, { recursive: true });

  const stats = fetchMonthStats(since);
  const commits = fetchGitLog(since);
  const diffStats = fetchGitStats(since);
  const draft = buildDraft(slug, since, now, stats, commits, diffStats);

  writeFileSync(outFile, draft, "utf8");
  console.log(`Monthly draft written → ${outFile}`);
  console.log(
    `Month: ${slug} | Trades: ${stats.totalTrades} | Win rate: ${stats.winRate} | Commits: ${commits.length}`
  );
}

main();
