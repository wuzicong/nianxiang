#!/bin/sh
# 在 Postgres 容器里备份或恢复。走本地套接字，口令不出现在宿主机参数里。
set -eu

if [ -z "${POSTGRES_PASSWORD:-}" ] && [ -n "${POSTGRES_PASSWORD_FILE:-}" ] && [ -f "$POSTGRES_PASSWORD_FILE" ]; then
  POSTGRES_PASSWORD=$(tr -d '\r\n' < "$POSTGRES_PASSWORD_FILE")
  export POSTGRES_PASSWORD
fi

if [ -n "${POSTGRES_PASSWORD:-}" ]; then
  export PGPASSWORD="$POSTGRES_PASSWORD"
fi

cmd=${1:-}
shift || true

case "$cmd" in
  dump)
    exec pg_dump --format=custom --no-owner --no-privileges -U "$POSTGRES_USER" -d "$POSTGRES_DB"
    ;;
  restore)
    dump_path=/tmp/memora-restore.dump
    umask 077
    cat > "$dump_path"
    trap 'rm -f "$dump_path"' EXIT
    pg_restore "$@" -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$dump_path"
    ;;
  psql)
    exec psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"
    ;;
  *)
    echo "[memora] unknown postgres command" >&2
    exit 2
    ;;
esac
