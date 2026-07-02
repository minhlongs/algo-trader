#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Run-All-Backtests — Iterates all strategies from the registry, runs a 30-day
# backtest for a representative sample, and writes results to CSV.
#
# Usage:
#   bash scripts/run-all-backtests.sh
#
# Output: reports/backtest-results.csv
# ──────────────────────────────────────────────────────────────────────────────

set -euo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo "$(dirname "$0")/..")"

echo "⏳ Running all backtests..."
echo "   This fetches live Gamma market data and backtests each strategy."
echo ""

pnpm exec tsx scripts/run-all-backtests.ts

echo ""
echo "✅ Done. Check reports/backtest-results.csv for results."
