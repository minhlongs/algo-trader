#!/bin/bash
# One-time D1 schema setup for algo-trader-prod
# Usage: bash scripts/setup-d1.sh
# Requires: wrangler auth + CLOUDFLARE_API_TOKEN env

set -e

DB_NAME="algo-trader-prod"
SCHEMA_FILE="$(dirname "$0")/d1-schema.sql"

echo "Applying schema to ${DB_NAME}..."
npx wrangler d1 execute "${DB_NAME}" --remote --file="${SCHEMA_FILE}"
echo "Schema applied."

echo "Verifying tables..."
npx wrangler d1 execute "${DB_NAME}" --remote --command="SELECT name FROM sqlite_master WHERE type='table';"
