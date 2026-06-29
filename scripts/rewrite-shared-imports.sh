#!/bin/bash
# Rewrite imports from old paths to new shared/ paths
# Usage: bash scripts/rewrite-shared-imports.sh
set -e

REWRITE_MODULES="utils db messaging resilience config validation"

for mod in $REWRITE_MODULES; do
  echo "Rewriting $mod imports..."
  find src/ tests/ -name "*.ts" -o -name "*.tsx" | while read f; do
    # Pattern: from '../$mod/' → from '../shared/$mod/'
    # Pattern: from '../../$mod/' → from '../../shared/$mod/'
    sed -i '' -E \
      -e "s|from '\.\./($mod/)|\1from '../shared/\1|g" \
      -e "s|from '\.\./\.\./($mod/)|\1from '../../shared/\1|g" \
      -e "s|from '\.\./\.\./\.\./($mod/)|\1from '../../../shared/\1|g" \
      -e "s|from '\.\./\.\./\.\./\.\./($mod/)|\1from '../../../../shared/\1|g" \
      "$f" 2>/dev/null || true
  done
  echo "  $mod done"
done

echo "All imports rewritten"
