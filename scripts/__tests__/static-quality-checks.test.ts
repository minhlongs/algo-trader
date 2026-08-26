import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
// @ts-expect-error — plain .mjs module has no type declarations (scripts/ is outside tsconfig include)
import { collectSourceFiles, countPatternLines, countBannedImports } from '../static-quality-checks.mjs';

const REPO_ROOT = join(__dirname, '..', '..');
const GATE_SCRIPT = join(REPO_ROOT, 'scripts', 'check-quality-baseline.mjs');
const BANNED_IMPORTS = ['@/lib/auth', '@/lib/subscription', '@/lib/unified-tier-config', '@/lib/tier-gate'];

let tmpDir: string;

beforeEach(() => {
  tmpDir = `/tmp/static-quality-checks-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
});

function writeFixture(relPath: string, content: string): void {
  const full = join(tmpDir, relPath);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content);
}

describe('collectSourceFiles', () => {
  it('walks src/** recursively, .ts/.tsx only, sorted repo-relative paths', () => {
    writeFixture('src/zeta/deep/b.tsx', 'export const b = 1;\n');
    writeFixture('src/alpha/a.ts', 'export const a = 1;\n');
    writeFixture('src/mid.mjs', 'export const m = 1;\n'); // non-ts ignored
    writeFixture('lib/outside.ts', 'export const o = 1;\n'); // outside src/ ignored

    const result = collectSourceFiles(tmpDir);
    expect(result.map((f: { path: string }) => f.path)).toEqual([
      'src/alpha/a.ts',
      'src/zeta/deep/b.tsx',
    ]);
    expect(result[0].content).toBe('export const a = 1;\n');
  });

  it('returns an empty array for an empty src tree', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    expect(collectSourceFiles(tmpDir)).toEqual([]);
  });

  it('throws (fail loud) when the src directory is missing', () => {
    expect(() => collectSourceFiles(tmpDir)).toThrow(/src directory not found/);
  });

  it('skips symlinks (grep -r parity: symlinks are not followed)', () => {
    writeFixture('src/real.ts', 'const x: any = 1;\n');
    symlinkSync(join(tmpDir, 'src/real.ts'), join(tmpDir, 'src/link.ts'));

    const result = collectSourceFiles(tmpDir);
    expect(result.map((f: { path: string }) => f.path)).toEqual(['src/real.ts']);
    // The `: any` line must count once, not twice via the symlink.
    expect(countPatternLines(result, /: any\b/)).toBe(1);
  });
});

describe('countPatternLines', () => {
  it('counts matching LINES, not occurrences (two matches on one line count once)', () => {
    const files = [
      { path: 'src/a.ts', content: 'const a: any = 1;\nconst b: any = 2;\nclean line\n' },
      { path: 'src/b.ts', content: 'const c: any = f(: any);\n' }, // 2 matches, 1 line
    ];
    expect(countPatternLines(files, /: any\b/)).toBe(3);
  });

  it('returns 0 on zero matches (the grep-exit-1 landmine, now impossible)', () => {
    const files = [{ path: 'src/clean.ts', content: 'const a: number = 1;\n' }];
    expect(countPatternLines(files, /: any\b/)).toBe(0);
    expect(countPatternLines(files, /console\.(log|warn|error)/)).toBe(0);
    expect(countPatternLines([], /: any\b/)).toBe(0);
  });

  it('respects word boundaries (: anything is not : any)', () => {
    const files = [{ path: 'src/a.ts', content: 'const a: anything = 1;\nconst b: any[] = [];\n' }];
    expect(countPatternLines(files, /: any\b/)).toBe(1);
  });
});

describe('countBannedImports', () => {
  it('sums per banned literal; a line with two different banned imports counts 2', () => {
    const files = [
      {
        path: 'src/a.ts',
        content: "import { a } from '@/lib/auth';\nimport { b } from '@/lib/subscription';\n",
      },
      {
        path: 'src/b.ts',
        content: "import { c } from '@/lib/auth'; import { d } from '@/lib/tier-gate';\n",
      },
    ];
    // '@/lib/auth' matches 2 lines (one per file), subscription 1, tier-gate 1.
    expect(countBannedImports(files, BANNED_IMPORTS)).toBe(4);
  });

  it('returns 0 on zero matches', () => {
    const files = [{ path: 'src/clean.ts', content: "import { x } from '@/seed/db/client';\n" }];
    expect(countBannedImports(files, BANNED_IMPORTS)).toBe(0);
  });
});

describe('gate script source regression', () => {
  it('no longer contains json-summary or catch-PASS N/A, and wires both new modules', () => {
    const source = readFileSync(GATE_SCRIPT, 'utf-8');
    // The dead reporter and the false-compliance pattern must be gone.
    expect(source).not.toContain('json-summary');
    expect(source).not.toContain("'N/A', true");
    // The new mechanism must be present.
    expect(source).toContain('--reporter=json');
    expect(source).toContain('--outputFile=');
    expect(source).toContain("from './vitest-summary-reader.mjs'");
    expect(source).toContain("from './static-quality-checks.mjs'");
  });
});

describe('gate script integration (checks 3a/3b/3d fail-loud)', () => {
  function buildHarness(rootDir: string, baselinePath: string): string {
    const scriptsDir = join(REPO_ROOT, 'scripts');
    const gateSource = readFileSync(GATE_SCRIPT, 'utf-8')
      .replace("from './oversized-file-check.mjs'", `from ${JSON.stringify(join(scriptsDir, 'oversized-file-check.mjs'))}`)
      .replace("from './vitest-summary-reader.mjs'", `from ${JSON.stringify(join(scriptsDir, 'vitest-summary-reader.mjs'))}`)
      .replace("from './static-quality-checks.mjs'", `from ${JSON.stringify(join(scriptsDir, 'static-quality-checks.mjs'))}`)
      .replace("const ROOT = resolve(__dirname, '..');", `const ROOT = ${JSON.stringify(rootDir)};`)
      .replace(
        "const BASELINE_PATH = resolve(ROOT, 'quality-baseline.json');",
        `const BASELINE_PATH = ${JSON.stringify(baselinePath)};`,
      );
    const harness = join(tmpDir, 'gate-harness.mjs');
    writeFileSync(harness, gateSource);
    return harness;
  }

  function copyRealBaseline(): string {
    const path = join(tmpDir, 'quality-baseline.json');
    writeFileSync(path, readFileSync(join(REPO_ROOT, 'quality-baseline.json'), 'utf-8'));
    return path;
  }

  function runHarness(harness: string): { status: number; output: string } {
    try {
      const output = execSync(`node ${harness} --quality`, { encoding: 'utf-8', stdio: 'pipe' });
      return { status: 0, output };
    } catch (err) {
      const e = err as { status: number; stdout: string; stderr: string };
      return { status: e.status, output: `${e.stdout ?? ''}${e.stderr ?? ''}` };
    }
  }

  it('fails loud (exit 1, error named) when the tree has no src/', () => {
    const harness = buildHarness(tmpDir, copyRealBaseline()); // tmpDir has no src/
    const { status, output } = runHarness(harness);
    expect(status).toBe(1);
    expect(output).toContain('ERROR: static quality checks failed');
    expect(output).toContain('src directory not found');
    expect(output).not.toContain("'N/A'");
  });

  it('records PASS 0 for all three counts on a zero-match tree (grep-exit-1 case)', () => {
    writeFixture('src/clean.ts', 'export const clean: number = 1;\n');
    const harness = buildHarness(tmpDir, copyRealBaseline());
    const { status, output } = runHarness(harness);
    expect(status, output).toBe(0);
    expect(output).toMatch(/anyTypes\s+<=\d+\s+0\s+PASS/);
    expect(output).toMatch(/consoleCalls\s+<=\d+\s+0\s+PASS/);
    expect(output).toMatch(/bannedImports\s+0\s+0\s+PASS/);
  });
});
