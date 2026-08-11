# Phase 03: Redis Cluster Rebalancing

**Priority:** P1
**Status:** NOT STARTED
**Updated:** 2026-08-07

## Overview
Ensure no hot shards under 5000 RPS load.

## Requirements
- Even key distribution
- No shard >70% CPU under peak

## Architecture
Redis Cluster → consistent hashing → shard mapping

## Related Code Files
- `src/redis/` directory
- Shard configuration

## Todo List
- [ ] Analyze current Redis key distribution
- [ ] Implement resharding if needed
- [ ] Verify no hot shards at 5000 RPS

## Risk Assessment
- Resharding may cause temporary unavailability

## Next Steps
- Needs baseline from Phase 01 before planning resharding
