#!/usr/bin/env node

/**
 * Advisory script: checks if git worktrees are clean.
 * Exits 0 always (advisory only). Warns if worktrees exist AND main has uncommitted changes.
 * Usage: node scripts/check-worktree-clean.mjs
 */

import { execSync } from "node:child_process";

const repoRoot = process.env.GIT_WORK_TREE || process.cwd();

let worktreeOutput;
try {
  worktreeOutput = execSync("git worktree list", {
    cwd: repoRoot,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
} catch {
  console.log("Could not list worktrees. Is this a git repository?");
  process.exit(0);
}

const lines = worktreeOutput.split("\n").filter(Boolean);

if (lines.length <= 1) {
  console.log("No worktrees found (besides main). Nothing to check.");
  process.exit(0);
}

const worktrees = lines.map((line) => {
  const [path, ...rest] = line.split(/\s+/);
  const isBare = rest.some((t) => t === "(bare)");
  const isDetached = rest.some((t) => t === "(detached)");
  const hasChanges = rest.some((t) => t.includes("dirty"));
  return { path, isBare, isDetached, hasChanges };
});

const dirtyWorktrees = worktrees.filter((w) => w.hasChanges);

if (dirtyWorktrees.length === 0) {
  console.log("All worktrees clean.");
  process.exit(0);
}

console.warn("WARNING: Some worktrees have uncommitted changes:");
for (const wt of dirtyWorktrees) {
  console.warn(`  - ${wt.path}`);
}

const mainDir = worktrees.find((w) => w.path === repoRoot);
if (mainDir?.hasChanges) {
  console.warn(
    "Main working directory has uncommitted changes while worktrees are active.",
  );
  console.warn(
    "Consider committing or stashing before running parallel tasks.",
  );
}

process.exit(0);
