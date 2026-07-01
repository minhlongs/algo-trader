#!/usr/bin/env bash
# Pre-build disk check — ensures enough space before compilation
# Non-blocking: warns if <1GB free but doesn't fail the build
set -euo pipefail
FREE_KB=$(df -k . 2>/dev/null | awk 'NR==2 {print $4}' || echo "0")
FREE_MB=$((FREE_KB / 1024))
if [ "$FREE_MB" -lt 1024 ] && [ "$FREE_MB" -gt 0 ]; then
  echo "⚠️  Warning: only ${FREE_MB}MB free disk space. Build may fail."
fi
echo "✓ Disk check: ${FREE_MB}MB free"
exit 0
