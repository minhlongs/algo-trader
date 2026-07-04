---
phase: 1
title: "Certbot + Alertmanager"
status: pending
priority: P1
dependencies: []
---

# Phase 1: Certbot + Alertmanager

## Fixes
1. Update `scripts/renew-certs.sh` to default RELOAD_SERVICES=caddy
2. Add Caddy reload mode documentation
3. Fix `config/alertmanager.yml` webhook URL from placeholder to real endpoint

## Success Criteria
- [ ] scripts/renew-certs.sh defaults to caddy
- [ ] alertmanager webhook configured