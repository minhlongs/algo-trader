# Multi-Region Infrastructure Configuration
# This file documents the multi-region deployment topology

# ┌───────────────────────────────────────────────────────────────────────────┐
#                         Region Deployment Topology                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐   │
│   │   us-east-1     │      │   eu-central-1  │      │  ap-southeast-1 │   │
│   │   (Primary)     │      │   (Secondary)   │      │   (Tertiary)    │   │
│   ├─────────────────┤      ├─────────────────┤      ├─────────────────┤   │
│   │ Cloudflare      │      │ Cloudflare      │      │ Cloudflare      │   │
│   │ Worker:         │      │ Worker:         │      │ Worker:         │   │
│   │ algo-trader-    │◄────►│ algo-trader-    │◄────►│ algo-trader-    │   │
│   │ us-east         │      │ eu              │      │ asia            │   │
│   │                 │      │                 │      │                 │   │
│   │ DO Shards: 0-3  │      │ DO Shards: 4-7  │      │ DO Shards: 8-11 │   │
│   │                 │      │                 │      │                 │   │
│   │ VPS Backend:    │      │ VPS Backend:    │      │ VPS Backend:    │   │
│   │ • PostgreSQL    │◄────►│ • PostgreSQL    │◄────►│ • PostgreSQL    │   │
│   │   (primary)     │      │   (replica)     │      │   (replica)     │   │
│   │ • Redis Master  │◄────►│ • Redis Slave   │◄────►│ • Redis Slave   │   │
│   │ • NATS Server   │◄────►│ • NATS Leaf     │◄────►│ • NATS Leaf     │   │
│   │   (cluster)     │      │   (mesh)        │      │   (mesh)        │   │
│   └─────────────────┘      └─────────────────┘      └─────────────────┘   │
│         │                         │                         │              │
│         └─────────────────────────┼─────────────────────────┘              │
│                                   │                                       │
│                         ┌─────────▼─────────┐                            │
│                         │  CF Workers KV    │                            │
│                         │  (Global Cache)   │                            │
│                         └───────────────────┘                            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

# ┌───────────────────────────────────────────────────────────────────────────┐
#                         Infrastructure Details                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Cloudflare Workers Edge Layer                                             │
│  ────────────────────────────                                             │
│  • 3 regional deployments (us-east, eu-central, ap-southeast)            │
│  • Edge proxy with GeoIP + latency routing                                │
│  • Region health monitoring (/api/health/region)                         │
│  • Automatic failover to healthy regions                                 │
│  • Consistent hashing shards: 0-3, 4-7, 8-11                            │
│                                                                             │
│  VPS Backend Layer                                                         │
│  ───────────────                                                           │
│  • us-east: PostgreSQL primary (read-write)                              │
│  • eu-central: PostgreSQL read replica (async)                           │
│  • ap-southeast: PostgreSQL read replica (async)                         │
│  • Replication lag target: <5s                                            │
│                                                                             │
│  Message Bus                                                               │
│  ────────────                                                             │
│  • NATS Server cluster (us-east) with JetStream                          │
│  • NATS LeafNodes in eu + asia regions                                   │
│  • Full mesh topology for cross-region messaging                        │
│  • Leaf node ports: 7422 (leaf), 7423 (cluster)                         │
│                                                                             │
│  Caching Layer                                                             │
│  ─────────────                                                            │
│  • Redis Master in us-east                                                │
│  • Redis Replicas in eu + asia (async)                                   │
│  • Read preference: local region                                          │
│  • Write preference: primary only                                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

# ┌───────────────────────────────────────────────────────────────────────────┐
#                         Deployment Commands                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Deploy to all regions:                                                   │
│    $ ./scripts/deploy-multi-region.sh                                     │
│                                                                             │
│  Deploy to specific region:                                               │
│    $ ./scripts/deploy-multi-region.sh --region us-east                   │
│                                                                             │
│  Dry run (no deploy):                                                     │
│    $ ./scripts/deploy-multi-region.sh --dry-run                          │
│                                                                             │
│  Verify deployment:                                                       │
│    $ ./scripts/verify-multi-region.sh                                    │
│                                                                             │
│  View logs (tail):                                                        │
│    $ wrangler tail --env us-east                                         │
│    $ wrangler tail --env eu-central                                     │
│    $ wrangler tail --env ap-southeast                                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

# ┌───────────────────────────────────────────────────────────────────────────┐
#                         Environment Variables                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Cloudflare Workers (set via wrangler.toml env vars):                    │
│    ENVIRONMENT = "us-east" | "eu-central" | "ap-southeast"              │
│    REGION_ROUTING_ENABLED = "true"                                       │
│    VPS_ORIGIN = "https://api.us-east.algo-trader.com" (per region)     │
│                                                                             │
│  VPS Backend (per-region .env):                                           │
│    DATABASE_URL = "postgresql://..."  # Primary or replica URL          │
│    NATS_URL = "nats://nats:4222"  # Local NATS (primary) or leaf (replica)│
│    REDIS_URL = "redis://redis:6379"  # Local Redis                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

# ┌───────────────────────────────────────────────────────────────────────────┐
#                         Monitoring & Alerts                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Grafana Dashboard: docker/grafana/dashboards/multi-region-health.json  │
│  • Region health status                                                   │
│  • p95 latency by region (target <100ms)                                 │
│  • Request distribution pie chart                                        │
│  • Inter-region replication lag                                          │
│  • Error rate by region                                                  │
│  • SLA compliance percentage                                             │
│                                                                             │
│  Alerting (Grafana):                                                      │
│  • RegionLatencyHigh: p95 > 200ms for 3m                                │
│  • RegionUnhealthy: health check fails 3x                               │
│  • ReplicationLagCritical: > 30s                                        │
│  • RegionErrorRateHigh: > 5% for 5m                                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

# ┌───────────────────────────────────────────────────────────────────────────┐
#                         Failover Procedure                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. Edge proxy detects unhealthy region via /api/health/region          │
│  2. RegionHealthMonitor marks region DEGRADED after 3 consecutive fails │
│  3. Active region switches to nearest healthy alternative               │
│  4. Cloudflare routes updated automatically (via edge proxy logic)      │
│  5. Telegram alert sent to admin                                         │
│  6. Recovery attempts every 5m, gradual traffic return on recovery      │
│                                                                             │
│  MTTR Target: <60 seconds                                                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

# ┌───────────────────────────────────────────────────────────────────────────┐
#                         Cost Considerations                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Cloudflare Workers:                                                      │
│  • $0.50 per million requests (3 regions, 12M RPS = ~$6/day)            │
│  • DO isolation costs: included in request pricing                       │
│                                                                             │
│  Inter-region traffic (estimated):                                        │
│  • NATS leafnode messages: < 10GB/day @ $0.02/GB = ~$0.20/day           │
│  • PostgreSQL replication: ~1GB/day @ $0.02/GB = ~$0.02/day             │
│  • Redis replication: < 1GB/day @ $0.02/GB = negligible                 │
│                                                                             │
│  Total monthly inter-region cost: ~$10-15                                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
