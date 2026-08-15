#!/usr/bin/env node
/**
 * hard-rule-guard.cjs - Enforce Hard Rules H1-H10 on Bash commands
 *
 * Blocks Bash tool calls that violate hard rules from AGENTS.md.
 * Rules enforced: H1 (no secrets), H2 (no eval), H3 (no main commits),
 *                 H5 (no PII logging), H6 (no --no-verify).
 * H10 (coverage ratchet) is not enforceable via Bash hook.
 *
 * Blocked commands exit with code 2. Errors exit 0 (fail-open).
 */

const { isHookEnabled } = require('./lib/ck-config-utils.cjs');
const { logHook } = require('./lib/hook-logger.cjs');
const { execSync } = require('child_process');

const HOOK_NAME = 'hard-rule-guard';

// --- Rule patterns ---

const RULES = [
  {
    id: 'H1',
    name: 'No Secrets',
    pattern: /\b(echo\s+.*password\s*=|echo\s+.*secret\s*=|export\s+\w*KEY\w*\s*=|export\s+\w*SECRET\w*\s*=|export\s+\w*TOKEN\w*\s*=|>\s*\.env\b|>\s*\.env\.local\b|>\s*\.env\.production\b)/i,
    explanation: 'Command leaks secrets or writes to .env files directly.',
    alternative: 'Use environment variables or a secrets manager. Never echo secrets or write .env directly in commands.'
  },
  {
    id: 'H2',
    name: 'No Eval',
    pattern: /\b(node\s+-e\s+["']\s*(eval\s*\(|new\s+Function\s*\()|python[23]?\s+-c\s+["']\s*exec\s*\()/i,
    explanation: 'Command uses eval/Function/exec which executes arbitrary code strings.',
    alternative: 'Import and call functions directly. Avoid dynamic code execution from strings.'
  },
  {
    id: 'H5',
    name: 'No PII Logging',
    pattern: /\b(echo\s+.*api_key\s*=|echo\s+.*token\s*=|echo\s+.*secret\s*=|echo\s+.*wallet)/i,
    explanation: 'Command echoes PII or credentials to stdout.',
    alternative: 'Use the logger utility. Never echo sensitive data to stdout.'
  },
  {
    id: 'H6',
    name: 'No --no-verify',
    pattern: /--no-verify|--noverify/,
    explanation: 'Command bypasses git hooks via --no-verify.',
    alternative: 'Fix the issue the hook is flagging instead of bypassing it.'
  }
];

// --- Detection ---

/**
 * Check if command contains a .env file write (H1 supplementary).
 * Catches: echo "..." > .env, cat > .env, tee .env, etc.
 */
function detectsDotEnvWrite(command) {
  const envWritePattern = />\s*\.env(\.\w+)?\b/;
  return envWritePattern.test(command);
}

/**
 * Check if current git branch is main or master.
 * @returns {boolean}
 */
function isOnMainBranch() {
  try {
    const branch = execSync('git branch --show-current', {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
    return branch === 'main' || branch === 'master';
  } catch {
    return false;
  }
}

/**
 * Check if command contains git commit.
 */
function isGitCommit(command) {
  return /\bgit\s+commit\b/.test(command);
}

/**
 * Run all checks on a command.
 * @param {string} command
 * @returns {{ blocked: boolean, rule?: object }}
 */
function checkRules(command) {
  for (const rule of RULES) {
    if (rule.pattern.test(command)) {
      return { blocked: true, rule };
    }
  }

  // H3 requires git branch check (not a simple regex)
  if (isGitCommit(command) && isOnMainBranch()) {
    return {
      blocked: true,
      rule: {
        id: 'H3',
        name: 'No Direct Main Commits',
        explanation: 'Direct commits to main/master branch are forbidden.',
        alternative: 'Create a feature branch and open a PR instead.'
      }
    };
  }

  // H1 supplement: check .env file writes
  if (detectsDotEnvWrite(command)) {
    return {
      blocked: true,
      rule: RULES[0] // H1
    };
  }

  return { blocked: false };
}

// --- Logging ---

function logBlocked(command, ruleId, reason) {
  logHook(HOOK_NAME, {
    status: 'blocked',
    command: command.substring(0, 200),
    ruleId,
    reason
  });
}

// --- Main ---

(async () => {
  try {
    let inputData = '';
    process.stdin.setEncoding('utf-8');
    for await (const chunk of process.stdin) {
      inputData += chunk;
    }

    if (!inputData.trim()) {
      process.exit(0); // no input — fail-open
    }

    let hookData;
    try {
      hookData = JSON.parse(inputData);
    } catch {
      process.exit(0); // invalid JSON — fail-open
    }

    // Guard: only check Bash tool
    const toolName = hookData.tool_name || hookData.toolName || '';
    if (toolName !== 'Bash') {
      process.exit(0);
    }

    // Check if hook is enabled
    if (!isHookEnabled(HOOK_NAME)) {
      process.exit(0);
    }

    const command = hookData.tool_input?.command || hookData.toolInput?.command || '';
    if (!command) {
      process.exit(0); // no command — fail-open
    }

    const { blocked, rule } = checkRules(command);

    if (blocked) {
      logBlocked(command, rule.id, rule.explanation);

      console.error(`\n\x1b[31mHard Rule Violation: ${rule.id} — ${rule.name}\x1b[0m`);
      console.error(`${rule.explanation}`);
      console.error(`\x1b[34mAlternatives:\x1b[0m ${rule.alternative}\n`);

      process.exit(2); // block
    }

    // No violation — allow
    process.exit(0);

  } catch (e) {
    // Fail-open on crash — never block due to internal error
    try {
      logHook(HOOK_NAME, {
        status: 'crash',
        error: e.message || String(e)
      });
    } catch (_) { /* never crash */ }
    process.exit(0);
  }
})();
