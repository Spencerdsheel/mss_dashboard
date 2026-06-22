#!/bin/bash
# Database restore script for Shopmetrics Dashboard
# Usage: ./restore.sh <backup_file>

set -euo pipefail

if [ $# -ne 1 ]; then
    echo "Usage: $0 <backup_file>"
    echo "Available backups:"
    ls -lh /backups/shopmetrics_demo_*.sql.gz 2>/dev/null || echo "No backups found in /backups"
    exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "${BACKUP_FILE}" ]; then
    echo "Error: Backup file not found: ${BACKUP_FILE}"
    exit 1
fi

echo "WARNING: This will overwrite the current database!"
echo "Backup file: ${BACKUP_FILE}"
read -p "Are you sure? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Restore cancelled."
    exit 1
fi

echo "Restoring database from backup..."

# Decompress and restore
gunzip -c "${BACKUP_FILE}" | docker exec -i shopmetrics_prod_pg psql -U postgres -d shopmetrics_demo

if [ $? -eq 0 ]; then
    echo "Restore completed successfully!"
else
    echo "Restore failed!"
    exit 1
fi
