#!/usr/bin/env bash
# 自托管备份：pg_dump + 对象桶镜像。口令只从环境读取，脚本不回显。
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL required}"
: "${S3_BUCKET:?S3_BUCKET required}"
: "${S3_ENDPOINT:?S3_ENDPOINT required}"
: "${S3_ACCESS_KEY_ID:?S3_ACCESS_KEY_ID required}"
: "${S3_SECRET_ACCESS_KEY:?S3_SECRET_ACCESS_KEY required}"

if ! command -v pg_dump >/dev/null || ! command -v mc >/dev/null; then
  echo "[memora] backup needs pg_dump and mc on PATH" >&2
  exit 1
fi

case "$S3_BUCKET" in
  memora-*) ;;
  *)
    echo "[memora] S3_BUCKET must match memora-\${MEMORA_ENV}" >&2
    exit 1
    ;;
esac

dest="${BACKUP_DIR:-./backups}"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$dest"
chmod 700 "$dest"

pg_dump --format=custom --file "${dest}/memora-${stamp}.dump" --dbname "$DATABASE_URL"
mc alias set memora-backup "$S3_ENDPOINT" "$S3_ACCESS_KEY_ID" "$S3_SECRET_ACCESS_KEY" >/dev/null
mc mirror --overwrite "memora-backup/${S3_BUCKET}" "${dest}/objects-${stamp}" >/dev/null
echo "[memora] backup written under ${dest} stamp=${stamp}"
