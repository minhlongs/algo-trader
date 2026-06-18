#!/bin/bash
# stitch-export-all.sh — Export all generated designs via proxy
# Uses project-local proxy (not in harness dir)
PROXY="/Users/macbook/algo-trader/dashboard/stitch-proxy.sh"
EXPORTS_DIR="/Users/macbook/algo-trader/dashboard/stitch-exports"
STITCH_MCP="/opt/homebrew/bin/stitch-mcp"

for meta in "$EXPORTS_DIR"/*/metadata.json; do
  [ -f "$meta" ] || continue
  name=$(python3 -c "import json; print(json.load(open('$meta'))['name'])")
  sid=$(python3 -c "import json; print(json.load(open('$meta'))['screenId'])")
  dir=$(dirname "$meta")
  echo "[$name] Exporting $sid..."
  result=$(echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"edit_screens","arguments":{"screenIds":["'"$sid"'"],"instructions":"Export as complete HTML with embedded Tailwind CSS, include all design tokens, colors, typography. Single self-contained HTML file."}}}' | timeout 90 "$PROXY" 2>/dev/null)
  if echo "$result" | grep -q "```html"; then
    echo "$result" | sed -n '/```html/,/```/p' | sed '1d;$d' > "$dir/design.html"
    echo "[$name] ✓ design.html ($(wc -c < "$dir/design.html") bytes)"
  else
    echo "[$name] ⚠ No HTML, saving raw"
    echo "$result" | head -3 > "$dir/design-raw.txt"
  fi
  # Extract colors from result
  echo "$result" | grep -oE '#[0-9a-fA-F]{3,8}' | sort -u | head -12 > "$dir/colors.txt"
  echo "[$name] ✓ done"
done
echo "[✓] All exports complete"
