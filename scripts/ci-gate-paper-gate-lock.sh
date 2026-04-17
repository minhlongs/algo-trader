#!/usr/bin/env bash
# ci-gate-paper-gate-lock.sh — Pillar 1 Gate 6.
#
# Rule: `QWEN_LIVE_ELIGIBLE=true` must NEVER be committed as an ACTUAL
# ASSIGNMENT in any tracked config/env file. The flag is operator-runtime-
# only — set via process env at boot, never checked in. This guards the
# paper-first doctrine: a config leak would flip the live-trading gate at
# deploy time without operator intent.
#
# Only ACTUAL ASSIGNMENTS are flagged. Documentation references
# (TypeScript comments, YAML description strings, docs, plans, runbooks)
# are intentionally allowed — that's how the flag gets documented.
#
# Assignment patterns flagged:
#   .env*  : ^QWEN_LIVE_ELIGIBLE=true       (line-start, dotenv format)
#   YAML   : ^\s*QWEN_LIVE_ELIGIBLE:\s*["']?true["']?\s*$
#            ^\s*-\s*QWEN_LIVE_ELIGIBLE=true  (docker-compose list form)
#
# Exit codes:
#   0  clean
#   1  violation
#   2  tool error (git not found)

set -euo pipefail

if ! command -v git >/dev/null 2>&1; then
  echo "ERROR: git not on PATH" >&2
  exit 2
fi

VIOLATION=0

check_env_file() {
  local file="$1"
  # Match actual dotenv assignment at line start (ignoring leading whitespace).
  if grep -nE '^[[:space:]]*QWEN_LIVE_ELIGIBLE=["'\'']?true["'\'']?[[:space:]]*$' "$file" >/dev/null 2>&1; then
    echo "VIOLATION: $file contains QWEN_LIVE_ELIGIBLE=true assignment" >&2
    grep -nE '^[[:space:]]*QWEN_LIVE_ELIGIBLE=["'\'']?true["'\'']?[[:space:]]*$' "$file" >&2
    VIOLATION=1
  fi
}

check_yaml_file() {
  local file="$1"
  # Pattern 1: key: value  |  Pattern 2: - KEY=value (docker-compose environment list)
  if grep -nE '^[[:space:]]*(-[[:space:]]+)?QWEN_LIVE_ELIGIBLE[[:space:]]*[:=][[:space:]]*["'\'']?true["'\'']?[[:space:]]*$' "$file" >/dev/null 2>&1; then
    echo "VIOLATION: $file contains QWEN_LIVE_ELIGIBLE: true / =true assignment" >&2
    grep -nE '^[[:space:]]*(-[[:space:]]+)?QWEN_LIVE_ELIGIBLE[[:space:]]*[:=][[:space:]]*["'\'']?true["'\'']?[[:space:]]*$' "$file" >&2
    VIOLATION=1
  fi
}

# Scan env files (tracked .env*) — flag actual dotenv assignments.
while IFS= read -r file; do
  [ -z "$file" ] && continue
  check_env_file "$file"
done < <(git ls-files | grep -E '^\.env$|^\.env\.' || true)

# Scan docker YAML files — flag actual YAML key:value or compose list form.
while IFS= read -r file; do
  [ -z "$file" ] && continue
  check_yaml_file "$file"
done < <(git ls-files | grep -E '^docker/.*\.ya?ml$' || true)

if [ "$VIOLATION" -ne 0 ]; then
  cat >&2 <<EOF

========================================================================
Gate 6 FAILED — Paper Gate Date Lock

Paper-first doctrine: QWEN_LIVE_ELIGIBLE=true must never be committed
as an actual assignment. Set it via process env at boot (shell,
launchd, docker run -e, etc.), not in a tracked file.

Paper gate runs until 2026-05-17 per PDF Solo Platform doctrine.
Before flipping live, follow docs/paper-gate-post-mortem-template.md.
========================================================================
EOF
  exit 1
fi

echo "Gate 6 PASSED — QWEN_LIVE_ELIGIBLE=true not present as an assignment in any tracked env/YAML file."
