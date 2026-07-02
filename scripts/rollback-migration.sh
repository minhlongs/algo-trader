#!/usr/bin/env bash
#
# rollback-migration.sh
# Rollback database migrations from a given number onward.
#
# Usage: ./scripts/rollback-migration.sh <migration_number>
#
# Example:
#   ./scripts/rollback-migration.sh 42
#   Reverts migration 042 and any later migrations in reverse order.
#
# The script delegates to the TypeScript rollback implementation.
# Requires: pnpm, ts-node, and a configured .env with DATABASE_URL.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Change to project root for consistent .env and tsconfig resolution
cd "$PROJECT_ROOT"

# Validate argument
if [ $# -lt 1 ]; then
  echo "Usage: $0 <migration_number>"
  echo "Example: $0 42  -- reverts migration 042 and any later migrations"
  exit 1
fi

MIGRATION_NUM="$1"

# Validate it's a positive integer
if ! [[ "$MIGRATION_NUM" =~ ^[0-9]+$ ]] || [ "$MIGRATION_NUM" -lt 1 ]; then
  echo "Error: Migration number must be a positive integer, got '$MIGRATION_NUM'"
  exit 1
fi

echo "=== Rollback Migration Script ==="
echo "Target: revert migrations from number $MIGRATION_NUM onward"
echo ""

# Run the TypeScript rollback script via ts-node
pnpm exec ts-node scripts/rollback-migration.ts "$MIGRATION_NUM"
EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
  echo ""
  echo "Rollback completed successfully."
else
  echo ""
  echo "Rollback failed with exit code $EXIT_CODE. Check logs above."
fi

exit $EXIT_CODE
