# Developer Onboarding

**Quick Start Guide for algo-trader Scaling Architecture**  
**Target:** Get new engineers productive in <30 minutes  
**Last Updated:** 2026-06-16

---

## Prerequisites (5 min)

### Required Software

| Tool | Version | Install Command |
|------|---------|-----------------|
| Node.js | 20+ | `nvm install 20` |
| pnpm | 9+ | `npm install -g pnpm` |
| wrangler | 3.101+ | `npm install -g wrangler@latest` |
| Docker | 28+ | https://docs.docker.com/get-docker |
| Docker Compose | v2 | (included with Docker) |
| psql | PostgreSQL 16 | `brew install postgresql@16` |
| redis-cli | Redis 7 | `brew install redis` |
| git | 2.40+ | https://git-scm.com |

### Required Accounts

- Cloudflare Workers account (with multi-region enabled)
- Anthropic API key (for LLM agents)
- PostgreSQL database instance (local or managed)
- Redis instance (local cluster or managed)

---

## Quick Start (10 min)

### 1. Clone and Install

```bash
git clone https://github.com/longtho638-jpg/algo-trader.git
cd algo-trader

# Install dependencies
pnpm install

# Copy environment template
cp .env.example .env
```

### 2. Configure Environment

Edit `.env`:

```bash
# Cloudflare
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_API_TOKEN=your-api-token

# Database
DATABASE_URL="postgresql://user:pass@localhost:5432/algo_trader"

# Redis
REDIS_URL="redis://localhost:6379"

# NATS
NATS_URL="nats://localhost:4222"

# LLM
ANTHROPIC_API_KEY="sk-ant-..."
OPENAI_API_KEY="sk-..."  # optional

# App
PORT=3000
LOG_LEVEL=info
```

**Generate Cloudflare credentials:**
```bash
wrangler whoami  # Verify login
wrangler secret put DATABASE_URL
wrangler secret put ANTHROPIC_API_KEY
```

### 3. Start Infrastructure

```bash
# Start all services (PostgreSQL, Redis, NATS, Grafana)
docker-compose up -d

# Verify all services running
docker-compose ps
# Should show: postgres, redis, nats, grafana, prometheus all UP
```

**Infrastructure ports:**
- PostgreSQL: localhost:5432
- Redis: localhost:6379
- NATS: localhost:4222
- Prometheus: localhost:9090
- Grafana: http://localhost:3001 (admin/admin)

### 4. Database Setup

```bash
# Run migrations
pnpm prisma migrate dev

# Seed sample data (optional)
pnpm db seed
```

### 5. Start Development Server

```bash
# Start API server with hot reload
pnpm dev

# In another terminal, start dashboard
pnpm dashboard:dev

# In another terminal, start CLI
pnpm cli
```

**Verify:**
- API: http://localhost:3000/api/health → `{"status":"healthy"}`
- Dashboard: http://localhost:3001
- CLI: `algo --help`

---

## Architecture Overview (5 min)

### Scaling Architecture at a Glance

```
┌─────────────────────────────────────────────────────────────┐
│                    Cloudflare Edge                         │
│  GeoIP Router → Region Router (us-east/eu/asia)           │
└─────────────────────────────┬───────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  us-east-1   │    │  eu-central   │    │  ap-southeast│
│  (Primary)   │    │  (Secondary)  │    │  (Tertiary)  │
├──────────────┤    ├──────────────┤    ├──────────────┤
│ • DO 0-3     │    │ • DO 4-7     │    │ • DO 8-11    │
│ • PG Primary │    │ • PG Replica │    │ • PG Replica │
│ • Redis Master│   │ • Redis Slave│   │ • Redis Slave│
│ • NATS Broker│    │ • NATS Leaf  │    │ • NATS Leaf  │
│ • LLM All    │    │ • LLM H+S    │    │ • LLM H only │
└──────────────┘    └──────────────┘    └──────────────┘
```

**Key concepts:**
- **12 Durable Objects** = Strategy shards (4 per region)
- **Consistent hashing** = Even distribution of 52 strategies
- **Model tiering** = Haiku (fast scan) → Sonnet (analysis) → Opus (decision)
- **Hyperdrive pools** = Overcome 6-fetch limit via connection reuse
- **Replication** = PG streaming + Redis + NATS leaf mesh

---

## Development Workflow

### Project Structure

```
src/
├── api/               # REST routes
│   ├── routes/
│   │   ├── arb-routes.ts
│   │   ├── signal-routes.ts
│   │   └── admin-routes.ts
├── durable-objects/  # Sharding (scaling)
│   ├── shard-manager.ts
│   └── shard-coordinator.ts
├── regions/          # Multi-region routing
│   ├── latency-monitor.ts
│   └── region-router.ts
├── agents/           # LLM tiering
│   ├── model-tier-dispatcher.ts
│   ├── registry.yaml
│   └── tier-config.ts
├── queues/           # BullMQ coordination
│   ├── agent-coordinator.ts
│   └── llm-queue.ts
├── workers/          # Connection pooling
│   └── connection-pool.ts
├── strategies/       # Trading strategies (52+)
│   ├── polymarket/
│   ├── kalshi/
│   └── ...
├── execution/       # Order execution
├── messaging/       # NATS integration
├── middleware/      # Prometheus, tracing
├── utils/           # Compression, LRU cache
└── wiring/          # Signal orchestration
```

### Common Development Tasks

**Run tests:**
```bash
pnpm test              # Unit tests
pnpm test:e2e          # E2E tests
pnpm test:coverage     # Coverage report
```

**Lint:**
```bash
pnpm lint              # ESLint
pnpm type-check        # TypeScript check
```

**Build:**
```bash
pnpm build            # Production build
pnpm build --watch    # Watch mode
```

**Deploy to staging:**
```bash
wrangler deploy --env staging
```

**View logs:**
```bash
wrangler tail
wrangler tail --region us-east
```

---

## Testing Scaling Locally

### Run Load Test

```bash
# Install k6
brew install k6

# Run load test script
k6 run scripts/load-test-sharding.ts

# Expected: 1000 RPS, p95 < 100ms, error rate < 1%
```

### Simulate Multi-Region

```bash
# Start regional workers locally
pnpm dev --region us-east --port 3000
pnpm dev --region eu-central --port 3001
pnpm dev --region ap-southeast --port 3002

# Test routing
curl -H "X-Forwarded-For: 8.8.8.8" http://localhost:3000/api/health
# Should route to us-east (US IP)
```

### Memory Profiling

```bash
# Enable memory snapshot
export NODE_OPTIONS="--inspect --max-old-space-size=128"

# Take heap snapshot
curl http://localhost:3000/api/debug/heap/snapshot > heap.heapsnapshot

# Analyze in Chrome DevTools
open chrome://inspect
```

---

## Key Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | HTTP server port |
| `SHARD_COUNT` | 12 | Number of DO shards |
| `VIRTUAL_NODES_PER_SHARD` | 100 | Virtual nodes for consistent hashing |
| `REGION` | local | Current region (us-east/eu/asia/local) |
| `DATABASE_URL` | - | PostgreSQL connection |
| `REDIS_CLUSTER_URL` | - | Redis cluster |
| `NATS_URL` | - | NATS broker |
| `LLM_TIER_DISPATCH` | true | Enable tiering |
| `CACHE_TTL_SECONDS` | 300 | Default cache TTL |

---

## Debugging

### View Metrics

```bash
# Prometheus metrics
curl http://localhost:3000/api/v1/metrics | grep shard_requests

# Memory usage
curl http://localhost:3000/api/v1/metrics/memory

# Shard distribution
curl http://localhost:3000/api/v1/shard/stats | jq .
```

### Check Database

```bash
# Connect to database
psql $DATABASE_URL

# Check connections
SELECT count(*) FROM pg_stat_activity;

# Check replication status (on primary)
SELECT * FROM pg_stat_replication;
```

### Check Redis

```bash
# Connect
redis-cli -h localhost -p 6379

# Cluster info
CLUSTER INFO

# Check keys
DBSIZE
```

### Check NATS

```bash
# Connect and subscribe
nats sub '>' --server nats://localhost:4222

# Publish test message
nats pub test '{"hello":"world"}' --server nats://localhost:4222
```

---

## Common Issues & Solutions

| Issue | Check | Fix |
|-------|-------|-----|
| **Port 3000 in use** | `lsof -i:3000` | Change `PORT` env or kill process |
| **DO binding error** | Worker logs | Run `wrangler dev` with correct env, check wrangler.toml |
| **Redis connection refused** | `redis-cli ping` | Start Redis: `docker-compose up redis` |
| **Database migration failed** | Migration logs | Check DATABASE_URL, run `pnpm prisma migrate reset` |
| **LLM API error** | Check `ANTHROPIC_API_KEY` | Verify key valid, check billing |
| **Shard assignment wrong** | `GET /api/v1/shard/ring` | Check `SHARD_COUNT` env, restart workers |
| **High memory** | `/api/v1/metrics/memory` | Reduce strategies per shard, enable compression |

---

## Runbooks

For production incidents, consult:

- `docs/runbooks/multi-region-outage.md` - Region failure
- `docs/runbooks/shard-hotspot.md` - Hot shard response
- `docs/runbooks/memory-pressure-critical.md` - Memory issues
- `docs/runbooks/llm-gateway-outage.md` - LLM provider down
- `docs/runbooks/database-connection-exhaustion.md` - DB connection pool exhausted

---

## Testing Checklist

Before submitting PR:

- [ ] TypeScript compiles (`pnpm build`)
- [ ] Lint passes (`pnpm lint`)
- [ ] All tests pass (`pnpm test`)
- [ ] Coverage ≥ 80% for modified files
- [ ] No console.log statements in production code
- [ ] Memory usage within limits (< 128MB per isolate)
- [ ] Load test passes (if performance change)
- [ ] Database migrations reviewed
- [ ] Documentation updated (if API change)

---

## Resources

### Documentation

- `docs/system-architecture.md` - Full architecture
- `docs/scaling-architecture.md` - Scaling deep dive
- `docs/deployment-multi-region.md` - Multi-region deployment
- `docs/metrics-reference.md` - All metrics
- `docs/development-roadmap.md` - Project phases

### External References

- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Durable Objects Guide](https://developers.cloudflare.com/durable-objects/)
- [Hyperdrive Connection Pooling](https://developers.cloudflare.com/hyperdrive/)
- [Anthropic Claude API](https://docs.anthropic.com/)
- [BullMQ Documentation](https://docs.bullmq.io/)

### Slack Channels

- `#algo-trader-dev` - Development discussion
- `#algo-trader-infra` - Infrastructure issues
- `#algo-trader-alerts` - CI/CD and monitoring alerts

### On-call Rotation

- **Platform SRE:** Check PagerDuty
- **AI/ML Engineer:** LLM-related issues
- **Database SRE:** Database/replication issues

---

## Next Steps

After onboarding:

1. Read `docs/system-architecture.md` thoroughly
2. Review `docs/scaling-architecture.md` to understand scaling design
3. Run `k6 run scripts/load-test-sharding.ts` to see scaling in action
4. Explore Grafana dashboards: http://localhost:3001
5. Join team Slack, introduce yourself in `#algo-trader-dev`
6. Pair with senior engineer on first bug fix/feature

---

**Welcome to the team!** 🚀

For questions, message @team-lead or post in `#algo-trader-dev`.
