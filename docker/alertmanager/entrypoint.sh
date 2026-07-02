#!/bin/sh
# ==============================================================================
# Alertmanager Entrypoint Wrapper — Env Var Substitution
# ==============================================================================
# Usage in docker-compose.yml:
#
#   alertmanager:
#     image: prom/alertmanager:v0.27.0
#     container_name: algo-trade-alertmanager
#     volumes:
#       - ./docker/alertmanager/entrypoint.sh:/entrypoint.sh:ro
#       - ./config/alertmanager.yml.tpl:/etc/alertmanager/alertmanager.yml.tpl:ro
#     entrypoint: ["/bin/sh", "/entrypoint.sh"]
#     command: ["--config.file=/etc/alertmanager/alertmanager.yml", "--storage.path=/alertmanager"]
#     environment:
#       - TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}
#       - ALERT_CHAT_ID=${ALERT_CHAT_ID}
#
# This wrapper uses envsubst (from gettext) to evaluate ${VAR} placeholders
# in the template config file, then execs alertmanager with the rendered config.
#
# Requires: gettext (envsubst) — pre-installed in alpine-based images.
# ==============================================================================

set -e

# Config template → rendered config
TPL_FILE="/etc/alertmanager/alertmanager.yml.tpl"
CFG_FILE="/etc/alertmanager/alertmanager.yml"

if [ -f "$TPL_FILE" ]; then
  echo "[entrypoint] Rendering alertmanager config from template"
  envsubst < "$TPL_FILE" > "$CFG_FILE"
  echo "[entrypoint] Config rendered at $CFG_FILE"
else
  echo "[entrypoint] No template found at $TPL_FILE, using existing config"
fi

# Exec the original alertmanager binary with any args passed to entrypoint
exec /bin/alertmanager "$@"
