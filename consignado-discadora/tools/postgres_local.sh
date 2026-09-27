#!/usr/bin/env bash
# Sobe um Postgres local isolado para rodar supabase/schema.sql de verdade
# (o CI faz o mesmo com um service container). Não usa a sua conta Supabase.
#
#   bash tools/postgres_local.sh start
#   cd web && npm run test:sql
#   bash tools/postgres_local.sh stop
#
# Binário: qualquer Postgres >= 15 no PATH (initdb/pg_ctl), ou o pacote
# npm @embedded-postgres/linux-x64 (usado aqui no sandbox):
#   npm i --prefix /tmp/pg embedded-postgres @embedded-postgres/linux-x64
set -u

PGDATA=${PGDATA:-/tmp/pg/data}
PGSOCK=${PGSOCK:-/tmp/pg/sock}
PGPORT=${PGPORT:-54329}
BIN=${PGBIN:-$(command -v initdb >/dev/null && dirname "$(command -v initdb)" || echo /tmp/pg/node_modules/@embedded-postgres/linux-x64/native/bin)}

case "${1:-start}" in
  start)
    mkdir -p "$PGSOCK"
    if [ ! -f "$PGDATA/PG_VERSION" ]; then
      "$BIN/initdb" -D "$PGDATA" -U postgres --auth=trust --encoding=UTF8 >/dev/null
    fi
    if "$BIN/pg_ctl" -D "$PGDATA" status >/dev/null 2>&1; then
      echo "já está de pé (porta $PGPORT)"
    else
      "$BIN/pg_ctl" -D "$PGDATA" -l "$PGDATA/server.log" \
        -o "-p $PGPORT -k $PGSOCK -c listen_addresses=127.0.0.1" -w start >/dev/null
    fi
    echo "Postgres em 127.0.0.1:$PGPORT (socket $PGSOCK, cluster $PGDATA)"
    ;;
  stop)  "$BIN/pg_ctl" -D "$PGDATA" -m fast stop ;;
  psql)  PGHOST="$PGSOCK" psql -p "$PGPORT" -U postgres -d "${2:-discadora_teste}" ;;
  *)     echo "uso: $0 [start|stop|psql]"; exit 2 ;;
esac
