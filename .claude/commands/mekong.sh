#!/bin/bash
# mekong.sh — MekongMind harness commands for algo-trader
# Usage: /mekong <subcommand> [args]

set -euo pipefail

ME_CLI="me"
ME_REPO="/Users/macbook/Documents/me-deep-wrapper"

# Colors
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

check_me() {
    if ! command -v "$ME_CLI" >/dev/null 2>&1; then
        echo -e "${RED}ERROR: me CLI not found at $ME_CLI${RESET}"
        echo "Deploy: sudo ln -sf $ME_REPO/bin/me $ME_CLI"
        return 1
    fi
    if [ ! -d "$ME_REPO" ]; then
        echo -e "${RED}ERROR: me-deep-wrapper repo not found at $ME_REPO${RESET}"
        return 1
    fi
}

cmd_goal() {
    check_me || return 1
    local text="${1:-}"
    if [ -z "$text" ]; then
        "$ME_CLI" goal show
    else
        "$ME_CLI" goal "$text"
    fi
}

cmd_status() {
    check_me || return 1
    echo -e "${BOLD}${BLUE}=== MekongMind Status ===${RESET}"
    echo ""
    echo -e "${CYAN}Goal:${RESET}"
    "$ME_CLI" goal show 2>/dev/null | head -15
    echo ""
    echo -e "${CYAN}Gates:${RESET}"
    "$ME_CLI" solo gates verify 2>/dev/null | head -10
    echo ""
    echo -e "${CYAN}Bottleneck:${RESET}"
    "$ME_CLI" solo bottlenecks 2>/dev/null | head -5
}

cmd_step() {
    check_me || return 1
    local step="${1:-}"
    if [ -z "$step" ]; then
        echo "Usage: /mekong step <N>"
        return 1
    fi
    "$ME_CLI" step "$step"
}

cmd_solo() {
    check_me || return 1
    local dept="${1:-}"
    local note="${2:-ready}"
    if [ -z "$dept" ]; then
        "$ME_CLI" solo status
    else
        "$ME_CLI" solo run "$dept" ready "$note"
    fi
}

cmd_route() {
    check_me || return 1
    local command="${1:-}"
    if [ -z "$command" ]; then
        echo "Usage: /mekong route <command>"
        return 1
    fi
    "$ME_CLI" solo route "$command"
}

cmd_gates() {
    check_me || return 1
    "$ME_CLI" solo gates verify --strict
}

cmd_bottlenecks() {
    check_me || return 1
    "$ME_CLI" solo bottlenecks --strict
}

cmd_allow() {
    check_me || return 1
    local cmd="${1:-}"
    if [ -z "$cmd" ]; then
        echo "Usage: /mekong allow <command>"
        return 1
    fi
    "$ME_CLI" solo allow "$cmd"
}

cmd_artifact() {
    check_me || return 1
    local gate="${1:-}"
    local dept="${2:-}"
    local note="${3:-}"
    if [ -z "$gate" ] || [ -z "$dept" ]; then
        echo "Usage: /mekong artifact <gate> <dept> [note]"
        return 1
    fi
    "$ME_CLI" solo artifact write "$gate" "$dept" "$note"
}

cmd_revenue() {
    check_me || return 1
    "${ME_CLI}" solo revenue "${@:2}"
}

cmd_dna() {
    check_me || return 1
    "$ME_CLI" solo dna
}

cmd_map() {
    check_me || return 1
    "$ME_CLI" solo map "${@:2}"
}

cmd_layers() {
    check_me || return 1
    "$ME_CLI" solo layers "${@:2}"
}

cmd_rooms() {
    check_me || return 1
    "$ME_CLI" solo rooms "${@:2}"
}

cmd_doctrine() {
    check_me || return 1
    "$ME_CLI" solo doctrine "${@:2}"
}

cmd_products() {
    check_me || return 1
    "$ME_CLI" solo products "${@:2}"
}

cmd_loop() {
    check_me || return 1
    "$ME_CLI" solo loop "${@:2}"
}

cmd_departments() {
    check_me || return 1
    "$ME_CLI" solo departments
}

cmd_agents() {
    check_me || return 1
    "$ME_CLI" agents list
}

cmd_chain() {
    check_me || return 1
    local chain="${1:-}"
    if [ -z "$chain" ]; then
        echo "Usage: /mekong chain '<cmd1> && <cmd2>'"
        return 1
    fi
    "$ME_CLI" chain "$chain"
}

cmd_project() {
    check_me || return 1
    "$ME_CLI" project "${@:2}"
}

cmd_help() {
    cat <<'EOF'
╔══════════════════════════════════════════════════════════╗
║           MEKONG Harness — algo-trader                   ║
╠══════════════════════════════════════════════════════════╣
║  /mekong goal <text>     Create/show goal               ║
║  /mekong status          Goal + gate + bottleneck        ║
║  /mekong step <N>        Execute step N                  ║
║  /mekong solo <dept>     Run department                  ║
║  /mekong route <cmd>     Route command to dept           ║
║  /mekong gates           Verify gate artifacts           ║
║  /mekong bottlenecks     Next bottleneck                 ║
║  /mekong allow <cmd>     Check command allowed           ║
║  /mekong artifact <g><d> Record gate evidence            ║
║  /mekong revenue         Revenue operations              ║
║  /mekong dna             Inspect operating DNA           ║
║  /mekong map             CEO-view map                    ║
║  /mekong layers          Multi-layer SOP stack           ║
║  /mekong rooms           Department rooms                ║
║  /mekong departments     List all departments            ║
║  /mekong agents          List all agents                 ║
║  /mekong chain '<c1&&c2>' Command chain                  ║
║  /mekong project <cmd>   Run at project scope            ║
║  /mekong help            This help                       ║
╚══════════════════════════════════════════════════════════╝
EOF
}

# Main dispatch
case "${1:-help}" in
    goal)       shift; cmd_goal "$@" ;;
    status)     cmd_status ;;
    step)       shift; cmd_step "$@" ;;
    solo)       shift; cmd_solo "$@" ;;
    route)      shift; cmd_route "$@" ;;
    gates)      cmd_gates ;;
    bottlenecks) cmd_bottlenecks ;;
    allow)      shift; cmd_allow "$@" ;;
    artifact)   shift; cmd_artifact "$@" ;;
    revenue)    shift; cmd_revenue "$@" ;;
    dna)        shift; cmd_dna "$@" ;;
    map)        shift; cmd_map "$@" ;;
    layers)     shift; cmd_layers "$@" ;;
    rooms)      shift; cmd_rooms "$@" ;;
    doctrine)   shift; cmd_doctrine "$@" ;;
    products)   shift; cmd_products "$@" ;;
    loop)       shift; cmd_loop "$@" ;;
    departments) cmd_departments ;;
    agents)     cmd_agents ;;
    chain)      shift; cmd_chain "$@" ;;
    project)    shift; cmd_project "$@" ;;
    help|--help|-h) cmd_help ;;
    *)           echo "Unknown: $1. /mekong help for commands."; exit 1 ;;
esac
