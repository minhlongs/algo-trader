#!/usr/bin/env bash
# ── Start algo-trader production stack locally (M1 Max) ──
# Prerequisites: Docker Desktop / OrbStack, cloudflared
#
# Usage:
#   bash scripts/start-local-production.sh          # full stack
#   bash scripts/start-local-production.sh --detach  # background
#   bash scripts/start-local-production.sh --stop    # stop stack
#
# Architecture:
#   Internet → CF Worker → cloudflared tunnel → localhost:3000 (Docker)
#                                                     ├── PostgreSQL
#                                                     ├── Redis
#                                                     └── NATS

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

MODE="${1:-}"

# ── Stop ──
if [ "$MODE" = "--stop" ]; then
  echo "🛑 Stopping algo-trader stack..."
  docker compose down
  echo -e "${GREEN}✓ Stack stopped${NC}"
  exit 0
fi

# ── Prerequisites ──
echo "══════════════════════════════════════════════"
echo "  algo-trader Local Production — M1 Max"
echo "  $(date -Iseconds)"
echo "══════════════════════════════════════════════"

# Docker
if ! command -v docker &>/dev/null; then
  echo -e "${RED}✗ Docker not found. Install Docker Desktop or OrbStack.${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Docker${NC}"

# .env
if [ ! -f .env ]; then
  if [ -f .env.local ]; then
    echo -e "${YELLOW}⚠ .env not found — copying from .env.local${NC}"
    cp .env.local .env
  else
    echo -e "${RED}✗ .env not found. Create from .env.local or .env.example${NC}"
    exit 1
  fi
fi
echo -e "${GREEN}✓ .env${NC}"

# cloudflared (optional — warn but don't fail)
if ! command -v cloudflared &>/dev/null; then
  echo -e "${YELLOW}⚠ cloudflared not installed — external access won't work${NC}"
  echo "  Install: brew install cloudflare/cloudflare/cloudflared"
  echo "  Then: cloudflared tunnel login"
  echo "  Then: cloudflared tunnel create algo-trader"
else
  echo -e "${GREEN}✓ cloudflared${NC}"
fi

# ── Prevent sleep (macOS) ──
if [[ "$OSTYPE" == "darwin"* ]]; then
  CAFFEINATE_PID=$(pgrep -f "caffeinate.*algo-trader" || true)
  if [ -z "$CAFFEINATE_PID" ]; then
    caffeinate -ims -w $$ &
    echo -e "${GREEN}✓ caffeinate (no sleep)${NC}"
  fi
fi

# ── Network ──
docker network create algo-trader_algo-net 2>/dev/null || true

# ── Start ──
echo ""
echo "🚀 Starting services..."
COMPOSE_ARGS="up"
[ "$MODE" = "--detach" ] && COMPOSE_ARGS="up -d"

docker compose $COMPOSE_ARGS

# ── Health Check (detached mode) ──
if [ "$MODE" = "--detach" ]; then
  echo ""
  echo "⏳ Waiting for services to be healthy..."
  sleep 8

  echo ""
  echo "=== Health Checks ==="
  for svc in algo-trade algo-trade-postgres algo-trade-redis algo-trade-nats; do
    STATUS=$(docker inspect --format='{{.State.Health.Status}}' "$svc" 2>/dev/null || echo "starting")
    case $STATUS in
      healthy) ICON="${GREEN}✓${NC}" ;;
      starting) ICON="${YELLOW}…${NC}" ;;
      *) ICON="${RED}✗${NC}" ;;
    esac
    echo "  $ICON $svc: $STATUS"
  done

  echo ""
  echo "=== Endpoints ==="
  echo "  API:        http://localhost:3000"
  echo "  Health:     http://localhost:3000/api/health"
  echo "  NATS:       http://localhost:8222"
  echo "  Redis:      localhost:6380"
  echo "  PostgreSQL: localhost:5432"
  echo ""

  # ── Cloudflare Tunnel ──
  if command -v cloudflared &>/dev/null; then
    echo "🚇 Starting Cloudflare Tunnel..."
    bash scripts/run-tunnel.sh 2>/dev/null && echo -e "${GREEN}✓ Tunnel connected${NC}" || echo -e "${YELLOW}⚠ Tunnel may need attention${NC}"
  fi

  echo ""
  echo -e "${GREEN}══════════════════════════════════════════════${NC}"
  echo -e "${GREEN}  Stack running on M1 Max${NC}"
  echo -e "${GREEN}══════════════════════════════════════════════${NC}"
  echo "  Public:     https://api.cashclaw.cc (CF Worker → Tunnel → M1 Max)"
  echo "  Tunnel:     https://backend.cashclaw.cc (direct tunnel)"
fi
