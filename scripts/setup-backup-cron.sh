#!/bin/bash
# Install cron entry for automated PostgreSQL backups.
# Usage: ./scripts/setup-backup-cron.sh
#
# Installs: 0 */6 * * * /path/to/backup-postgres.sh >> /var/log/algo-backup.log 2>&1
# Backups run every 6 hours.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_SCRIPT="${SCRIPT_DIR}/backup-postgres.sh"
CRON_LOG="/var/log/algo-backup.log"
CRON_SCHEDULE="0 */6 * * *"

if ! [ -f "${BACKUP_SCRIPT}" ]; then
  echo "ERROR: backup-postgres.sh not found at ${BACKUP_SCRIPT}"
  echo "  Run this script from the scripts/ directory."
  exit 1
fi

# Ensure scripts are executable
chmod +x "${BACKUP_SCRIPT}"
echo "Made executable: ${BACKUP_SCRIPT}"

# ── Install cron entry ──────────────────────────────────────────────────────
CRON_ENTRY="${CRON_SCHEDULE} ${BACKUP_SCRIPT} >> ${CRON_LOG} 2>&1"

# Check if entry already exists
if crontab -l 2>/dev/null | grep -Fq "${BACKUP_SCRIPT}"; then
  echo "Cron entry already exists:"
  crontab -l 2>/dev/null | grep -F "${BACKUP_SCRIPT}"
  exit 0
fi

# Append to existing crontab (or create new one)
(
  crontab -l 2>/dev/null || true
  echo "${CRON_ENTRY}"
) | crontab -

echo "Cron entry installed:"
echo "  ${CRON_ENTRY}"
echo ""
echo "Logging to: ${CRON_LOG}"
echo "To remove: crontab -e and delete the line containing backup-postgres.sh"
echo ""
echo "CRON_INSTALLED: ${BACKUP_SCRIPT} @ ${CRON_SCHEDULE}"
exit 0
