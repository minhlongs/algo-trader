#!/usr/bin/env node
/**
 * git-stash-block.cjs - Block git stash commands to prevent parallel session corruption
 *
 * Hard Rule H9: git stash is banned in this repo.
 * Stash operates on shared .git/refs/stash, not per-worktree — one session's
 * stash can corrupt another session's state (OmniRoute precedent).
 *
 * Detection: any form — stash, stash push, stash pop, stash list,
 *            stash drop, stash clear, stash apply, stash show, stash -p, -p, -u, -a
 *
 * Approval flow (same pattern as privacy-block):
 * 1. LLM runs: Bash "git stash" → BLOCKED
 * 2. LLM asks user via AskUserQuestion
 * 3. User approves
 * 4. LLM retries: Bash "GIT_STASH_APPROVED:<original command>" → ALLOWED
 */

const fs = require('fs');
const path = require('path');

// --- Config ---
const HOOK_NAME = 'git-stash-block';
const LOG_DIR = path.join(__dirname, '.logs');
const LOG_FILE = path.join(LOG_DIR, 'hook-log.jsonl');
const MAX_LOG_LINES = 1000;

// --- Detection ---
const STASH_PATTERN = /\bgit\s+stash\b/i;
const APPROVAL_PREFIX = 'GIT_STASH_APPROVED:';

// --- Logger ---
function logBlocked(command, reason) {
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE,
      JSON.stringify({
        ts: new Date().toISOString(),
        hook: HOOK_NAME,
        status: 'blocked',
        command: command.substring(0, 200),
        reason
      }) + '\n', 'utf-8');
  } catch (_) { /* never crash */ }
}

function logApproved(command) {
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE,
      JSON.stringify({
        ts: new Date().toISOString(),
        hook: HOOK_NAME,
        status: 'approved',
        command: command.substring(0, 200)
      }) + '\n', 'utf-8');
  } catch (_) { /* never crash */ }
}

// --- Message formatting ---
function formatBlockMessage(command) {
  return `\n\x1b[31mBLOCKED: git stash is banned in this repo (Hard Rule H9).\x1b[0m

  \x1b[33mWhy:\x1b[0m git stash operates on the shared repository object store (/.git/refs/stash),
  not per-worktree. In parallel sessions, stash from one session corrupts another.
  This is the OmniRoute precedent: stash corrupted parallel worktree sessions.

  \x1b[33mBlocked command:\x1b[0m ${command}

  \x1b[34mAlternatives:\x1b[0m
    \x1b[36mgit show <ref>:<path>\x1b[0m        Read file content at a ref without checkout
    \x1b[36mgit diff <ref> -- <path>\x1b[0m     View changes for a path between refs
    \x1b[36mgit worktree add\x1b[0m            Create a new worktree instead of stashing

  \x1b[90m@@PRIVACY_PROMPT_START@@\x1b[0m
${JSON.stringify({
    type: 'GIT_STASH_PROMPT',
    command: command,
    question: {
      header: 'Git Stash Blocked (H9)',
      text: `git stash is banned in this repo to prevent parallel session corruption. Command: "${command}". Override with explicit approval?`,
      options: [
        { label: 'Yes, override and allow', description: 'Run git stash this one time (unsafe for parallel sessions)' },
        { label: 'No, keep it blocked', description: 'Use git show/diff/worktree instead' }
      ]
    }
  }, null, 2)}
  \x1b[90m@@PRIVACY_PROMPT_END@@\x1b[0m

  \x1b[34mClaude:\x1b[0m Use AskUserQuestion tool with the JSON above, then:
    - If approved: Bash with command "GIT_STASH_APPROVED:${command}"
    - If rejected: Use git show/diff/worktree alternatives instead.
`;
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
    } catch (_) {
      process.exit(0); // invalid JSON — fail-open
    }

    const { tool_input: toolInput, tool_name: toolName } = hookData;

    // Only intercept Bash tool calls
    if (toolName !== 'Bash') {
      process.exit(0);
    }

    const command = toolInput && (toolInput.command || toolInput.input || '');

    if (!command || typeof command !== 'string') {
      process.exit(0); // no command — fail-open
    }

    // --- Approval path: allow if user already approved ---
    if (command.startsWith(APPROVAL_PREFIX)) {
      logApproved(command.substring(APPROVAL_PREFIX.length));
      process.exit(0);
    }

    // --- Detection ---
    if (!STASH_PATTERN.test(command)) {
      process.exit(0); // not a stash command — allow
    }

    // Blocked — show message and exit 2
    logBlocked(command, 'git stash command detected (H9)');
    console.error(formatBlockMessage(command));
    process.exit(2);

  } catch (e) {
    // Fail-open on crash
    try {
      if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
      fs.appendFileSync(LOG_FILE,
        JSON.stringify({ ts: new Date().toISOString(), hook: HOOK_NAME, status: 'crash', error: e.message }) + '\n',
        'utf-8');
    } catch (_) {}
    process.exit(0); // fail-open
  }
})();
