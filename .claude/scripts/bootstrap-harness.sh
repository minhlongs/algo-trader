#!/usr/bin/env bash
# bootstrap-harness.sh — Initialize algo-trader mekong harness integration
set -euo pipefail
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
PASS=0; FAIL=0
check() { local label="$1"; local result="$2"; if [ "$result" = "pass" ]; then echo -e "${GREEN}[PASS]${NC} $label"; PASS=$((PASS+1)); else echo -e "${RED}[FAIL]${NC} $label"; FAIL=$((FAIL+1)); fi; }
echo "=== Mekong Harness Bootstrap ==="
echo "Project: /Users/macbook/algo-trader"
echo ""
if [ -d "/Users/macbook/Documents/me-deep-wrapper" ]; then check "me-deep-wrapper exists" "pass"; else check "me-deep-wrapper exists" "fail"; echo -e "${RED}FATAL: me-deep-wrapper not found${NC}"; exit 1; fi
if zsh -ic 'command -v me' 2>/dev/null | grep -q '/'; then check "me CLI available" "pass"; else check "me CLI available" "fail"; echo -e "${YELLOW} → Add to ~/.zshrc: export PATH${NC}"; fi
for dir in agents skills templates mcp; do mkdir -p "/Users/macbook/algo-trader/.claude/$dir"; check "Create .claude/$dir/" "pass"; done
echo ""
echo "--- Goal Sync Test ---"
if zsh -ic 'me goal show' 2>/dev/null | head -3 | grep -q 'goal'; then check "me goal show — connection OK" "pass"; else check "me goal show — connection OK" "fail"; echo -e "${YELLOW} → No active goal (normal for first run)${NC}"; fi
echo ""
echo "=== Harness Status ==="
echo -e "Passed: ${GREEN}$PASS${NC}"; echo -e "Failed: ${RED}$FAIL${NC}"
if [ "$FAIL" -eq 0 ]; then echo -e "${GREEN}Harness ready.${NC}"; exit 0; else echo -e "${YELLOW}Harness partially ready. Fix failures above.${NC}"; exit 1; fi
