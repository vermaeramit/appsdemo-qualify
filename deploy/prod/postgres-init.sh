#!/bin/sh
# Runs once, when the Postgres volume is first created. Creates the login role the api and
# worker use. It must NOT be a superuser or table owner, otherwise RLS is bypassed.
# Migrations (run as the owner) grant it table privileges (0001_rls_and_app_role).
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v app_password="$QUALIFY_APP_PASSWORD" <<'SQL'
CREATE ROLE qualify_app LOGIN PASSWORD :'app_password';
SQL
