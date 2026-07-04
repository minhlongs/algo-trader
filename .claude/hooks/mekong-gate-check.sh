#!/bin/bash
# mekong-gate-check.sh — Pre-implementation gate verification
# Checks me-deep-wrapper gate status before allowing work to proceed
# Usage: .claude/hooks/mekong-gate-check.sh [command]

ME_CLI="me"
ME_REPO="/Users/macbook/Documents/me-deep-wrapper"

if ! command -v "$ME_CLI" >/dev/null 2>&1; then
    echo "[mekong-gate] SKIP: me CLI not found at $ME_CLI"
    exit 0
fi

if [ ! -d "$ME_REPO" ]; then
    echo "[mekong-gate] SKIP: me-deep-wrapper repo not found"
    exit 0
fi

# Get current gate status
GATE_STATUS=$("$ME_CLI" solo gates verify 2>/dev/null)
BOTTLENECK=$("$ME_CLI" solo bottlenecks 2>/dev/null)

echo "[mekong-gate] Current gate status:"
echo "$GATE_STATUS" | head -5
echo ""
echo "[mekong-gate] Next bottleneck:"
echo "$BOTTLENECK" | head -3
