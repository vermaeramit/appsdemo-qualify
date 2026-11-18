#!/bin/sh
# Daily database backup (cron on the server, see docs/DEPLOY.md):
#   15 2 * * * cd /opt/qualify/deploy/prod && ./backup.sh >> backups/backup.log 2>&1
# Writes a compressed custom-format dump to ./backups, keeps BACKUP_KEEP_DAYS days locally, and
# copies it off-site when BACKUP_RCLONE_REMOTE is set (rclone must be installed and configured).
set -eu
cd "$(dirname "$0")"
# shellcheck disable=SC1091
. ./.env

mkdir -p backups
stamp=$(date -u +%Y%m%dT%H%M%SZ)
file="backups/qualify-${stamp}.dump"

docker compose exec -T postgres pg_dump -U qualify -d qualify --format=custom --compress=9 > "$file"
# A dump that pg_restore can't list is not a backup.
docker compose exec -T postgres pg_restore --list < "$file" > /dev/null
echo "$(date -u +%FT%TZ) backup ok: $file ($(du -h "$file" | cut -f1))"

if [ -n "${BACKUP_RCLONE_REMOTE:-}" ]; then
  rclone copy "$file" "$BACKUP_RCLONE_REMOTE/" --no-traverse
  echo "$(date -u +%FT%TZ) copied to $BACKUP_RCLONE_REMOTE"
fi

find backups -name 'qualify-*.dump' -mtime +"${BACKUP_KEEP_DAYS:-14}" -delete
