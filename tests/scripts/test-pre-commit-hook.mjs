#!/usr/bin/env node
/**
 * Smoke-test the git pre-commit hook in isolated temp repos.
 * No external deps — uses node built-ins only.
 */
import { execSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const HOOK_SRC = new URL('../../scripts/git-hooks/pre-commit', import.meta.url).pathname;
const AGENTS_MD = new URL('../../AGENTS.md', import.meta.url).pathname;
let passed = 0;
let failed = 0;

function expect(label, ok, detail) {
  if (ok) { passed++; return; }
  failed++;
  console.error(`FAIL: ${label}`);
  if (detail) console.error(`  ${detail.split('\n').slice(0, 5).join('\n  ')}`);
}

function run(cmd, opts) {
  try { return { out: execSync(cmd, { encoding: 'utf-8', timeout: 15000, ...opts }), ok: true }; }
  catch (e) { return { out: (e.stderr || '') + (e.stdout || ''), ok: false, code: e.status }; }
}

function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'hook-test-'));
  // Init on a feature branch so H3 (no-main-commits) doesn't block setup
  run('git init -b feat/test-setup', { cwd: dir });
  run('git config user.email "test@test.com"', { cwd: dir });
  run('git config user.name "test"', { cwd: dir });
  cpSync(AGENTS_MD, join(dir, 'AGENTS.md'));
  mkdirSync(join(dir, 'scripts', 'git-hooks'), { recursive: true });
  cpSync(HOOK_SRC, join(dir, 'scripts', 'git-hooks', 'pre-commit'));
  run('chmod +x scripts/git-hooks/pre-commit', { cwd: dir });
  run('git config core.hooksPath scripts/git-hooks', { cwd: dir });
  // Initial commit on feature branch so HEAD exists
  run('git add AGENTS.md', { cwd: dir });
  run('git commit -m "init"', { cwd: dir });
  return dir;
}

function attemptCommit(dir, filename, content, msg) {
  writeFileSync(join(dir, filename), content);
  run(`git add ${filename}`, { cwd: dir });
  const r = run(`git commit -m "${msg}"`, { cwd: dir });
  return r;
}

// --- Tests ---

// Clean commit passes
{
  const dir = makeRepo();
  const r = attemptCommit(dir, 'clean.ts', 'export const x = 1;\n', 'test: clean');
  expect('clean commit passes', r.ok, r.out);
  rmSync(dir, { recursive: true, force: true });
}

// H2: eval blocked
{
  const dir = makeRepo();
  const r = attemptCommit(dir, 'bad.ts', "const x = eval('1+1');\n", 'test: eval');
  expect('H2 blocks eval()', !r.ok && /H2/.test(r.out), r.out);
  rmSync(dir, { recursive: true, force: true });
}

// H2: new Function blocked
{
  const dir = makeRepo();
  const r = attemptCommit(dir, 'bad.ts', 'const f = new Function("return 1");\n', 'test: newfn');
  expect('H2 blocks new Function()', !r.ok && /H2/.test(r.out), r.out);
  rmSync(dir, { recursive: true, force: true });
}

// H1: .env file blocked
{
  const dir = makeRepo();
  const r = attemptCommit(dir, '.env', 'API_KEY=sk-test123456789012345678\n', 'test: env');
  expect('H1 blocks .env', !r.ok && /H1/.test(r.out), r.out);
  rmSync(dir, { recursive: true, force: true });
}

// H1: .env.example allowed
{
  const dir = makeRepo();
  const r = attemptCommit(dir, '.env.example', 'API_KEY=\n', 'test: env.example');
  expect('H1 allows .env.example', r.ok, r.out);
  rmSync(dir, { recursive: true, force: true });
}

// H1: secret literal (OpenAI key) blocked
{
  const dir = makeRepo();
  const r = attemptCommit(dir, 'config.ts', "const k = 'sk-abcdefghijklmnopqrstuvwxyz123456';\n", 'test: key');
  expect('H1 blocks hardcoded secret', !r.ok && /H1/.test(r.out), r.out);
  rmSync(dir, { recursive: true, force: true });
}

// H6: --no-verify in code blocked
{
  const dir = makeRepo();
  const r = attemptCommit(dir, 'deploy.sh', '#!/bin/bash\ngit commit --no-verify\n', 'test: noverify');
  expect('H6 blocks --no-verify', !r.ok && /H6/.test(r.out), r.out);
  rmSync(dir, { recursive: true, force: true });
}

// Non-code files (e.g. .md) content is not scanned for eval/secrets
{
  const dir = makeRepo();
  const r = attemptCommit(dir, 'note.md', 'eval("bad") in example\n', 'test: md');
  expect('H2 skips .md files', r.ok, r.out);
  rmSync(dir, { recursive: true, force: true });
}

// Hook source itself is exempt
{
  const dir = makeRepo();
  mkdirSync(join(dir, 'scripts', 'git-hooks'), { recursive: true });
  writeFileSync(join(dir, 'scripts', 'git-hooks', 'helper.ts'), '// --no-verify pattern\n// eval(\n');
  run('git add scripts/git-hooks/helper.ts', { cwd: dir });
  const r = run('git commit -m "test: exempt"', { cwd: dir });
  expect('scripts/git-hooks sources are exempt', r.ok, r.out);
  rmSync(dir, { recursive: true, force: true });
}

// H3: committing on main blocked (needs a feature branch to test cleanly)
{
  const dir = makeRepo();
  // Create a feature branch first
  run('git checkout -b feat/test-branch', { cwd: dir });
  const r = attemptCommit(dir, 'clean.ts', 'export const ok = true;\n', 'test: feature');
  expect('feature branch commit passes', r.ok, r.out);
  // Create a main branch from current HEAD so we can test H3
  run('git branch main', { cwd: dir });
  run('git checkout main', { cwd: dir });
  const r2 = attemptCommit(dir, 'main.ts', 'export const m = 1;\n', 'test: main-commit');
  expect('H3 blocks commit on main', !r2.ok && /H3/.test(r2.out), r2.out);
  rmSync(dir, { recursive: true, force: true });
}

// Multiple violations reported
{
  const dir = makeRepo();
  run('git checkout -b feat/multi', { cwd: dir });
  const r = attemptCommit(dir, 'bad.ts', "eval('x');\nconst k = 'sk-abcdefghijklmnopqrstuvwxyz123456';\n", 'test: multi');
  expect('multiple violations block commit', !r.ok && /H2/.test(r.out) && /H1/.test(r.out), r.out);
  rmSync(dir, { recursive: true, force: true });
}

console.log(`\n${passed + failed} tests, ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
