#!/bin/bash
# mekong-harness.sh — Integration functions for me-deep-wrapper
# Source this file in .claude/hooks/ or call directly

ME_CLI="me"
ME_REPO="/Users/macbook/Documents/me-deep-wrapper"

# Check if me-deep-wrapper is available
me_available() {
    command -v "$ME_CLI" >/dev/null 2>&1 && [ -d "$ME_REPO" ]
}

# Run me command with error handling
me_run() {
    if ! me_available; then
        echo "[mekong-harness] WARNING: me CLI not available at $ME_CLI"
        return 1
    fi
    "$ME_CLI" "$@" 2>&1
}

# Get current goal
mekong_goal_show() {
    me_run goal show 2>/dev/null || echo "No active goal"
}

# Get current gate status
mekong_gates_verify() {
    me_run solo gates verify --strict 2>/dev/null || echo "Gate verification failed"
}

# Get next bottleneck
mekong_bottleneck() {
    me_run solo bottlenecks --strict 2>/dev/null || echo "No bottleneck info"
}

# Check if command is allowed at current gate
mekong_allow() {
    local cmd="$1"
    me_run solo allow "$cmd" 2>/dev/null || echo "Command check failed"
}

# Record gate evidence
mekong_artifact_write() {
    local gate="$1"
    local dept="$2"
    local note="$3"
    me_run solo artifact write "$gate" "$dept" "$note" 2>/dev/null || echo "Artifact write failed"
}

# Validate artifact
mekong_artifact_validate() {
    local dept="$1"
    local path="$2"
    me_run solo artifact validate "$dept" "$path" 2>/dev/null || echo "Validation failed"
}

# Run department
mekong_solo_run() {
    local dept="$1"
    local note="${2:-ready}"
    me_run solo run "$dept" ready "$note" 2>/dev/null || echo "Department run failed"
}

# Export functions
export -f me_available me_run mekong_goal_show mekong_gates_verify
export -f mekong_bottleneck mekong_allow mekong_artifact_write
export -f mekong_artifact_validate mekong_solo_run
