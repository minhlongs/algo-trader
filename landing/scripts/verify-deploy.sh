#!/usr/bin/env bash
# ── Post-deploy verification for cashclaw.cc ──
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; NC='\033[0m'
PAGES_URL="${1:-https://cashclaw.cc}"

echo "🔍 Verifying $PAGES_URL ..."

# 1. HTTP
HTTP=$(curl -sL -o /dev/null -w "%{http_code}" "$PAGES_URL")
[ "$HTTP" = "200" ] && echo -e "${GREEN}✓ HTTP $HTTP${NC}" || echo -e "${RED}✗ HTTP $HTTP${NC}"

# 2. Security headers
HEADERS=$(curl -sI -L "$PAGES_URL")
for h in "strict-transport-security" "content-security-policy" "x-frame-options" "permissions-policy"; do
  echo "$HEADERS" | grep -qi "$h" && echo -e "${GREEN}✓ $h${NC}" || echo -e "${RED}✗ $h missing${NC}"
done

# 3. Content checks
HTML=$(curl -sL "$PAGES_URL")
echo "$HTML" | grep -q '<title>' && echo -e "${GREEN}✓ <title>${NC}" || echo -e "${RED}✗ <title>${NC}"
echo "$HTML" | grep -q '<meta name="description"' && echo -e "${GREEN}✓ meta description${NC}" || echo -e "${RED}✗ meta description${NC}"
echo "$HTML" | grep -q '<nav' && echo -e "${GREEN}✓ <nav>${NC}" || echo -e "${RED}✗ <nav>${NC}"

# 4. CSS
CSS=$(curl -sL "$PAGES_URL/ui/design-system/tokens.css")
[ -n "$CSS" ] && echo -e "${GREEN}✓ tokens.css ($(echo "$CSS" | wc -c) bytes)${NC}" || echo -e "${RED}✗ tokens.css empty${NC}"

# 5. robots.txt
ROBOTS=$(curl -sL "$PAGES_URL/robots.txt")
echo "$ROBOTS" | grep -q "User-agent" && echo -e "${GREEN}✓ robots.txt${NC}" || echo -e "${RED}✗ robots.txt${NC}"

echo "✅ Verify complete"
