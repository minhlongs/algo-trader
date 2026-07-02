# Alertmanager Configuration — Algo-Trader (Template)
# ============================================================
# Template file for envsubst-based configuration.
# Variables marked as ${VAR} are substituted at container start.
# Use with docker/alertmanager/entrypoint.sh
#
# Required env vars:
#   TELEGRAM_BOT_TOKEN  — Telegram bot token
#   ALERT_CHAT_ID       — Telegram chat ID for alerts
# ============================================================

route:
  group_by: ['alertname', 'severity']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  receiver: 'default'
  routes:
    - match:
        severity: critical
      receiver: 'critical'
      repeat_interval: 1h

receivers:
  # ── Default: Telegram ──
  - name: 'default'
    telegram_configs:
      - bot_token: '${TELEGRAM_BOT_TOKEN}'
        chat_id: ${ALERT_CHAT_ID}
        send_resolved: true
        parse_mode: 'HTML'
        message: |-
          <b>[{{ .Status | toUpper }}] {{ .GroupLabels.alertname }}</b>
          {{ if .Alerts.Firing -}}🔴 <b>Firing</b>{{ else -}}✅ <b>Resolved</b>{{ end }}
          {{ range .Alerts }}
            {{ .Annotations.summary }}
            {{ .Annotations.description }}
            <i>Severity: {{ .Labels.severity }}</i>
          {{ end }}

  # ── Critical: Telegram with faster repeat ──
  - name: 'critical'
    telegram_configs:
      - bot_token: '${TELEGRAM_BOT_TOKEN}'
        chat_id: ${ALERT_CHAT_ID}
        send_resolved: true
        parse_mode: 'HTML'
        message: |-
          ⚠️ <b>[{{ .Status | toUpper }}] {{ .GroupLabels.alertname }}</b>
          {{ if .Alerts.Firing -}}🔴 <b>Firing</b> (Critical){{ else -}}✅ <b>Resolved</b>{{ end }}
          {{ range .Alerts }}
            {{ .Annotations.summary }}
            {{ .Annotations.description }}
            <i>Severity: {{ .Labels.severity }} | Started: {{ .StartsAt }}</i>
          {{ end }}
