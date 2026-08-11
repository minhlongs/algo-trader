#!/usr/bin/env node
// ci-gate-local.mjs — local CI parity gate (GitHub Actions replacement)
// Runs sequentially: typecheck → lint → test → secret scan → npm audit
// Exit 0 only if ALL stages pass.

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

const STAGES = [
  {
    name: "Type check (tsc --noEmit)",
    cmd: "npm run typecheck",
    timeout: 120_000,
  },
  {
    name: "ESLint",
    cmd: "npm run lint",
    timeout: 120_000,
  },
  {
    name: "Vitest",
    cmd: "npm run test",
    timeout: 180_000,
  },
  {
    // Re-uses existing secret-scan script in the same scripts/ directory.
    name: "Secret scan",
    cmd: "node scripts/ci-gate-secret-scan.mjs",
    timeout: 60_000,
  },
  {
    // audit-level=critical mirrors ci.yml Gate 1 hard fail on critical.
    name: "Dependency audit (critical)",
    cmd: "pnpm audit --audit-level=critical",
    timeout: 60_000,
  },
];

let failed = false;

for (const s of STAGES) {
  console.log(`\n── ${s.name} ──────────────────────────────`);
  try {
    const out = execSync(s.cmd, {
      encoding: "utf8",
      timeout: s.timeout,
      stdio: ["ignore", "inherit", "inherit"],
      env: { ...process.env, FORCE_COLOR: "0" },
    });
    console.log(`✅ ${s.name} passed.`);
  } catch (err) {
    failed = true;
    console.error(`❌ ${s.name} FAILED.\nCommand: ${s.cmd}`);
    // Give useful hints but don't stop — run all stages.
  }
}

console.log("\n──────────────────────────────────────");
if (failed) {
  console.error("❌ ci-gate-local: one or more stages failed. See output above.");
  process.exit(1);
}
console.log("✅ ci-gate-local: all gates passed.");
process.exit(0);
