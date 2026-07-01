# Deployment Guide — Algo-Trader v3.0.0

**v3.0.0 architecture:** Codebase organized into 3 bounded contexts — `src/desk/` (solo trading), `src/platform/` (RaaS subscribers), `src/shared/` (kernel). All three deploy as a single service from the same Docker image.

## Zero-Config Quickstart (Recommended)

```bash
npm install
npm run setup         # Interactive wizard — enter API keys, .env auto-generated
npm run quickstart    # Demo backtest + status check + available commands
```

No Docker required for backtest and dry-run modes.

## One-Click Shell Script

```bash
./scripts/one-click-setup-and-start.sh
```

Handles: prerequisites check → install → setup wizard → optional Docker.

## Full Stack (Docker Compose)

For live trading with RaaS API, database, and monitoring:

```bash
npm run setup                        # Configure .env first
docker compose up -d                 # Start PostgreSQL, Redis, Prometheus, Grafana
npx prisma generate && npx prisma migrate deploy
npm run dev api:serve                # Start API on port 3000

# Verify
curl http://localhost:3000/health    # API health
curl http://localhost:9090           # Prometheus UI
open http://localhost:3002           # Grafana (admin/admin)
```

## Services

| Service | Port | Purpose |
|---------|------|---------|
| algo-trader | 3000 | RaaS API + WebSocket |
| postgres | 5432 | PostgreSQL 16 database |
| redis | 6379 | BullMQ queues, Pub/Sub, rate limiter |
| prometheus | 9090 | Metrics collection |
| alertmanager | 9093 | Alert routing |
| alert-webhook | 5001 | SMS/Telegram webhook |
| grafana | 3002 | Monitoring dashboards |

## Dashboard Deployment

### CashClaw Dashboard (Cloudflare Pages)

**URL**: `https://cashclaw-dashboard.pages.dev`

**Deploy**:
```bash
# From dashboard/ directory
wrangler pages deploy dist/ --project-name cashclaw-dashboard
```

**Configuration**:
- React SPA (Vite build)
- Deployed to Cloudflare Pages (auto-deploy on git push to `main`)
- Landing page includes coupon code input in pricing section
- Coupon validation via POST `/api/coupons/validate` (backend API)

**Entry Point**: `src/app.ts` (Fastify server on port 3000)

## Environment Variables

### Required
| Var | Description |
|-----|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `NOWPAYMENTS_API_KEY` | NOWPayments API key for billing |
| `NOWPAYMENTS_IPN_SECRET` | NOWPayments IPN secret for webhook verification |
| `NOWPAYMENTS_IPN_URL` | Public callback URL for NOWPayments IPN (e.g. `https://api.cashclaw.cc/api/webhooks/nowpayments`) |
| `USDT_TRC20_WALLET` | TRC20 wallet address for USDT receivals |

### NOWPayments (Marketplace & Licensing)
| Var | Description |
|-----|-------------|
| `NOWPAYMENTS_INVOICE_PRO` | Pre-created invoice ID for PRO tier (from NOWPayments dashboard) |
| `NOWPAYMENTS_INVOICE_ENTERPRISE` | Pre-created invoice ID for ENTERPRISE tier (from NOWPayments dashboard) |

### Database & Redis
| Var | Default | Description |
|-----|---------|-------------|
| `DATABASE_URL` | postgresql://algo_trader:algo_trader_dev@postgres:5432/algo_trader | PostgreSQL connection |
| `REDIS_URL` | redis://redis:6379 | Redis connection |
| `POSTGRES_USER` | algo_trader | Database user |
| `POSTGRES_PASSWORD` | algo_trader_dev | Database password |
| `POSTGRES_DB` | algo_trader | Database name |

### Application
| Var | Default | Description |
|-----|---------|-------------|
| `NODE_ENV` | production | Environment |
| `API_PORT` | 3000 | API server port |
| `METRICS_PORT` | 3001 | Metrics endpoint |
| `LOG_LEVEL` | info | Logging level |
| `DRY_RUN` | true | Dry-run mode |

### Grafana
| Var | Default | Description |
|-----|---------|-------------|
| `GRAFANA_USER` | admin | Admin username |
| `GRAFANA_PASSWORD` | admin | Admin password |
| `GRAFANA_ROOT_URL` | http://localhost:3002 | Root URL |

### Notification Services (Optional)
| Var | Description |
|-----|-------------|
| `SENDGRID_API_KEY` | SendGrid API key for email alerts |
| `SENDGRID_FROM_EMAIL` | From email address |
| `SENDGRID_FROM_NAME` | From name |
| `TWILIO_ACCOUNT_SID` | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | Twilio auth token |
| `TWILIO_PHONE_NUMBER` | Twilio phone number |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token |

See [notification-system.md](./notification-system.md) for setup details.

## Database Setup

```bash
# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate deploy

# Seed (optional)
npx prisma db seed
```

## Monitoring Stack

Algo-Trader includes a complete monitoring infrastructure with Prometheus, Grafana, and Alertmanager.

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Algo-Trader Stack                               │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌──────────┐     ┌──────────────┐     ┌─────────────────────────────┐ │
│  │   App    │────▶│  Prometheus  │────▶│      Alertmanager           │ │
│  │ :3000    │metrics│  :9090     │alerts│      :9093                  │ │
│  └──────────┘     └──────────────┘     └───────────┬─────────────────┘ │
│                          │                          │                    │
│                     ┌────▼────┐              ┌──────▼────────┐         │
│                     │ Grafana │              │ Alert Webhook │         │
│                     │ :3002   │              │ :5001         │         │
│                     └─────────┘              └───────┬────────┘         │
│                                                      │                   │
│                    ┌─────────────────────────────────┼───────┐          │
│              ┌─────▼─────┐                    ┌──────▼──┐  ┌─▼────────┐│
│              │  Email    │                    │ Telegram│  │  Twilio  ││
│              │  (SMTP)   │                    │   Bot   │  │   SMS    ││
│              └───────────┘                    └─────────┘  └──────────┘│
└─────────────────────────────────────────────────────────────────────────┘
```

### Prometheus Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `algo_trader_heap_used_bytes` | Gauge | Heap memory usage |
| `algo_trader_uptime_seconds` | Gauge | Process uptime |
| `algo_trader_trades_total` | Counter | Total executed trades |
| `algo_trader_active_tenants` | Gauge | Active tenant count |
| `algo_trader_open_positions` | Gauge | Open position count |
| `algo_trader_circuit_breaker_state` | Gauge | 0=closed, 1=open, 2=half_open |
| `algo_trader_daily_pnl_usd` | Gauge | Daily P&L |
| `algo_trader_win_rate_percent` | Gauge | Win rate percentage |

### Alert Rules

| Alert | Severity | Condition | Duration |
|-------|----------|-----------|----------|
| CircuitBreakerOpen | critical | circuit_breaker_state == 1 | 1m |
| DailyLossLimit | warning | daily_pnl_usd < -500 | 5m |
| HighMemoryUsage | warning | memory > 0.8GB | 5m |
| ServiceDown | critical | up == 0 | 2m |
| HighErrorRate | warning | error rate > 5% | 5m |
| ExchangeLatencyHigh | warning | latency > 2s | 3m |

### Accessing Dashboards

| Service | URL | Credentials |
|---------|-----|-------------|
| Grafana | http://localhost:3002 | admin/admin |
| Prometheus | http://localhost:9090 | None |
| Alertmanager | http://localhost:9094 | None |
| Alert Webhook | http://localhost:5001 | None |

### Starting Monitoring Services

```bash
# Start monitoring stack
docker compose up -d prometheus grafana alertmanager alert-webhook

# Verify Prometheus is scraping
curl http://localhost:9090/api/v1/targets

# Check Alertmanager status
curl http://localhost:9094/api/v2/status
```

### Testing Alerts

```bash
# Trigger test alert (memory)
curl -X POST http://localhost:3000/admin/test/alert/memory

# Trigger test alert (circuit breaker)
curl -X POST http://localhost:3000/admin/test/alert/circuit-breaker
```

For detailed monitoring setup, see [infra/MONITORING-README.md](../infra/MONITORING-README.md).

## CI/CD Pipeline

Algo-Trader uses GitHub Actions for automated testing and deployment.

### Pipeline Stages

```
push → Build & Test → Docker Build & Push → Deploy to VPS → Health Check
```

### Workflow File

Location: `.github/workflows/deploy.yml`

### Stages

#### 1. Build & Test
- Runs on: `push`, `pull_request` to `main`
- Node.js 20, pnpm 8
- Steps: checkout → install → test → build
- Timeout: 15 minutes

#### 2. Docker Build & Push
- Runs on: `push` to `main` (after tests pass)
- Builds Docker image with SHA and branch tags
- Pushes to GitHub Container Registry (ghcr.io)

#### 3. Deploy to VPS
- Runs on: `push` to `main` (after Docker push)
- SSH deployment to VPS
- Steps:
  1. Pull latest code
  2. Pull Docker image
  3. Stop old containers
  4. Start new containers
  5. Health check wait (30s)
  6. Verify health endpoint

#### 4. Health Check
- Runs on: `push` to `main` (after deploy)
- Verifies production endpoints:
  - `/health` - API health
  - `/metrics` - Prometheus metrics
  - `/grafana/login` - Grafana UI

### Required Secrets

| Secret | Description |
|--------|-------------|
| `VPS_HOST` | VPS hostname/IP |
| `VPS_USER` | SSH username |
| `SSH_PRIVATE_KEY` | SSH private key for deployment |

### Manual Deployment

```bash
# Build Docker image
docker build -f Dockerfile -t algo-trader .

# Run locally
docker run -p 3000:3000 \
  -e DATABASE_URL=... \
  -e REDIS_URL=... \
  algo-trader

# Deploy to VPS manually
ssh user@vps-host << 'EOF'
  cd /opt/algo-trader
  git pull origin main
  docker compose pull
  docker compose up -d
  docker compose logs -f app
EOF
```

## Docker Build

```bash
# Build from monorepo root (context needs workspace packages)
docker build -f apps/algo-trader/Dockerfile -t algo-trader .

# Run standalone
docker run -p 3000:3000 \
  -e DATABASE_URL=... \
  -e REDIS_URL=... \
  algo-trader
```

## Health Checks

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Liveness probe — uptime, version |
| `/ready` | GET | Readiness probe — 200 when ready, 503 otherwise |
| `/metrics` | GET | Prometheus metrics (text format) |

## Production Deployment

### Docker Compose (Single Server)
```bash
docker compose -f docker-compose.yml up -d
```

### Kubernetes
```yaml
# Deployment resource limits (recommended)
resources:
  requests:
    memory: "256Mi"
    cpu: "250m"
  limits:
    memory: "512Mi"
    cpu: "500m"
```

### Scaling
- **Horizontal**: Multiple algo-trader replicas behind load balancer
- **Redis**: Single instance sufficient for <100 tenants
- **PostgreSQL**: Read replicas for analytics queries

## Notification Services

Algo-Trader supports multi-channel alerts for usage monitoring and trading events:

| Channel | Provider | Threshold | Description |
|---------|----------|-----------|-------------|
| Email | SendGrid | 80%+ | Standard usage alerts |
| SMS | Twilio | 90%+ | Critical alerts only |
| Telegram | Bot API | 80%+ | Instant push notifications |

### Quick Setup

```bash
# Add to .env
SENDGRID_API_KEY=SG.your_key
SENDGRID_FROM_EMAIL=alerts@yourdomain.com

TWILIO_ACCOUNT_SID=AC_your_sid
TWILIO_AUTH_TOKEN=your_token
TWILIO_PHONE_NUMBER=+1234567890

TELEGRAM_BOT_TOKEN=1234567890:ABCdef...
```

For complete notification setup and usage, see [notification-system.md](./notification-system.md).

## Troubleshooting

| Issue | Solution |
|-------|----------|
| DB connection refused | Check `DATABASE_URL`, ensure postgres is healthy |
| Redis timeout | Check `REDIS_URL`, verify redis container |
| 401 on API calls | Verify API key in `x-api-key` header |
| 401 on coupon admin routes | Ensure `X-API-Key` header is set (case-sensitive) for `/api/admin/coupons` endpoints |
| Coupon use-count not incrementing | Use dedicated `POST /api/coupons/:code/use` endpoint, not validation endpoint |
| Circuit breaker tripped | Check `/metrics` for `algo_trader_circuit_breaker_state` |
| High memory | Check `algo_trader_heap_used_bytes` in Grafana |
| Prometheus not scraping | Verify `http://localhost:3000/metrics` responds |
| Grafana shows no data | Check Prometheus targets at `http://localhost:9090/targets` |
| Alerts not firing | Check rules at `http://localhost:9090/rules` |
| Email not sending | Verify `SENDGRID_API_KEY`, check sender verification |
| SMS failing | Confirm `TWILIO_ACCOUNT_SID` and phone number format |
| Telegram not responding | Check bot token, ensure bot is started (`/start`) |

## Production Checklist

Before deploying to production:

- [ ] All environment variables configured
- [ ] Database migrations applied
- [ ] SSL certificates configured (reverse proxy)
- [ ] Monitoring stack verified (Grafana dashboards loading)
- [ ] Alert thresholds configured
- [ ] Notification channels tested
- [ ] Backup strategy implemented
- [ ] SSH keys rotated
- [ ] Health checks passing
- [ ] CI/CD pipeline green

### Marketplace Setup

- [ ] NOWPayments invoice IDs created in dashboard (`NOWPAYMENTS_INVOICE_PRO`, `NOWPAYMENTS_INVOICE_ENTERPRISE`)
- [ ] `NOWPAYMENTS_IPN_URL` points to public webhook endpoint (e.g. `https://api.cashclaw.cc/api/webhooks/nowpayments`)
- [ ] Marketplace strategies seeded on startup (auto-seeded, verify with `GET /api/v1/marketplace/strategies`)
- [ ] Test subscribe → checkout → payment flow end-to-end
- [ ] Verify IPN webhook activates subscription on payment `finished`

## References

- [Monitoring README](../infra/MONITORING-README.md) — Detailed monitoring setup
- [Notification System](./notification-system.md) — Alert configuration
- [System Architecture](./system-architecture.md) — Architecture overview
- [API Reference](./api-reference.md) — API documentation

---

Updated: 2026-06-30
