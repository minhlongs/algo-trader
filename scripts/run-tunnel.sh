#!/usr/bin/env bash
# ── Cloudflare Tunnel for algo-trader backend ──
# Exposes localhost:3000 via backend.cashclaw.cc
# Run this alongside the Docker stack

set -euo pipefail

CONFIG="$HOME/.cloudflared/cashclaw-api.yml"
LOGFILE="/tmp/cloudflared-cashclaw-api.log"

# Kill existing
pkill -f "cloudflared tunnel.*cashclaw-api" 2>/dev/null || true
sleep 1

echo "🚇 Starting Cloudflare Tunnel (backend.cashclaw.cc → localhost:3000)..."
cloudflared tunnel --config "$CONFIG" --ha-connections 1 --no-autoupdate run cashclaw-api > "$LOGFILE" 2>&1 &
PID=$!
echo "   PID: $PID | Log: $LOGFILE"

# Wait for registration
for i in $(seq 1 15); do
  sleep 2
  if grep -q "Registered tunnel connection" "$LOGFILE" 2>/dev/null; then
    echo "✅ Tunnel connected"
    exit 0
  fi
  echo "   Waiting... ($((i*2))s)"
done

echo "⚠️  Tunnel may not have connected — check $LOGFILE"
exit 1
