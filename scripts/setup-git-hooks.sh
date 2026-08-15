#!/usr/bin/env bash
# Wire git to use scripts/git-hooks/ instead of .git/hooks/
# Run once per clone: bash scripts/setup-git-hooks.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOOKS_DIR="$REPO_ROOT/scripts/git-hooks"

if [ ! -f "$HOOKS_DIR/pre-commit" ]; then
  echo "ERROR: $HOOKS_DIR/pre-commit not found" >&2
  exit 1
fi

chmod +x "$HOOKS_DIR/pre-commit"
git -C "$REPO_ROOT" config core.hooksPath scripts/git-hooks
echo "✓ core.hooksPath → scripts/git-hooks"
echo "✓ pre-commit is executable"
