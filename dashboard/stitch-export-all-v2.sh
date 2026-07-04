#!/bin/bash
# Export all 10 Stitch designs using correct edit_screens schema
PROXY="/Users/macbook/algo-trader/dashboard/stitch-proxy.sh"
EXPORTS_DIR="/Users/macbook/algo-trader/dashboard/stitch-exports"

export_design() {
  local name="$1"
  local project_id="$2"
  local screen_id="$3"
  local dir="$4"

  echo "[$name] Exporting $screen_id..."

  # Use correct schema: projectId + selectedScreenIds + prompt
  result=$(echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"edit_screens","arguments":{"projectId":"'"$project_id"'","selectedScreenIds":["'"$screen_id"'"],"prompt":"Return the complete HTML code for this design as a self-contained file with embedded Tailwind CSS. Wrap the HTML in a markdown code block with language html.","deviceType":"DESKTOP"}}}' | timeout 90 "$PROXY" 2>/dev/null)

  # Extract HTML from markdown code block
  if echo "$result" | grep -q "```html"; then
    echo "$result" | sed -n '/```html/,/```/p' | sed '1d;$d' > "$dir/design.html"
    echo "[$name] ✓ design.html ($(wc -c < "$dir/design.html") bytes)"
  else
    # Try to find HTML in the response
    html_start=$(echo "$result" | grep -n "<!DOCTYPE\|<html" | head -1 | cut -d: -f1)
    if [ -n "$html_start" ]; then
      tail -n +$html_start <<< "$result" > "$dir/design.html"
      echo "[$name] ✓ design.html ($(wc -c < "$dir/design.html") bytes, raw HTML)"
    else
      echo "[$name] ⚠ No HTML found, saving raw response"
      echo "$result" | head -20 > "$dir/design-raw.txt"
    fi
  fi

  # Extract colors
  echo "$result" | grep -oE '#[0-9a-fA-F]{3,8}' | sort -u | head -12 > "$dir/colors.txt"

  # Generate DESIGN.md
  colors=$(cat "$dir/colors.txt" | tr '\n' ',' | sed 's/,$//')
  cat > "$dir/DESIGN.md" << MDEOF
# Design System: $name

## Colors
\`\`\`
$colors
\`\`\`

## Typography
- **Font family**: Inter, JetBrains Mono
- **Base size**: 16px

## Layout
- **Max width**: 1440px
- **Sidebar**: 240px fixed left
- **Header**: 64px fixed top

## Source
- Screen ID: $screen_id
- Project ID: $project_id
- Export: $(date -u +%Y-%m-%dT%H:%M:%SZ)
MDEOF

  echo "[$name] ✓ DESIGN.md"
}

# Export all 10 designs
export_design "dashboard-main" "9841518857639705579" "30a5d143ce0c4939ab4a2b4c71551ae5" "$EXPORTS_DIR/cashclaw-logo-30a5d143"
export_design "marketplace" "9223280557548943993" "ff86e44bfd904a36b1f2fb1879c359f0" "$EXPORTS_DIR/cashclaw-logo-ff86e44b"
export_design "backtests" "15601339422458933475" "884985d4293e47e98c6e133018b200c2" "$EXPORTS_DIR/backtest-results-cashclaw-884985d4"
export_design "licenses" "18048821789194133274" "aa53a21f934f486e8e30f0426edb7bfe" "$EXPORTS_DIR/licenses-dashboard-aa53a21f"
export_design "reporting" "1591913176034048049" "382f18ed99754c94b05d719b51b6968a" "$EXPORTS_DIR/cashclaw-trade-reporting-382f18ed"
export_design "settings" "12439834485986853627" "b65ae6e231a943e9ad2f82981b99ab60" "$EXPORTS_DIR/cashclaw-setup-guide-b65ae6e2"
export_design "guide" "14684571356404475948" "50ada12ef3f34461a95f0c1fc82154c7" "$EXPORTS_DIR/cashclaw-operator-guide-running-the-bot-50ada12e"
export_design "account" "1981230436523722346" "f18244311d164f4cb5ca1e3e3880e5a5" "$EXPORTS_DIR/account-settings-cashclaw-f1824431"
export_design "setup-guide" "12439834485986853627" "b65ae6e231a943e9ad2f82981b99ab60" "$EXPORTS_DIR/cashclaw-setup-guide-b65ae6e2"
export_design "landing" "9357175465132502359" "f70cb62204bb4564a67681ad5707152a" "$EXPORTS_DIR/cashclaw-landing-page-f70cb622"

echo "[✓] All exports complete"
