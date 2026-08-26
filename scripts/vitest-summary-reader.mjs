/**
 * Vitest JSON-summary reader — pure Node, no shell, no catch.
 *
 * Reads and validates the JSON report written by
 *   npx vitest run --reporter=json --outputFile=<path>
 * (vitest 4.x removed the built-in `json-summary` reporter; the `json`
 * reporter + outputFile is the supported replacement).
 *
 * Fail-loud contract: throws on missing file, unparseable JSON, missing
 * required fields, or zero tests. The caller (check-quality-baseline.mjs
 * check 1) exits 1 instead of recording a false SKIP/PASS. A non-zero
 * vitest exit is NOT fatal by itself — vitest still writes the JSON when
 * tests merely fail, and failures surface through the passRate /
 * knownFailures records.
 */

import { readFileSync, existsSync } from 'node:fs';

/**
 * @param {unknown} parsed
 * @returns {asserts parsed is { numTotalTests: number, numPassedTests: number, numFailedTests: number }}
 */
function assertSummaryShape(parsed) {
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('readVitestJsonSummary: JSON root is not an object');
  }
  const summary = /** @type {Record<string, unknown>} */ (parsed);
  for (const field of ['numTotalTests', 'numPassedTests', 'numFailedTests']) {
    const value = summary[field];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw new Error(
        `readVitestJsonSummary: required field "${field}" missing or not a non-negative number`,
      );
    }
  }
  if (summary.numTotalTests === 0) {
    throw new Error(
      'readVitestJsonSummary: numTotalTests is 0 — vitest found no tests (config breakage)',
    );
  }
}

/**
 * Read and validate a vitest `--reporter=json --outputFile` report.
 *
 * @param {string} jsonPath absolute path to the JSON report file
 * @returns {{ numTotalTests: number, numPassedTests: number, numFailedTests: number, passRate: number }}
 *   passRate = (numTotalTests - numFailedTests) / numTotalTests * 100,
 *   rounded to 2 decimals (same math the gate used before the rewrite).
 * @throws {Error} on missing file / bad JSON / missing fields / zero tests
 */
export function readVitestJsonSummary(jsonPath) {
  if (!existsSync(jsonPath)) {
    throw new Error(
      `readVitestJsonSummary: summary file not found at ${jsonPath} ` +
        '(vitest hard-crashed, wrote no report, or found no test files)',
    );
  }

  const raw = readFileSync(jsonPath, 'utf-8');
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `readVitestJsonSummary: summary file is not valid JSON (${err?.message ?? err})`,
    );
  }

  assertSummaryShape(parsed);

  const { numTotalTests, numPassedTests, numFailedTests } = parsed;
  const passRate = parseFloat(
    (((numTotalTests - numFailedTests) / numTotalTests) * 100).toFixed(2),
  );
  return { numTotalTests, numPassedTests, numFailedTests, passRate };
}
