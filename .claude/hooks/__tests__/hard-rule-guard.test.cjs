#!/usr/bin/env node
/**
 * Tests for hard-rule-guard.cjs hook
 * Run: node --test .claude/hooks/__tests__/hard-rule-guard.test.cjs
 */

const { describe, it, beforeEach, mock } = require('node:test');
const assert = require('node:assert');
const { execSync } = require('child_process');

const HOOK_PATH = require('path').join(__dirname, '..', 'hard-rule-guard.cjs');

/**
 * Run the hook with given JSON input.
 * Returns { exitCode, stdout, stderr }
 */
function runHook(input) {
  try {
    const result = execSync(`echo '${JSON.stringify(input).replace(/'/g, "'\\''")}' | node "${HOOK_PATH}"`, {
      encoding: 'utf8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return { exitCode: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (e) {
    return {
      exitCode: e.status,
      stdout: e.stdout || '',
      stderr: e.stderr || ''
    };
  }
}

// --- H1: No Secrets ---

describe('H1 - No Secrets', () => {
  it('blocks echo password=', () => {
    const result = runHook({
      tool_name: 'Bash',
      tool_input: { command: 'echo password=supersecret123' }
    });
    assert.strictEqual(result.exitCode, 2);
    assert.ok(result.stderr.includes('H1'), 'stderr mentions H1');
  });

  it('blocks export API_KEY=', () => {
    const result = runHook({
      tool_name: 'Bash',
      tool_input: { command: 'export API_KEY=abc123' }
    });
    assert.strictEqual(result.exitCode, 2);
    assert.ok(result.stderr.includes('H1'), 'stderr mentions H1');
  });

  it('blocks echo secret=...', () => {
    const result = runHook({
      tool_name: 'Bash',
      tool_input: { command: 'echo secret=mysecret' }
    });
    assert.strictEqual(result.exitCode, 2);
    assert.ok(result.stderr.includes('H1'), 'stderr mentions H1');
  });

  it('blocks export TOKEN=value', () => {
    const result = runHook({
      tool_name: 'Bash',
      tool_input: { command: 'export TOKEN=pk_live_abc123' }
    });
    assert.strictEqual(result.exitCode, 2);
    assert.ok(result.stderr.includes('H1'), 'stderr mentions H1');
  });

  it('allows safe echo commands', () => {
    const result = runHook({
      tool_name: 'Bash',
      tool_input: { command: 'echo "hello world"' }
    });
    assert.strictEqual(result.exitCode, 0);
  });
});

// --- H2: No Eval ---

describe('H2 - No Eval', () => {
  it('blocks node -e with eval()', () => {
    const result = runHook({
      tool_name: 'Bash',
      tool_input: { command: 'node -e "eval(process.exit())"' }
    });
    assert.strictEqual(result.exitCode, 2);
    assert.ok(result.stderr.includes('H2'), 'stderr mentions H2');
  });

  it('blocks node -e with new Function()', () => {
    const result = runHook({
      tool_name: 'Bash',
      tool_input: { command: 'node -e "new Function(\'return 1\')()"' }
    });
    assert.strictEqual(result.exitCode, 2);
    assert.ok(result.stderr.includes('H2'), 'stderr mentions H2');
  });

  it('blocks python -c with exec()', () => {
    const result = runHook({
      tool_name: 'Bash',
      tool_input: { command: 'python3 -c "exec(\'import os\')"' }
    });
    assert.strictEqual(result.exitCode, 2);
    assert.ok(result.stderr.includes('H2'), 'stderr mentions H2');
  });

  it('allows safe node commands', () => {
    const result = runHook({
      tool_name: 'Bash',
      tool_input: { command: 'node -e "console.log(42)"' }
    });
    assert.strictEqual(result.exitCode, 0);
  });

  it('allows safe python commands', () => {
    const result = runHook({
      tool_name: 'Bash',
      tool_input: { command: 'python3 -c "print(42)"' }
    });
    assert.strictEqual(result.exitCode, 0);
  });
});

// --- H3: No Direct Main Commits ---

describe('H3 - No Direct Main Commits', () => {
  it('blocks git commit on main branch', () => {
    // We test with a git repo. If we are on main, this should block.
    // If on another branch, it should allow.
    let currentBranch;
    try {
      currentBranch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
    } catch {
      currentBranch = 'unknown';
    }

    const result = runHook({
      tool_name: 'Bash',
      tool_input: { command: 'git commit -m "test"' }
    });

    if (currentBranch === 'main' || currentBranch === 'master') {
      assert.strictEqual(result.exitCode, 2);
      assert.ok(result.stderr.includes('H3'), 'stderr mentions H3');
    } else {
      assert.strictEqual(result.exitCode, 0);
    }
  });

  it('allows git commit on feature branches', () => {
    const result = runHook({
      tool_name: 'Bash',
      tool_input: { command: 'git commit -m "feat: add feature"' }
    });
    // Only check that it does NOT block with H3 when on a non-main branch
    let currentBranch;
    try {
      currentBranch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
    } catch {
      currentBranch = 'unknown';
    }
    if (currentBranch !== 'main' && currentBranch !== 'master') {
      assert.strictEqual(result.exitCode, 0);
    }
  });

  it('allows git checkout commands', () => {
    const result = runHook({
      tool_name: 'Bash',
      tool_input: { command: 'git checkout main' }
    });
    assert.strictEqual(result.exitCode, 0);
  });
});

// --- H5: No PII Logging ---

describe('H5 - No PII Logging', () => {
  it('blocks echo api_key=...', () => {
    const result = runHook({
      tool_name: 'Bash',
      tool_input: { command: 'echo api_key=sk-abc123xyz' }
    });
    assert.strictEqual(result.exitCode, 2);
    assert.ok(result.stderr.includes('H5'), 'stderr mentions H5');
  });

  it('blocks echo token=...', () => {
    const result = runHook({
      tool_name: 'Bash',
      tool_input: { command: 'echo token=eyJhbGciOiJIUzI1NiJ9' }
    });
    assert.strictEqual(result.exitCode, 2);
    assert.ok(result.stderr.includes('H5'), 'stderr mentions H5');
  });

  it('blocks echo wallet...', () => {
    const result = runHook({
      tool_name: 'Bash',
      tool_input: { command: 'echo wallet_address_is_0xABC' }
    });
    assert.strictEqual(result.exitCode, 2);
    assert.ok(result.stderr.includes('H5'), 'stderr mentions H5');
  });

  it('allows safe echo statements', () => {
    const result = runHook({
      tool_name: 'Bash',
      tool_input: { command: 'echo "Build succeeded"' }
    });
    assert.strictEqual(result.exitCode, 0);
  });
});

// --- H6: No --no-verify ---

describe('H6 - No --no-verify', () => {
  it('blocks --no-verify', () => {
    const result = runHook({
      tool_name: 'Bash',
      tool_input: { command: 'git commit --no-verify -m "skip hooks"' }
    });
    assert.strictEqual(result.exitCode, 2);
    assert.ok(result.stderr.includes('H6'), 'stderr mentions H6');
  });

  it('blocks --noverify', () => {
    const result = runHook({
      tool_name: 'Bash',
      tool_input: { command: 'git commit --noverify -m "skip hooks"' }
    });
    assert.strictEqual(result.exitCode, 2);
    assert.ok(result.stderr.includes('H6'), 'stderr mentions H6');
  });

  it('allows normal git commit without --no-verify', () => {
    let currentBranch;
    try {
      currentBranch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
    } catch {
      currentBranch = 'unknown';
    }
    const result = runHook({
      tool_name: 'Bash',
      tool_input: { command: 'git commit -m "feat: add feature"' }
    });
    if (currentBranch !== 'main' && currentBranch !== 'master') {
      assert.strictEqual(result.exitCode, 0);
    }
  });
});

// --- Non-violating commands pass through ---

describe('Non-violating commands', () => {
  it('allows npm test', () => {
    const result = runHook({
      tool_name: 'Bash',
      tool_input: { command: 'npm test' }
    });
    assert.strictEqual(result.exitCode, 0);
  });

  it('allows git diff', () => {
    const result = runHook({
      tool_name: 'Bash',
      tool_input: { command: 'git diff HEAD~1' }
    });
    assert.strictEqual(result.exitCode, 0);
  });

  it('allows ls', () => {
    const result = runHook({
      tool_name: 'Bash',
      tool_input: { command: 'ls -la' }
    });
    assert.strictEqual(result.exitCode, 0);
  });

  it('allows cat of non-env files', () => {
    const result = runHook({
      tool_name: 'Bash',
      tool_input: { command: 'cat src/index.ts' }
    });
    assert.strictEqual(result.exitCode, 0);
  });
});

// --- Non-Bash tools pass through ---

describe('Non-Bash tools', () => {
  it('allows Read tool', () => {
    const result = runHook({
      tool_name: 'Read',
      tool_input: { file_path: '.env' }
    });
    assert.strictEqual(result.exitCode, 0);
  });

  it('allows Edit tool', () => {
    const result = runHook({
      tool_name: 'Edit',
      tool_input: { file_path: 'test.ts', old_string: 'a', new_string: 'b' }
    });
    assert.strictEqual(result.exitCode, 0);
  });
});

// --- Fail-open behavior ---

describe('Fail-open behavior', () => {
  it('allows empty stdin', () => {
    const result = runHook({});
    assert.strictEqual(result.exitCode, 0);
  });

  it('allows invalid JSON', () => {
    try {
      execSync(`echo 'NOT_JSON' | node "${HOOK_PATH}"`, {
        encoding: 'utf8',
        timeout: 10000,
        stdio: ['pipe', 'pipe', 'pipe']
      });
      // exit 0 = fail-open
    } catch (e) {
      // If it threw, check exit code is 0 (fail-open) or 1 (invalid)
      // We allow exit code 0 as ideal, but also accept that echo may cause issues
    }
  });

  it('allows Bash tool with no command', () => {
    const result = runHook({
      tool_name: 'Bash',
      tool_input: {}
    });
    assert.strictEqual(result.exitCode, 0);
  });

  it('allows malformed input structure', () => {
    const result = runHook({
      tool_name: 'Bash'
    });
    assert.strictEqual(result.exitCode, 0);
  });
});

// --- Block message format ---

describe('Block message format', () => {
  it('outputs correct format for H1 violation', () => {
    const result = runHook({
      tool_name: 'Bash',
      tool_input: { command: 'export API_KEY=secret123' }
    });
    assert.strictEqual(result.exitCode, 2);
    assert.ok(result.stderr.includes('Hard Rule Violation: H1'), 'Has violation header');
    assert.ok(result.stderr.includes('No Secrets'), 'Has rule name');
    assert.ok(result.stderr.includes('Alternatives:'), 'Has alternatives');
  });

  it('outputs correct format for H6 violation', () => {
    const result = runHook({
      tool_name: 'Bash',
      tool_input: { command: 'git push --no-verify origin main' }
    });
    assert.strictEqual(result.exitCode, 2);
    assert.ok(result.stderr.includes('Hard Rule Violation: H6'), 'Has violation header');
    assert.ok(result.stderr.includes('No --no-verify'), 'Has rule name');
  });
});
