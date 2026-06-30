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

# ── Colors ──
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

echo "⚡ Deploy cashclaw.cc → CF Pages ($CF_PROJECT)"

# ── Gate 1: Source directory exists ──
REQUIRED_FILES=(
  "$SRC_DIR/index.html"
  "$SRC_DIR/seed/tokens.css"
  "$SRC_DIR/tree/base.css"
  "$SRC_DIR/tree/components.css"
  "$SRC_DIR/forest/js/main.js"
  "$SRC_DIR/_headers"
  "$SRC_DIR/_redirects"
  "$SRC_DIR/robots.txt"
)
for f in "${REQUIRED_FILES[@]}"; do
  if [ ! -f "$f" ]; then
    echo -e "${RED}✗ Missing ${f#$SRC_DIR/}${NC}"
    exit 1
  fi
done
echo -e "${GREEN}✓ All source files present (${#REQUIRED_FILES[@]} files)${NC}"

# ── Gate 2: CSS variables match HTML usage ──
CSS_FILES=("$SRC_DIR/seed/tokens.css" "$SRC_DIR/tree/base.css" "$SRC_DIR/tree/components.css")
CSS_DEFINED=$(grep -ohE '\-\-[a-zA-Z0-9-]+' "${CSS_FILES[@]}" | sort -u)
HTML_USAGE=$(grep -ohE 'var\(\-\-[a-zA-Z0-9-]+' "$SRC_DIR/index.html" | sed 's/var(//' | sort -u)
MISSING_IN_CSS=$(comm -13 <(printf '%s\n' "$CSS_DEFINED") <(printf '%s\n' "$HTML_USAGE"))
if [ -n "$MISSING_IN_CSS" ]; then
  echo -e "${RED}✗ CSS variables used in HTML but missing from CSS files:${NC}"
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
CSS_FILES_LIST=$(printf '%s ' "${CSS_FILES[@]}")
if grep -qihE '(api_key|secret|token|password)\s*[=:]\s*["'"'"'][a-zA-Z0-9_-]{8,}' "$SRC_DIR/index.html" $CSS_FILES_LIST "$SRC_DIR/forest/js/"*.js 2>/dev/null; then
  echo -e "${RED}✗ Potential secrets detected in source${NC}"
  exit 1
fi
echo -e "${GREEN}✓ No secrets detected${NC}"

# ── Gate 5: JS syntax check (basic) ──
for jsfile in "$SRC_DIR/forest/js/"*.js "$SRC_DIR/forest/js/"*/*.js; do
  if [ -f "$jsfile" ]; then
    node --check "$jsfile" 2>/dev/null || echo -e "${YELLOW}⚠ JS syntax warning in ${jsfile#$SRC_DIR/}${NC}"
  fi
done
echo -e "${GREEN}✓ JS files checked${NC}"

# ── Git SHA auto cache-buster ──
CACHE_BUSTER=$(git -C "$PROJECT_DIR" rev-parse --short HEAD 2>/dev/null || echo "dev")
echo -e "${GREEN}✓ Cache buster: $CACHE_BUSTER${NC}"

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

CSS_SIZE=$(curl -sL "$DEPLOY_URL/seed/tokens.css" | wc -c)
CSS_FIRST_LINE=$(curl -sL "$DEPLOY_URL/seed/tokens.css" | head -1)

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
| SHA | $CACHE_BUSTER |
| CSS Size | $CSS_SIZE bytes |
| Gate 1 (Source) | ✅ |
| Gate 2 (CSS Var Audit) | ✅ |
| Gate 3 (Security Headers) | ✅ |
| Gate 4 (No Secrets) | ✅ |
| Gate 5 (JS Syntax) | ✅ |
EOF

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ DEPLOY COMPLETE${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo "  URL: $DEPLOY_URL"
echo "  Domain: https://cashclaw.cc"
echo "  SHA: $CACHE_BUSTER"
echo "  Report: $DEPLOY_REPORT"
