#!/bin/bash
# Apply database indexes for Phase 4 optimization
# Usage: ./scripts/apply_indexes.sh [database_url]

set -euo pipefail

DB_URL="${1:-postgresql://postgres:admin@localhost:5433/shopmetrics_demo}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SQL_FILE="${SCRIPT_DIR}/add_indexes.sql"

if [ ! -f "${SQL_FILE}" ]; then
    echo "Error: SQL file not found at ${SQL_FILE}"
    exit 1
fi

echo "Applying database indexes..."
echo "Database: ${DB_URL}"
echo "SQL file: ${SQL_FILE}"
echo ""

# Apply indexes
psql "${DB_URL}" -f "${SQL_FILE}"

echo ""
echo "Index application complete!"
echo ""
echo "To verify pg_stat_statements is working, run:"
echo "  psql ${DB_URL} -c \"SELECT query, calls, total_exec_time FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 10;\""
