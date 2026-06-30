#!/usr/bin/env bash
# ── Deploy cashclaw.cc landing page to CF Pages ──
# Usage: ./scripts/deploy-cf-pages.sh
#        ALLOW_DIRTY_DEPLOY=1 ./scripts/deploy-cf-pages.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SRC_DIR="$PROJECT_DIR/src"
REPORTS_DIR="$PROJECT_DIR/plans/reports"
CF_PROJECT="algo-trader"
CACHE_BUSTER_FILE="$PROJECT_DIR/.cache-version"

# ── Colors ──
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

echo "⚡ Deploy cashclaw.cc → CF Pages ($CF_PROJECT)"

# ── Gate 1: Source directory exists ──
if [ ! -f "$SRC_DIR/index.html" ]; then
  echo -e "${RED}✗ Missing src/index.html${NC}"
  exit 1
fi
if [ ! -f "$SRC_DIR/ui/design-system/tokens.css" ]; then
  echo -e "${RED}✗ Missing src/ui/design-system/tokens.css${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Source files present${NC}"

# ── Gate 2: Quality check — CSS variables match HTML usage ──
# macOS-compatible: use grep -oE with sed instead of grep -oP
CSS_VARS=$(grep -oE 'var\(--[a-zA-Z0-9-]+' "$SRC_DIR/ui/design-system/tokens.css" | sed 's/var(//' | sort -u)
HTML_USAGE=$(grep -oE 'var\(--[a-zA-Z0-9-]+' "$SRC_DIR/index.html" | sed 's/var(//' | sort -u)
MISSING_IN_CSS=$(comm -13 <(printf '%s\n' "$CSS_VARS") <(printf '%s\n' "$HTML_USAGE"))
if [ -n "$MISSING_IN_CSS" ]; then
  echo -e "${RED}✗ CSS variables used in HTML but missing from tokens.css:${NC}"
  echo "$MISSING_IN_CSS"
  exit 1
fi
echo -e "${GREEN}✓ CSS variable audit passed${NC}"

# ── Gate 3: Security headers ──
for header in "Strict-Transport-Security" "Content-Security-Policy" "X-Frame-Options" "Permissions-Policy"; do
  if ! grep -q "$header" "$SRC_DIR/_headers"; then
    echo -e "${RED}✗ Missing security header: $header${NC}"
    exit 1
  fi
done
echo -e "${GREEN}✓ Security headers verified${NC}"

# ── Gate 4: No secrets ──
if grep -qiE '(api_key|secret|token|password)\s*[=:]\s*["'"'"'][a-zA-Z0-9_-]{8,}' "$SRC_DIR/index.html" "$SRC_DIR/ui/design-system/tokens.css" 2>/dev/null; then
  echo -e "${RED}✗ Potential secrets detected in source${NC}"
  exit 1
fi
echo -e "${GREEN}✓ No secrets detected${NC}"

# ── Cache buster ──
CACHE_VER=1
if [ -f "$CACHE_BUSTER_FILE" ]; then
  CACHE_VER=$(cat "$CACHE_BUSTER_FILE")
else
  echo "1" > "$CACHE_BUSTER_FILE"
fi

# ── Deploy timestamp ──
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
DEPLOY_REPORT="$REPORTS_DIR/deploy-$(date +%y%m%d-%H%M%S).md"

echo ""
echo "🚀 Deploying to CF Pages..."

DEPLOY_OUTPUT=$(cd "$SRC_DIR" && npx wrangler pages deploy . --project-name "$CF_PROJECT" --branch=main 2>&1)
DEPLOY_URL=$(echo "$DEPLOY_OUTPUT" | grep -oE 'https://[a-z0-9]+\.algo-trader\.pages\.dev' | head -1)

if [ -z "$DEPLOY_URL" ]; then
  echo -e "${RED}✗ Deploy failed — no URL in output${NC}"
  echo "$DEPLOY_OUTPUT"
  exit 1
fi

echo -e "${GREEN}✓ Deployed: $DEPLOY_URL${NC}"

# ── Verify ──
echo ""
echo "🔍 Verifying deployment..."

HTTP_CODE=$(curl -sL -o /dev/null -w "%{http_code}" "$DEPLOY_URL")
if [ "$HTTP_CODE" != "200" ]; then
  echo -e "${RED}✗ HTTP $HTTP_CODE on $DEPLOY_URL${NC}"
  exit 1
fi

CSS_FIRST_LINE=$(curl -sL "$DEPLOY_URL/ui/design-system/tokens.css" | head -1)
CSS_SIZE=$(curl -sL "$DEPLOY_URL/ui/design-system/tokens.css" | wc -c)

echo -e "${GREEN}✓ HTTP 200${NC}"
echo -e "${GREEN}✓ tokens.css: $CSS_SIZE bytes${NC}"
echo -e "${GREEN}✓ CSS first line: $CSS_FIRST_LINE${NC}"

# ── Report ──
mkdir -p "$REPORTS_DIR"
cat > "$DEPLOY_REPORT" << EOF
# Deploy Report — $TIMESTAMP

| Field | Value |
|-------|-------|
| URL | $DEPLOY_URL |
| Custom Domain | cashclaw.cc + www.cashclaw.cc |
| CSS Size | $CSS_SIZE bytes |
| Cache Version | $CACHE_VER |
| Gate 1 (Source) | ✅ |
| Gate 2 (CSS Var Audit) | ✅ |
| Gate 3 (Security Headers) | ✅ |
| Gate 4 (No Secrets) | ✅ |
EOF

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ DEPLOY COMPLETE${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo "  URL: $DEPLOY_URL"
echo "  Domain: https://cashclaw.cc"
echo "  Report: $DEPLOY_REPORT"
echo ""
echo "  Verify: curl -sL $DEPLOY_URL | head -5"
echo "  CSS:    curl -sL $DEPLOY_URL/ui/design-system/tokens.css | head -3"
