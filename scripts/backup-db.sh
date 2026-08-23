#!/usr/bin/env bash
# Database backup for the Docker Compose deployment.
#
#   ./scripts/backup-db.sh [output-directory]
#
# Writes a compressed, timestamped dump and prunes anything older than
# RETENTION_DAYS (default 14). Intended for cron:
#   0 3 * * *  /opt/copytrade/scripts/backup-db.sh /var/backups/copytrade
set -euo pipefail

OUT_DIR="${1:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
SERVICE="${POSTGRES_SERVICE:-postgres}"
DB_USER="${POSTGRES_USER:-copytrade}"
DB_NAME="${POSTGRES_DB:-copytrade}"

mkdir -p "$OUT_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
TARGET="$OUT_DIR/${DB_NAME}-${STAMP}.sql.gz"

echo "Dumping $DB_NAME from the $SERVICE container..."
docker compose exec -T "$SERVICE" pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$TARGET"

# A dump that cannot be read back is not a backup.
if ! gzip -t "$TARGET"; then
  echo "Backup archive failed its integrity check: $TARGET" >&2
  exit 1
fi

SIZE="$(du -h "$TARGET" | cut -f1)"
echo "Wrote $TARGET ($SIZE)"

echo "Pruning backups older than ${RETENTION_DAYS} days..."
find "$OUT_DIR" -name "${DB_NAME}-*.sql.gz" -mtime "+${RETENTION_DAYS}" -print -delete

echo
echo "Restore with:"
echo "  gunzip -c $TARGET | docker compose exec -T $SERVICE psql -U $DB_USER $DB_NAME"
