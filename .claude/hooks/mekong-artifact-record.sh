#!/bin/bash
# mekong-artifact-record.sh — Post-implementation artifact recording
# Records gate evidence after completing implementation work
# Usage: .claude/hooks/mekong-artifact-record.sh <gate> <dept> <note>

ME_CLI="me"
GATE="${1:-mvp-live}"
DEPT="${2:-engineering-factory}"
NOTE="${3:-implementation complete}"

if ! command -v "$ME_CLI" >/dev/null 2>&1; then
    echo "[mekong-artifact] SKIP: me CLI not found"
    exit 0
fi

echo "[mekong-artifact] Recording gate evidence:"
echo "  Gate: $GATE"
echo "  Dept: $DEPT"
echo "  Note: $NOTE"

"$ME_CLI" solo artifact write "$GATE" "$DEPT" "$NOTE" 2>/dev/null
RESULT=$?

if [ $RESULT -eq 0 ]; then
    echo "[mekong-artifact] OK: artifact recorded"
else
    echo "[mekong-artifact] WARN: artifact recording returned $RESULT"
fi
