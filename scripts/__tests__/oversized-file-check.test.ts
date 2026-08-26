import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
// @ts-expect-error — plain .mjs module has no type declarations (scripts/ is outside tsconfig include)
import { countLines, collectFileLineCounts, evaluateOversizedFiles } from '../oversized-file-check.mjs';

const REPO_ROOT = join(__dirname, '..', '..');
const GATE_SCRIPT = join(REPO_ROOT, 'scripts', 'check-quality-baseline.mjs');

let tmpDir: string;

beforeEach(() => {
  tmpDir = `/tmp/oversized-file-check-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
});

function writeFixture(relPath: string, lineCount: number, trailingNewline = true): void {
  const full = join(tmpDir, relPath);
  mkdirSync(join(full, '..'), { recursive: true });
  const body = Array.from({ length: lineCount }, (_, i) => `// line ${i + 1}`).join('\n');
  writeFileSync(full, trailingNewline ? body + '\n' : body);
}

describe('countLines', () => {
  it('returns 0 for empty content', () => {
    expect(countLines('')).toBe(0);
  });

  it('counts a single line without trailing newline', () => {
    expect(countLines('hello')).toBe(1);
  });

  it('does not create a phantom line for a trailing newline', () => {
    expect(countLines('a\nb\n')).toBe(2);
  });

  it('counts a final line lacking a trailing newline', () => {
    expect(countLines('a\nb')).toBe(2);
  });

  it('treats a lone newline as one empty line', () => {
    expect(countLines('\n')).toBe(1);
  });

  it('handles CRLF content as visual lines (split on \\n only)', () => {
    expect(countLines('a\r\nb\r\n')).toBe(2);
  });
});

describe('collectFileLineCounts', () => {
  it('walks src/**/*.{ts,tsx} recursively and returns sorted repo-relative paths', () => {
    writeFixture('src/zeta/deep/b.tsx', 3);
    writeFixture('src/alpha/a.ts', 5);
    writeFixture('src/mid.mjs', 9); // non-ts ignored
    writeFixture('lib/outside.ts', 9); // outside src/ ignored

    const result = collectFileLineCounts(tmpDir);
    expect(result).toEqual([
      { path: 'src/alpha/a.ts', lines: 5 },
      { path: 'src/zeta/deep/b.tsx', lines: 3 },
    ]);
  });

  it('returns an empty array for an empty src tree', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    expect(collectFileLineCounts(tmpDir)).toEqual([]);
  });

  it('throws (fail loud) when the src directory is missing', () => {
    expect(() => collectFileLineCounts(tmpDir)).toThrow(/src directory not found/);
  });
});

describe('evaluateOversizedFiles', () => {
  const limit = 200;

  it('passes when no file exceeds the limit', () => {
    const current = [{ path: 'src/a.ts', lines: 100 }];
    const result = evaluateOversizedFiles(current, {}, limit);
    expect(result).toEqual({ newViolators: [], grownViolators: [], prunable: [], pass: true });
  });

  it('fails on a new violator not present in the baseline map', () => {
    const current = [{ path: 'src/new.ts', lines: 250 }];
    const result = evaluateOversizedFiles(current, {}, limit);
    expect(result.newViolators).toEqual(['src/new.ts']);
    expect(result.pass).toBe(false);
  });

  it('fails when a baseline violator grew', () => {
    const current = [{ path: 'src/old.ts', lines: 260 }];
    const result = evaluateOversizedFiles(current, { 'src/old.ts': 250 }, limit);
    expect(result.grownViolators).toEqual(['src/old.ts']);
    expect(result.pass).toBe(false);
  });

  it('passes when current violators are a subset with unchanged counts', () => {
    const current = [
      { path: 'src/a.ts', lines: 250 },
      { path: 'src/small.ts', lines: 50 },
    ];
    const baselineMap = { 'src/a.ts': 250, 'src/b.ts': 300 };
    const result = evaluateOversizedFiles(current, baselineMap, limit);
    expect(result.pass).toBe(true);
    expect(result.newViolators).toEqual([]);
    expect(result.grownViolators).toEqual([]);
  });

  it('allows shrinking and lists shrank-below-limit files as prunable', () => {
    const current = [{ path: 'src/fixed.ts', lines: 150 }];
    const result = evaluateOversizedFiles(current, { 'src/fixed.ts': 250 }, limit);
    expect(result.pass).toBe(true);
    expect(result.prunable).toEqual(['src/fixed.ts']);
  });

  it('lists deleted baseline files as prunable', () => {
    const result = evaluateOversizedFiles([], { 'src/gone.ts': 250 }, limit);
    expect(result.pass).toBe(true);
    expect(result.prunable).toEqual(['src/gone.ts']);
  });

  it('keeps shrank-but-still-over files out of prunable and passes', () => {
    const current = [{ path: 'src/trim.ts', lines: 220 }];
    const result = evaluateOversizedFiles(current, { 'src/trim.ts': 250 }, limit);
    expect(result.pass).toBe(true);
    expect(result.prunable).toEqual([]);
  });
});

describe('gate script integration (check 3c)', () => {
  it('imports the module and records filesOverMaxLines from the snapshot evaluation', () => {
    const source = readFileSync(GATE_SCRIPT, 'utf-8');
    expect(source).toContain("from './oversized-file-check.mjs'");
    expect(source).toContain('collectFileLineCounts');
    expect(source).toContain('evaluateOversizedFiles');
    expect(source).toContain('filesOverMaxLines');
    // The dead awk/find shell pipeline must be gone.
    expect(source).not.toContain('FNR==1');
  });

  it('fails loud (exit 1) when the snapshot is missing from the baseline', () => {
    const realBaseline = readFileSync(join(REPO_ROOT, 'quality-baseline.json'), 'utf-8');
    const stripped = JSON.parse(realBaseline);
    delete stripped.quality.oversizedFileBaseline;
    const tmpBaseline = join(tmpDir, 'quality-baseline.json');
    writeFileSync(tmpBaseline, JSON.stringify(stripped, null, 2));

    // Run the gate against a copy of the repo tree with the stripped baseline,
    // so the real quality-baseline.json is never touched.
    const harness = join(tmpDir, 'gate-harness.mjs');
    const scriptsDir = join(REPO_ROOT, 'scripts');
    // Rewrite ALL relative module imports to absolute paths — the harness
    // runs from tmpDir, so every sibling import must resolve explicitly.
    const gateSource = readFileSync(GATE_SCRIPT, 'utf-8')
      .replace("from './oversized-file-check.mjs'", `from ${JSON.stringify(join(scriptsDir, 'oversized-file-check.mjs'))}`)
      .replace("from './vitest-summary-reader.mjs'", `from ${JSON.stringify(join(scriptsDir, 'vitest-summary-reader.mjs'))}`)
      .replace("from './static-quality-checks.mjs'", `from ${JSON.stringify(join(scriptsDir, 'static-quality-checks.mjs'))}`)
      .replace("const ROOT = resolve(__dirname, '..');", `const ROOT = ${JSON.stringify(REPO_ROOT)};`)
      .replace(
        "const BASELINE_PATH = resolve(ROOT, 'quality-baseline.json');",
        `const BASELINE_PATH = ${JSON.stringify(tmpBaseline)};`,
      );
    writeFileSync(harness, gateSource);

    let status = 0;
    let output = '';
    try {
      output = execSync(`node ${harness} --quality`, { encoding: 'utf-8', stdio: 'pipe' });
    } catch (err) {
      const e = err as { status: number; stdout: string; stderr: string };
      status = e.status;
      output = `${e.stdout ?? ''}${e.stderr ?? ''}`;
    }
    expect(status).toBe(1);
    expect(output).toContain('oversizedFileBaseline');
  });
});
