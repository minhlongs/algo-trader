#!/bin/bash
#
# validate-email-campaign.sh
# Quick validation of email campaign content without sending real emails.
# Checks that all marketing docs exist and contain expected sections.
#

set -euo pipefail

BASE="$(cd "$(dirname "$0")/.." && pwd)"
PASS=0
FAIL=0

check_file() {
  local file="$1"
  local pattern="$2"
  local label="$3"

  if [ ! -f "$file" ]; then
    echo "FAIL: $label -- file not found: $file"
    FAIL=$((FAIL + 1))
    return
  fi

  if grep -q "$pattern" "$file"; then
    echo "PASS: $label"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $label -- pattern '$pattern' not found in $file"
    FAIL=$((FAIL + 1))
  fi
}

echo ""
echo "=== Email Campaign Validation ==="
echo ""

# STARTER tier email doc
check_file "$BASE/docs/marketing/email-campaign-starter-tier.md" \
  "STARTER" \
  "STARTER tier doc exists with tier name"

check_file "$BASE/docs/marketing/email-campaign-starter-tier.md" \
  "\$19/mo" \
  "STARTER doc has monthly pricing"

check_file "$BASE/docs/marketing/email-campaign-starter-tier.md" \
  "\$182/year" \
  "STARTER doc has annual pricing"

check_file "$BASE/docs/marketing/email-campaign-starter-tier.md" \
  "Phien ban Tieng Viet" \
  "STARTER doc has Vietnamese section"

check_file "$BASE/docs/marketing/email-campaign-starter-tier.md" \
  "Polymarket + 1 CEX" \
  "STARTER doc lists features"

check_file "$BASE/docs/marketing/email-campaign-starter-tier.md" \
  "50 RPM" \
  "STARTER doc lists RPM limit"

# AI Co-pilot email doc
check_file "$BASE/docs/marketing/email-campaign-co-pilot.md" \
  "AI Co-pilot" \
  "Co-pilot doc exists with feature name"

check_file "$BASE/docs/marketing/email-campaign-co-pilot.md" \
  "PRO" \
  "Co-pilot doc mentions PRO tier"

check_file "$BASE/docs/marketing/email-campaign-co-pilot.md" \
  "Phien ban Tieng Viet" \
  "Co-pilot doc has Vietnamese section"

check_file "$BASE/docs/marketing/email-campaign-co-pilot.md" \
  "risk exposure" \
  "Co-pilot doc lists example queries"

check_file "$BASE/docs/marketing/email-campaign-co-pilot.md" \
  "arbitrage opportunities" \
  "Co-pilot doc mentions arbitrage"

# Campaign send script
check_file "$BASE/scripts/send-email-campaign.ts" \
  "EmailService.getInstance" \
  "Send script references EmailService"

check_file "$BASE/scripts/send-email-campaign.ts" \
  "subscriptions" \
  "Send script queries subscriptions table"

check_file "$BASE/scripts/send-email-campaign.ts" \
  "FREE" \
  "Send script filters by FREE tier"

check_file "$BASE/scripts/send-email-campaign.ts" \
  "ADMIN_EMAIL" \
  "Send script supports test mode with ADMIN_EMAIL"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
echo ""

# Also check the test file exists
if [ -f "$BASE/src/platform/notifications/__tests__/email-campaign-templates.test.ts" ]; then
  echo "PASS: Template unit test file exists"
  PASS=$((PASS + 1))
else
  echo "FAIL: Template unit test file not found"
  FAIL=$((FAIL + 1))
fi

echo ""
echo "Total: $PASS passed, $FAIL failed"

# Exit with failure if any checks failed
[ "$FAIL" -eq 0 ] || exit 1
