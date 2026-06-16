#!/bin/bash
# mekong-context-inject.sh — Inject MekongMind context into Claude Code session
# Runs on SessionStart to provide goal/gate context
# Usage: .claude/hooks/mekong-context-inject.sh

ME_CLI="me"
ME_REPO="/Users/macbook/Documents/me-deep-wrapper"

if ! command -v "$ME_CLI" >/dev/null 2>&1 || [ ! -d "$ME_REPO" ]; then
    exit 0
fi

# Get active goal
GOAL=$("$ME_CLI" goal show 2>/dev/null | head -10)
if [ -n "$GOAL" ]; then
    echo "[mekong-context] Active goal:"
    echo "$GOAL"
    echo ""
fi

# Get gate status
GATES=$("$ME_CLI" solo gates verify 2>/dev/null | head -5)
if [ -n "$GATES" ]; then
    echo "[mekong-context] Gate status:"
    echo "$GATES"
    echo ""
fi

# Get next bottleneck
BOTTLENECK=$("$ME_CLI" solo bottlenecks 2>/dev/null | head -3)
if [ -n "$BOTTLENECK" ]; then
    echo "[mekong-context] Next bottleneck:"
    echo "$BOTTLENECK"
fi
