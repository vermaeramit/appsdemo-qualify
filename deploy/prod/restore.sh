#!/bin/sh
# Restores a dump made by backup.sh. Used for the monthly restore drill (into a scratch database)
# and for disaster recovery (into "qualify", with api and worker stopped).
#   ./restore.sh backups/qualify-20261118T021500Z.dump qualify_restore_test
set -eu
cd "$(dirname "$0")"
dump=${1:?usage: restore.sh <dump-file> [target-database]}
target=${2:-qualify_restore_test}

if [ "$target" = "qualify" ]; then
  echo "Restoring over the live database. Stop api and worker first: docker compose stop api worker"
  printf 'Type RESTORE to continue: '
  read -r answer
  [ "$answer" = "RESTORE" ] || exit 1
fi

docker compose exec -T postgres psql -U qualify -d postgres -v ON_ERROR_STOP=1 \
  -c "DROP DATABASE IF EXISTS \"$target\"" -c "CREATE DATABASE \"$target\""
docker compose exec -T postgres pg_restore -U qualify -d "$target" --no-owner --role=qualify < "$dump"
docker compose exec -T postgres psql -U qualify -d "$target" -c \
  "select count(*) as tenants from tenants; select count(*) as leads from leads;"
echo "Restored $dump into $target"
