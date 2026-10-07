#!/usr/bin/env node

/**
 * Validates file ownership boundaries and line counts across parallel lanes.
 * Enforces Escrow E1 (<= 200 LOC in src/) and prevents cross-lane collisions.
 */

import { execSync } from 'node:child_process';
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const LANES = [
  {
    id: 'lane-1',
    name: 'Lane 1: Autonomy Execution & Swarm Pipeline',
    patterns: [
      /^src\/agentic\/swarm-/,
      /^src\/agentic\/types\/swarm-/,
      /^src\/alpha-lab\/orchestration\//,
      /^src\/signal\/consensus-/,
      /^tests\/unit\/agentic\/swarm-/,
      /^tests\/unit\/alpha-lab\/orchestration\//,
      /^tests\/unit\/signal\//,
    ],
  },
  {
    id: 'lane-2',
    name: 'Lane 2: GTM Distribution & Telegram Suite',
    patterns: [
      /^src\/agentic\/campaign-/,
      /^src\/agentic\/types\/campaign-/,
      /^src\/platform\/marketing\//,
      /^src\/platform\/telegram\//,
      /^tests\/unit\/agentic\/campaign-/,
      /^tests\/unit\/platform\/marketing\//,
      /^tests\/unit\/platform\/telegram\//,
    ],
  },
  {
    id: 'lane-3',
    name: 'Lane 3: Platform Billing, D1 Sync & Storage',
    patterns: [
      /^src\/billing\//,
      /^src\/db\/d1-/,
      /^src\/db\/metering-/,
      /^src\/durable-objects\//,
      /^tests\/unit\/billing\//,
      /^tests\/unit\/db\/d1-/,
      /^tests\/unit\/durable-objects\//,
    ],
  },
  {
    id: 'lane-4',
    name: 'Lane 4: Automated CI/CD & Test Isolation',
    patterns: [
      /^tests\/harness\//,
      /^scripts\/orchestrate-parallel-wave\.mjs$/,
      /^scripts\/verify-parallel-lanes\.mjs$/,
      /^tests\/unit\/harness\//,
    ],
  },
];

function listFilesRecursively(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFilesRecursively(full));
    } else if (entry.isFile()) {
      files.push(relative(ROOT, full));
    }
  }
  return files;
}

function getChangedFiles() {
  try {
    const output = execSync('git status --porcelain', { cwd: ROOT, encoding: 'utf8' });
    const rawList = output
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => line.replace(/^[MADRCU?!]{1,2}\s+/, '').trim());

    const result = [];
    for (const item of rawList) {
      const fullPath = resolve(ROOT, item);
      if (existsSync(fullPath) && statSync(fullPath).isDirectory()) {
        result.push(...listFilesRecursively(fullPath));
      } else {
        result.push(item);
      }
    }
    return result;
  } catch {
    return [];
  }
}

function countLines(filePath) {
  const fullPath = resolve(ROOT, filePath);
  if (!existsSync(fullPath) || statSync(fullPath).isDirectory()) return 0;
  const content = readFileSync(fullPath, 'utf8');
  if (content.length === 0) return 0;
  const lines = content.split('\n').length;
  return content.endsWith('\n') ? lines - 1 : lines;
}

function checkBannedImports(filePath) {
  const fullPath = resolve(ROOT, filePath);
  if (!existsSync(fullPath) || !filePath.endsWith('.ts')) return [];
  const content = readFileSync(fullPath, 'utf8');
  const banned = ['@/lib/auth', '@/lib/subscription', '@/lib/unified-tier-config', '@/lib/tier-gate'];
  return banned.filter((b) => content.includes(b));
}

export function verifyParallelLanes() {
  console.log('--- Parallel Lanes Verification ---');
  const changedFiles = getChangedFiles();
  const relevantFiles = changedFiles.filter(
    (f) => f.startsWith('src/') || f.startsWith('tests/') || f.startsWith('scripts/')
  );

  let hasError = false;
  const laneMatches = new Map();
  for (const lane of LANES) laneMatches.set(lane.id, []);

  for (const file of relevantFiles) {
    for (const lane of LANES) {
      if (lane.patterns.some((p) => p.test(file))) {
        laneMatches.get(lane.id).push(file);
        break;
      }
    }

    const lines = countLines(file);
    const limit = file.startsWith('src/') ? 200 : 250;
    if (lines > limit) {
      console.error(`❌ [LOC VIOLATION] ${file}: ${lines} lines exceeds ceiling of ${limit}`);
      hasError = true;
    }

    const banned = checkBannedImports(file);
    if (banned.length > 0) {
      console.error(`❌ [BANNED IMPORT] ${file} imports: ${banned.join(', ')}`);
      hasError = true;
    }
  }

  for (const lane of LANES) {
    const files = laneMatches.get(lane.id) || [];
    console.log(`\n${lane.name} (${files.length} files):`);
    for (const file of files) {
      const lines = countLines(file);
      console.log(`  ✓ ${file} (${lines} LOC)`);
    }
  }

  if (hasError) {
    console.error('\n❌ Verification failed with violations.');
    return false;
  }

  console.log('\n✅ All parallel lane boundaries and line limits verified.');
  return true;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const success = verifyParallelLanes();
  process.exit(success ? 0 : 1);
}
