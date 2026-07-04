---
phase: 1
title: "Docker Monitoring Stack"
status: pending
priority: P1
effort: "~1h"
dependencies: []
---

# Phase 1: Docker Monitoring Stack

## Overview

Add Grafana, Prometheus, and Alertmanager containers to `docker-compose.yml`. Create config files for Prometheus scrape targets + alert rules, Alertmanager notification routing, and Grafana provisioning (datasource + dashboard provider).

## Architecture

```
algo-trade:3000/metrics ──→ Prometheus (scrape every 15s)
                                  │
                                  ├── Grafana (query Prometheus datasource)
                                  │
                                  └── Alertmanager (alerts from Prometheus rules)
                                          │
                                          └── Telegram Bot API (webhook)
```

## Related Code Files

- **Modify:** `docker-compose.yml` — add 3 services
- **Create:** `config/prometheus.yml` — scrape config + alert rules
- **Create:** `config/alertmanager.yml` — notification routing
- **Create:** `grafana/provisioning/datasources/prometheus.yml` — datasource
- **Create:** `grafana/provisioning/dashboards/default.yml` — dashboard provider
- **Create:** `grafana/dashboards/.gitkeep` — ensure directory tracked

## Implementation Steps

### Step 1: Add services to docker-compose.yml

Add after `algo-trade` service:

```yaml
  prometheus:
    image: prom/prometheus:latest
    container_name: algo-trade-prometheus
    restart: unless-stopped
    ports:
      - '9090:9090'
    volumes:
      - ./config/prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus-data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--web.console.libraries=/etc/prometheus/console_libraries'
      - '--web.console.templates=/etc/prometheus/consoles'
    networks:
      - algo-net

  grafana:
    image: grafana/grafana:latest
    container_name: algo-trade-grafana
    restart: unless-stopped
    ports:
      - '3001:3000'   # host:3001 → container:3000 (tránh conflict với app)
    environment:
      - GF_SECURITY_ADMIN_USER=admin
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_PASSWORD:-admin}
      - GF_INSTALL_PLUGINS=
    volumes:
      - ./grafana/provisioning:/etc/grafana/provisioning
      - ./grafana/dashboards:/var/lib/grafana/dashboards
      - grafana-data:/var/lib/grafana
    depends_on:
      - prometheus
    networks:
      - algo-net

  alertmanager:
    image: prom/alertmanager:latest
    container_name: algo-trade-alertmanager
    restart: unless-stopped
    ports:
      - '9093:9093'
    volumes:
      - ./config/alertmanager.yml:/etc/alertmanager/alertmanager.yml
      - alertmanager-data:/alertmanager
    command:
      - '--config.file=/etc/alertmanager/alertmanager.yml'
      - '--storage.path=/alertmanager'
    depends_on:
      - prometheus
    networks:
      - algo-net
```

Add volumes at bottom:

```yaml
volumes:
  prometheus-data:
  grafana-data:
  alertmanager-data:
```

### Step 2: Create config/prometheus.yml

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'algo-trade'
    static_configs:
      - targets: ['algo-trade:3000']
    metrics_path: /metrics

alerting:
  alertmanagers:
    - static_configs:
        - targets: ['alertmanager:9093']

rule_files:
  - '/etc/prometheus/alerts.yml'
```

Note: Alert rules will be added in Phase 4. For now, create empty alerts placeholder.

### Step 3: Create config/alertmanager.yml (basic — Telegram config in Phase 5)

```yaml
route:
  group_by: ['alertname']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  receiver: 'default'

receivers:
  - name: 'default'
    slack_configs: []  # placeholder — Telegram in Phase 5

inhibit_rules:
  - source_match:
      severity: 'critical'
    target_match:
      severity: 'warning'
    equal: ['alertname']
```

### Step 4: Create grafana/provisioning/datasources/prometheus.yml

```yaml
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    editable: false
```

### Step 5: Create grafana/provisioning/dashboards/default.yml

```yaml
apiVersion: 1

providers:
  - name: 'Default'
    orgId: 1
    folder: ''
    type: file
    disableDeletion: false
    editable: true
    options:
      path: /var/lib/grafana/dashboards
```

### Step 6: Create empty dashboards placeholder

```bash
mkdir -p grafana/dashboards grafana/provisioning/datasources grafana/provisioning/dashboards config
touch grafana/dashboards/.gitkeep
```

### Step 7: Verify

```bash
docker-compose config  # validate YAML
docker-compose up -d prometheus grafana alertmanager
docker ps | grep -E "prometheus|grafana|alertmanager"  # all UP
curl http://localhost:9090/-/healthy  # Prometheus UP
curl http://localhost:3001/api/health  # Grafana UP
curl http://localhost:9093/-/healthy  # Alertmanager UP
```

## Success Criteria

- [ ] docker-compose.yml updated with 3 monitoring services
- [ ] `docker-compose config` — valid YAML
- [ ] Prometheus container UP → healthy endpoint
- [ ] Grafana container UP → accessible at port 3001
- [ ] Alertmanager container UP
- [ ] Prometheus scrape target `algo-trade:3000/metrics` — UP
- [ ] Grafana datasource Prometheus configured
- [ ] All volume mounts resolve correctly

## Risk

- Port 3000 conflict: Grafana mapped to 3001 (host) → 3000 (container)
- Volume paths sai → provisioning không load. Kiểm tra paths
- Docker network: cả 3 service phải cùng network `algo-net` với algo-trade
