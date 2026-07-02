#!/usr/bin/env bash
# ==============================================================================
# SSL/TLS Certificate Renewal — Let's Encrypt (certbot)
# ==============================================================================
# Usage:
#   ./scripts/renew-certs.sh           # Dry-run (safe default)
#   ./scripts/renew-certs.sh --live    # Actually renew and reload services
#
# Schedule (crontab):
#   # Renew certs daily at 3:00 AM (certbot skips if not needed)
#   0 3 * * * /opt/algo-trader/scripts/renew-certs.sh --live
#
# Prerequisites:
#   - certbot installed on host (apt install certbot || brew install certbot)
#   - Ports 80/443 accessible from the internet
#   - DNS A-records pointing to this server
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# ── Configuration ──────────────────────────────────────────────────────────────
DOMAINS="${DOMAINS:-api.your-domain.com monitoring.your-domain.com}"
EMAIL="${EMAIL:-admin@your-domain.com}"

# Docker compose file to reload after renewal
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"

# ── Modes ──────────────────────────────────────────────────────────────────────
MODE="--dry-run"
RELOAD_SERVICES="nginx"  # default; change to "caddy" if using Caddy, or "none"

if [ "${1:-}" = "--live" ]; then
  MODE=""
  RELOAD_SERVICES="${RELOAD_SERVICES:-nginx}"
  echo "[LIVE MODE] Renewing certificates and reloading services..."
else
  echo "[DRY-RUN MODE] Use --live to actually renew"
fi

# ── Ensure certbot is installed ────────────────────────────────────────────────
if ! command -v certbot &>/dev/null; then
  echo "[WARN] certbot not found. Install it:"
  echo "  Ubuntu/Debian: sudo apt install certbot"
  echo "  macOS:         brew install certbot"
  echo "  Docker:        docker run certbot/certbot ..."
  echo ""
  echo "Alternatively, use the Caddy reverse proxy (auto-HTTPS, no certbot needed):"
  echo "  docker compose -f docker-compose.yml -f docker/caddy/docker-compose.caddy.yml up -d"
  exit 1
fi

# ── Renew certificates ─────────────────────────────────────────────────────────
echo ""
echo "=== Certificate Renewal ==="
echo "Domains:   $DOMAINS"
echo "Email:     $EMAIL"
echo "Mode:      ${MODE:-live}"
echo "Reload:    $RELOAD_SERVICES"
echo ""

cd "$PROJECT_DIR"

# Run certbot renew
certbot renew \
  --non-interactive \
  --no-self-upgrade \
  ${MODE} \
  --deploy-hook "echo 'Cert renewed for: \$RENEWED_DOMAINS'" 2>&1

RENEW_EXIT=$?

if [ $RENEW_EXIT -ne 0 ]; then
  echo "[FAIL] certbot renew exited with code $RENEW_EXIT"
  exit $RENEW_EXIT
fi

# ── Reload services after renewal ──────────────────────────────────────────────
if [ -z "$MODE" ] && [ "$RELOAD_SERVICES" != "none" ]; then
  echo ""
  echo "=== Reloading services ==="

  case "$RELOAD_SERVICES" in
    nginx)
      if command -v nginx &>/dev/null; then
        nginx -s reload && echo "[OK] nginx reloaded"
      else
        echo "[SKIP] nginx not found on host"
      fi
      ;;
    caddy)
      docker compose -f "$COMPOSE_FILE" exec caddy caddy reload --config /etc/caddy/Caddyfile 2>/dev/null \
        || docker compose -f "$COMPOSE_FILE" restart caddy
      echo "[OK] Caddy reloaded"
      ;;
    docker)
      docker compose -f "$COMPOSE_FILE" restart algo-trade 2>/dev/null || true
      echo "[OK] Docker services restarted"
      ;;
    *)
      echo "[INFO] No service reload configured (set RELOAD_SERVICES)"
      ;;
  esac
fi

# ── Verify HTTPS ───────────────────────────────────────────────────────────────
echo ""
echo "=== Verification ==="
for domain in $DOMAINS; do
  echo "  https://${domain}/..."
  # Check cert expiry
  expiry=$(echo | openssl s_client -servername "$domain" -connect "${domain}:443" 2>/dev/null \
    | openssl x509 -noout -enddate 2>/dev/null \
    | cut -d= -f2 || echo "unknown")
  echo "    Expires: $expiry"
done

echo ""
if [ -z "$MODE" ]; then
  echo "[DONE] Certificate renewal complete"
else
  echo "[DONE] Dry-run complete (no changes made)"
  echo "  Run: $0 --live  (to actually renew)"
fi
