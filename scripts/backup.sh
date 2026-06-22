#!/bin/bash
# Database backup script for Shopmetrics Dashboard
# Usage: ./backup.sh [backup_dir]

set -euo pipefail

BACKUP_DIR="${1:-/backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/shopmetrics_demo_${TIMESTAMP}.sql.gz"
RETENTION_DAYS=7

# Ensure backup directory exists
mkdir -p "${BACKUP_DIR}"

echo "Starting database backup..."
echo "Backup file: ${BACKUP_FILE}"

# Run pg_dump with compression
docker exec shopmetrics_prod_pg pg_dump -U postgres shopmetrics_demo | gzip > "${BACKUP_FILE}"

if [ $? -eq 0 ]; then
    BACKUP_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
    echo "Backup completed successfully: ${BACKUP_SIZE}"
else
    echo "Backup failed!"
    exit 1
fi

# Clean up old backups
echo "Cleaning up backups older than ${RETENTION_DAYS} days..."
find "${BACKUP_DIR}" -name "shopmetrics_demo_*.sql.gz" -mtime +${RETENTION_DAYS} -delete

echo "Backup complete. Current backups:"
ls -lh "${BACKUP_DIR}"/shopmetrics_demo_*.sql.gz 2>/dev/null || echo "No backups found."
