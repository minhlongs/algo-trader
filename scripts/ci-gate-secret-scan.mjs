#!/usr/bin/env node
// Gate 2 (Security) — static scan for hardcoded secrets.
// FAILS CI when high-confidence secret patterns appear in tracked source files.

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const PATTERNS = [
  { label: "AWS access key", re: /AKIA[0-9A-Z]{16}/g },
  { label: "GitHub token", re: /ghp_[A-Za-z0-9]{36}/g },
  { label: "GitHub fine-grained", re: /github_pat_[A-Za-z0-9_]{60,}/g },
  { label: "Slack bot token", re: /xox[baprs]-[A-Za-z0-9-]{10,}/g },
  { label: "Anthropic key", re: /sk-ant-[A-Za-z0-9-]{20,}/g },
  { label: "OpenAI key", re: /sk-[A-Za-z0-9]{48}/g },
  { label: "Stripe live key", re: /sk_live_[A-Za-z0-9]{24,}/g },
  { label: "Google API key", re: /AIza[0-9A-Za-z_-]{35}/g },
  { label: "Generic private key", re: /-----BEGIN (RSA|EC|OPENSSH|DSA) PRIVATE KEY-----/g },
];

const SCAN_GLOBS = ["src", "scripts", "migrations", "workers"];
const EXCLUDE = /(\.test\.|\.spec\.|__tests__|__fixtures__|fixtures|\.md$)/;

function listFiles() {
  const raw = execSync("git ls-files " + SCAN_GLOBS.join(" "), { encoding: "utf8" });
  return raw
    .split("\n")
    .filter(Boolean)
    .filter((p) => !EXCLUDE.test(p))
    .filter((p) => /\.(ts|tsx|js|mjs|cjs|sh|sql|yaml|yml|json)$/.test(p));
}

const hits = [];
for (const file of listFiles()) {
  let body;
  try {
    body = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  for (const { label, re } of PATTERNS) {
    const matches = body.match(re);
    if (matches && matches.length > 0) {
      hits.push({ file, label, sample: matches[0].slice(0, 12) + "…" });
    }
  }
}

if (hits.length === 0) {
  console.log("✅ Gate 2 (secret scan): 0 matches across tracked source files.");
  process.exit(0);
}

console.error("❌ Gate 2 (secret scan): potential secrets detected.");
for (const { file, label, sample } of hits) {
  console.error(`  • ${label} in ${file} — ${sample}`);
}
console.error("\nRemove or move to secret manager (CF secrets / .env untracked).");
process.exit(1);
