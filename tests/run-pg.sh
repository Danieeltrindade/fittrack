#!/bin/bash
# Sobe um Postgres descartável para os testes (porta 54329) e recria o banco "fittrack_test" com as migrações.
set -e
BIN=/usr/lib/postgresql/16/bin; D=${PGTEST_DIR:-/tmp/fittrack-pg}; HERE="$(cd "$(dirname "$0")" && pwd)"
if [ ! -d "$D/data" ]; then
  mkdir -p "$D"; chown postgres "$D"
  su postgres -c "$BIN/initdb -D $D/data -A trust -E UTF8 >/dev/null"
fi
if ! su postgres -c "$BIN/pg_ctl -D $D/data status" >/dev/null 2>&1; then
  su postgres -c "$BIN/pg_ctl -D $D/data -o '-p 54329 -k /tmp -c listen_addresses=127.0.0.1' -l $D/log -w start" >/dev/null
fi
export PGHOST=127.0.0.1 PGPORT=54329 PGUSER=postgres
DBN=${1:-fittrack_test}
psql -q -d postgres -c "drop database if exists $DBN" -c "create database $DBN"
psql -q -v ON_ERROR_STOP=1 -d $DBN -f "$HERE/sql/00_supabase_stub.sql"
for f in "$HERE"/../supabase/migrations/*.sql; do psql -q -v ON_ERROR_STOP=1 -d $DBN -f "$f"; done
psql -q -v ON_ERROR_STOP=1 -d $DBN -f "$HERE/sql/05_e2e_helpers.sql"
echo "banco de teste pronto: postgresql://postgres@127.0.0.1:54329/$DBN"
