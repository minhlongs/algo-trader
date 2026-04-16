/**
 * generate-weekly-draft.ts
 *
 * Pulls week-over-week stats from data/algo-trade.db (SQLite via sqlite3 CLI)
 * and recent git commits, then writes a markdown draft to plans/drafts/YYYY-WW-weekly.md.
 *
 * Run manually or via launchd (config/launchd/weekly-draft.plist).
 * Output is a human-review template — edit the top paragraph before posting.
 *
 * Deps: none beyond Node.js stdlib + sqlite3 CLI on PATH.
 */

import { execSync } from "child_process";
import { mkdirSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";

// Resolve project root as parent of this script's dir
const PROJECT_ROOT = join(dirname(__filename), "..");
const DB_PATH = join(PROJECT_ROOT, "data", "algo-trade.db");
const DRAFTS_DIR = join(PROJECT_ROOT, "plans", "drafts");

// ---------- date helpers ----------

function isoWeek(d: Date): number {
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const startOfWeek1 = new Date(jan4);
  startOfWeek1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  const diff = d.getTime() - startOfWeek1.getTime();
  return Math.floor(diff / (7 * 24 * 3600 * 1000)) + 1;
}

function weekSlug(d: Date): string {
  const yyyy = d.getFullYear();
  const ww = String(isoWeek(d)).padStart(2, "0");
  return `${yyyy}-${ww}`;
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
      timeout: 10_000,
    }).trim();
  } catch {
    return "";
  }
}

interface WeekStats {
  totalTrades: number;
  resolvedTrades: number;
  wins: number;
  losses: number;
  winRate: string;
  totalPnl: string;
  weekPnl: string;
  avgEdge: string;
}

function fetchWeekStats(since: Date): WeekStats {
  const sinceIso = since.toISOString();
  const T = "paper_trades_v3";

  const totalTradesRaw = querySqlite(
    `SELECT COUNT(*) FROM ${T} WHERE timestamp >= '${sinceIso}';`
  );
  const resolvedRaw = querySqlite(
    `SELECT COUNT(*) FROM ${T} WHERE timestamp >= '${sinceIso}' AND resolved=1;`
  );
  const winsRaw = querySqlite(
    `SELECT COUNT(*) FROM ${T} WHERE timestamp >= '${sinceIso}' AND resolved=1 AND correct=1;`
  );
  const lossesRaw = querySqlite(
    `SELECT COUNT(*) FROM ${T} WHERE timestamp >= '${sinceIso}' AND resolved=1 AND correct=0;`
  );
  const avgEdgeRaw = querySqlite(
    `SELECT ROUND(AVG(edge)*100,2) FROM ${T} WHERE timestamp >= '${sinceIso}';`
  );

  const totalTrades = parseInt(totalTradesRaw) || 0;
  const resolvedTrades = parseInt(resolvedRaw) || 0;
  const wins = parseInt(winsRaw) || 0;
  const losses = parseInt(lossesRaw) || 0;
  const winRate =
    resolvedTrades > 0
      ? `${((wins / resolvedTrades) * 100).toFixed(1)}%`
      : "n/a (paper pre-resolution)";

  return {
    totalTrades,
    resolvedTrades,
    wins,
    losses,
    winRate,
    totalPnl: "n/a (paper)",
    weekPnl: "n/a (paper)",
    avgEdge: avgEdgeRaw ? `${avgEdgeRaw}%` : "n/a",
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

// ---------- template ----------

function buildDraft(
  slug: string,
  since: Date,
  now: Date,
  stats: WeekStats,
  commits: string[]
): string {
  const commitsBlock =
    commits.length > 0
      ? commits.map((c) => `- \`${c}\``).join("\n")
      : "_No commits this week._";

  return `---
draft: true
week: ${slug}
generated: ${now.toISOString()}
period: ${formatDate(since)} → ${formatDate(now)}
---

# Weekly Build-In-Public · ${slug}

> **[HUMAN: replace this paragraph before posting]**
> _Write 2–3 sentences about what you actually did this week, your mindset, or one concrete story. Keep it honest — bad weeks count._

---

## Stats · Week ${slug}

| Metric | Value |
|---|---|
| New positions opened | ${stats.totalTrades} |
| Resolved this week | ${stats.resolvedTrades} |
| Wins / Losses | ${stats.wins} / ${stats.losses} |
| Win rate (resolved) | ${stats.winRate} |
| Week P&L | ${stats.weekPnl} |
| Cumulative P&L | ${stats.totalPnl} |
| Avg edge (new positions) | ${stats.avgEdge} |

_Live dashboard: [quant.cashclaw.cc](https://quant.cashclaw.cc) · Methodology: [manifesto](/docs/manifesto.md)_

---

## Commits This Week (${commits.length})

${commitsBlock}

---

## What Worked

- _[HUMAN: list 1–3 things that went well — specific strategies, signals, or process improvements]_

## What Didn't

- _[HUMAN: honest list — wrong calls, bugs, missed signals]_

## Next Week

- _[HUMAN: 1–3 concrete items on the roadmap]_

---

_Solo quant desk. Algorithmic position-taking on binary outcome markets. No capital, no team, just methodology._
_#BuildInPublic #SoloFounder #AlgorithmicTrading_
`;
}

// ---------- main ----------

function main(): void {
  const now = new Date();
  const since = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  const slug = weekSlug(now);
  const outFile = join(DRAFTS_DIR, `${slug}-weekly.md`);

  mkdirSync(DRAFTS_DIR, { recursive: true });

  const stats = fetchWeekStats(since);
  const commits = fetchGitLog(since);
  const draft = buildDraft(slug, since, now, stats, commits);

  writeFileSync(outFile, draft, "utf8");
  console.log(`Weekly draft written → ${outFile}`);
  console.log(`Trades this week: ${stats.totalTrades} | Win rate: ${stats.winRate} | Commits: ${commits.length}`);
}

main();
