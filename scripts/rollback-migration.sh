#!/bin/bash
# ──────────────────────────────────────────────────────────────
# rollback-migration.sh — Rollback D1 migrations for algo-trader-db
#
# Usage:
#   ./scripts/rollback-migration.sh <N>            # Rollback from migration N (inclusive)
#   ./scripts/rollback-migration.sh <N> --dry-run  # Show what would execute without running
#   ./scripts/rollback-migration.sh <N> --force    # Skip confirmation prompt
#
# Example:
#   ./scripts/rollback-migration.sh 2 --dry-run
#   → Rolls back 0002, then 0001 (reverse order)
#
# Migration file format:
#   -- @up
#   CREATE TABLE foo (...);
#   -- @down
#   DROP TABLE foo;
#
# Requires: wrangler >= 3.x, logged in (wrangler auth)
# ──────────────────────────────────────────────────────────────
set -euo pipefail

# ── Config ────────────────────────────────────────────────────
DB_NAME="algo-trader-db"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MIGRATIONS_DIR="${SCRIPT_DIR}/migrations"
DRY_RUN=false
FORCE=false

# ── Usage ─────────────────────────────────────────────────────
usage() {
    echo "Usage: $0 <N> [--dry-run] [--force]"
    echo ""
    echo "  N       Migration number to rollback from (inclusive)."
    echo "          e.g. 3 → rolls back 0003, 0002, 0001 in reverse order"
    echo "  --dry-run  Print what would be executed without running"
    echo "  --force    Skip confirmation prompt (USE WITH CAUTION)"
    exit 1
}

# ── Argument parsing ──────────────────────────────────────────
if [[ $# -lt 1 ]]; then
    echo "ERROR: Migration number argument required."
    usage
fi

MIGRATION_N="$1"
shift

# Validate migration number
if ! [[ "$MIGRATION_N" =~ ^[0-9]+$ ]]; then
    echo "ERROR: Migration number must be a positive integer, got: '$MIGRATION_N'"
    exit 1
fi

while [[ $# -gt 0 ]]; do
    case "$1" in
        --dry-run) DRY_RUN=true ;;
        --force)   FORCE=true ;;
        *)
            echo "ERROR: Unknown flag '$1'"
            usage
            ;;
    esac
    shift
done

# ── Pre-flight checks ────────────────────────────────────────
echo "=== D1 Migration Rollback ==="
echo "Database: ${DB_NAME}"
echo "Rollback from migration: ${MIGRATION_N}"
echo ""

# Check migrations directory exists
if [[ ! -d "$MIGRATIONS_DIR" ]]; then
    echo "ERROR: Migrations directory not found: ${MIGRATIONS_DIR}"
    exit 1
fi

# Check wrangler is available
if ! command -v wrangler &>/dev/null; then
    echo "ERROR: wrangler CLI not found. Install with: npm install -g wrangler"
    exit 1
fi

# ── Discover migration files ──────────────────────────────────
# Find all migration files, sort numerically, filter >= N
MIGRATION_FILES=()
for f in "$MIGRATIONS_DIR"/*.sql; do
    [[ -e "$f" ]] || continue
    basename "$f"
done | sort -t'-' -k1 -n | while IFS= read -r filename; do
    # Extract numeric prefix (everything before the first dash)
    num="${filename%%-*}"
    if [[ "$num" =~ ^[0-9]+$ ]] && [[ "$num" -ge "$MIGRATION_N" ]]; then
        echo "$MIGRATIONS_DIR/$filename"
    fi
done | sort -t'-' -k1 -rn > /tmp/rollback-migration-files.txt

# Read sorted files into array (reverse order: highest first)
while IFS= read -r file; do
    MIGRATION_FILES+=("$file")
done < /tmp/rollback-migration-files.txt
rm -f /tmp/rollback-migration-files.txt

if [[ ${#MIGRATION_FILES[@]} -eq 0 ]]; then
    echo "ERROR: No migration files found with number >= ${MIGRATION_N} in ${MIGRATIONS_DIR}"
    exit 1
fi

echo "Migrations to rollback (${#MIGRATION_FILES[@]} files):"
for f in "${MIGRATION_FILES[@]}"; do
    echo "  - $(basename "$f")"
done
echo ""

# ── Extract -- @down sections ─────────────────────────────────
DOWN_SECTIONS=()
MISSING_DOWN=()

for file in "${MIGRATION_FILES[@]}"; do
    filename=$(basename "$file")
    down_sql=$(awk '
        /--[[:space:]]*@down/ {
            # Check if @down is in the header comment block
            if (found_up == 0) {
                found_down = 1
                next
            }
        }
        /--[[:space:]]*@up/ { found_up = 1; next }
        /^--/ { next }                    # skip other comments
        /^[[:space:]]*$/ { next }         # skip blank lines
        { print }
    ' "$file")

    # Check if we actually found content
    if [[ -z "$down_sql" ]]; then
        echo "WARNING: No -- @down section found in ${filename}"
        MISSING_DOWN+=("$filename")
        continue
    fi

    DOWN_SECTIONS+=("$down_sql")
done

if [[ ${#MISSING_DOWN[@]} -gt 0 ]]; then
    echo ""
    echo "ERROR: The following migrations have no -- @down section and cannot be rolled back:"
    for f in "${MISSING_DOWN[@]}"; do
        echo "  - $f"
    done
    echo ""
    echo "Fix: Add a -- @down section with the reverse SQL to each migration file."
    echo "See: https://wrangler.cloudflare.com/guides/d1/rollbacks"
    exit 1
fi

# ── Dry run mode ──────────────────────────────────────────────
if [[ "$DRY_RUN" == true ]]; then
    echo "=== DRY RUN — no changes will be made ==="
    echo ""
    for i in "${!MIGRATION_FILES[@]}"; do
        file="${MIGRATION_FILES[$i]}"
        sql="${DOWN_SECTIONS[$i]}"
        echo "--- $(basename "$file") ---"
        echo "$sql"
        echo ""
    done
    echo "=== Dry run complete ==="
    exit 0
fi

# ── Confirmation ──────────────────────────────────────────────
if [[ "$FORCE" != true ]]; then
    echo "⚠️  WARNING: This will execute the following rollback SQL against ${DB_NAME}:"
    echo ""
    for i in "${!MIGRATION_FILES[@]}"; do
        echo "=== $(basename "${MIGRATION_FILES[$i]}") ==="
        echo "${DOWN_SECTIONS[$i]}"
        echo ""
    done
    echo ""
    read -p "Are you sure? Type 'yes' to confirm: " confirmation
    if [[ "$confirmation" != "yes" ]]; then
        echo "Rollback cancelled."
        exit 0
    fi
else
    echo "(--force flag set, skipping confirmation)"
fi

# ── Execute rollback ──────────────────────────────────────────
echo ""
echo "=== Starting rollback ==="
echo ""

FAILED=""
for i in "${!MIGRATION_FILES[@]}"; do
    file="${MIGRATION_FILES[$i]}"
    sql="${DOWN_SECTIONS[$i]}"
    filename=$(basename "$file")

    echo "[${filename}] Executing -- @down section..."

    # Write to temp file and use --file flag
    tmpfile=$(mktemp /tmp/rollback-${filename}.XXXXXX)
    echo "$sql" > "$tmpfile"

    if wrangler d1 execute "$DB_NAME" --remote --file="$tmpfile" 2>&1; then
        echo "[${filename}] ✓ Success"
        rm -f "$tmpfile"
    else
        echo "[${filename}] ✗ FAILED"
        echo "  Stopping rollback. Fix the error above and re-run from migration $(( i + 1 ))."
        rm -f "$tmpfile"
        exit 1
    fi

    echo ""
done

echo "=== Rollback complete ==="
echo "Rolled back ${#MIGRATION_FILES[@]} migration(s):"
for f in "${MIGRATION_FILES[@]}"; do
    echo "  ✓ $(basename "$f")"
done
