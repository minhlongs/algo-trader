/**
 * Strategy Validation Script
 *
 * Validates that:
 * 1. All strategy files referenced in index.ts exist on disk
 * 2. All value exports in index.ts map to actual exported names in their source files
 * 3. Exported names follow the expected function naming convention (create*Tick)
 *
 * Runs as plain Node ESM — no TypeScript compilation required, fast in CI.
 *
 * Usage:
 *   node scripts/validate-strategies.mjs
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STRATEGIES_DIR = resolve(__dirname, '../src/desk/strategies/polymarket');
const INDEX_FILE = `${STRATEGIES_DIR}/index.ts`;

// --- Step 1: Parse index.ts for all exports ---
const indexSource = readFileSync(INDEX_FILE, 'utf-8');

// Match value exports:  export { createFooTick } from '@desk/strategies/polymarket/foo';
const valueExportRegex = /^export\s*\{\s*([^}]+)\s*\}\s*from\s*'@desk\/strategies\/polymarket\/([^']+)'/gm;

const valueExports = [];  // { name, file }
let match;

while ((match = valueExportRegex.exec(indexSource)) !== null) {
  const names = match[1].split(',').map(s => s.trim()).filter(Boolean);
  const file = match[2];
  for (const name of names) {
    valueExports.push({ name, file });
  }
}

const referencedFiles = [...new Set(valueExports.map(e => e.file))];

console.log(`\nStrategy index: ${valueExports.length} value exports across ${referencedFiles.length} files`);

let exitCode = 0;

// --- Step 2: Verify each referenced file exists on disk ---
console.log('\n-- Checking file existence --');
const missingFiles = [];
for (const fileName of referencedFiles) {
  const filePath = `${STRATEGIES_DIR}/${fileName}.ts`;
  if (!existsSync(filePath)) {
    console.error(`  ERROR: missing file: ${fileName}.ts`);
    missingFiles.push(fileName);
    exitCode = 1;
  }
}

if (missingFiles.length === 0) {
  console.log(`  All ${referencedFiles.length} referenced files exist on disk`);
}

// --- Step 3: Verify each exported name is actually exported from its source file ---
console.log('\n-- Checking export names in source files --');
const exportMismatches = [];

for (const { name, file } of valueExports) {
  const filePath = `${STRATEGIES_DIR}/${file}.ts`;
  if (!existsSync(filePath)) continue;  // Already reported above

  const source = readFileSync(filePath, 'utf-8');
  // Check if the name appears as an exported identifier in the source file
  const exportPattern = new RegExp(`\\bexport\\b[^;]*\\b${name}\\b`);
  if (!exportPattern.test(source)) {
    console.error(`  ERROR: '${name}' not found as export in ${file}.ts`);
    exportMismatches.push({ name, file });
    exitCode = 1;
  }
}

if (exportMismatches.length === 0) {
  console.log(`  All ${valueExports.length} exports verified in source files`);
}

// --- Step 4: Validate naming convention (create*Tick pattern) ---
console.log('\n-- Checking naming convention --');
const namingViolations = [];

for (const { name } of valueExports) {
  if (!/^create[A-Z].*Tick$/.test(name)) {
    console.warn(`  WARN: '${name}' does not follow create*Tick convention`);
    namingViolations.push(name);
  }
}

if (namingViolations.length === 0) {
  console.log(`  All ${valueExports.length} exports follow create*Tick convention`);
} else {
  console.warn(`  ${namingViolations.length} exports deviate from convention (warnings only)`);
}

// --- Summary ---
console.log('\n-- Summary --');
if (exitCode === 0) {
  console.log(
    `  PASS: ${referencedFiles.length} files present, ${valueExports.length} strategy functions validated`
  );
} else {
  console.error(`  FAIL: validation errors found (see above)`);
}

process.exit(exitCode);
