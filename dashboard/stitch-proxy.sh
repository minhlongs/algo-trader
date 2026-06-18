#!/bin/bash
export STITCH_ACCESS_TOKEN=$(gcloud auth print-access-token 2>/dev/null)
export GOOGLE_CLOUD_PROJECT="openclaw-raas-hub-1770348928"
if [ -z "$STITCH_ACCESS_TOKEN" ]; then
  echo "[X] No gcloud token" >&2; exit 1
fi
exec /opt/homebrew/bin/stitch-mcp proxy --transport stdio "$@"
