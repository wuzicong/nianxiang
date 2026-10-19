#!/bin/sh
# 在 Compose 网络里的一次性容器中运行。口令只从环境或 secret 文件读取，不打印。
set -eu

if [ -z "${MINIO_ROOT_USER:-}" ]; then
  for secret_file in ${MINIO_ROOT_USER_FILE:-} /run/secrets/MINIO_ROOT_USER; do
    if [ -n "$secret_file" ] && [ -f "$secret_file" ]; then
      MINIO_ROOT_USER=$(tr -d '\r\n' < "$secret_file")
      export MINIO_ROOT_USER
      break
    fi
  done
fi

if [ -z "${MINIO_ROOT_PASSWORD:-}" ]; then
  for secret_file in ${MINIO_ROOT_PASSWORD_FILE:-} /run/secrets/MINIO_ROOT_PASSWORD; do
    if [ -n "$secret_file" ] && [ -f "$secret_file" ]; then
      MINIO_ROOT_PASSWORD=$(tr -d '\r\n' < "$secret_file")
      export MINIO_ROOT_PASSWORD
      break
    fi
  done
fi

if [ -z "${MINIO_ROOT_USER:-}" ] || [ -z "${MINIO_ROOT_PASSWORD:-}" ]; then
  echo "[memora] MinIO credentials missing inside backup container" >&2
  exit 1
fi

if [ -z "${S3_BUCKET:-}" ]; then
  echo "[memora] S3_BUCKET required" >&2
  exit 1
fi

case "$S3_BUCKET" in
  memora-*) ;;
  *)
    echo "[memora] S3_BUCKET must match memora-\${MEMORA_ENV}" >&2
    exit 1
    ;;
esac

if ! mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null 2>&1; then
  echo "[memora] mc alias failed" >&2
  exit 1
fi

cmd=${1:-}
shift || true

case "$cmd" in
  mirror-out)
    dest=${1:?destination required}
    mc mirror --overwrite "local/${S3_BUCKET}" "$dest" >/dev/null
    find "$dest" -type d -exec chmod 700 {} +
    find "$dest" -type f -exec chmod 600 {} +
    if [ -n "${HOST_UID:-}" ] && [ -n "${HOST_GID:-}" ]; then
      chown -R "${HOST_UID}:${HOST_GID}" "$dest"
    fi
    ;;
  mirror-in)
    src=${1:?source required}
    if [ "${MC_EXACT:-}" = "1" ]; then
      mc mirror --overwrite --remove "$src" "local/${S3_BUCKET}" >/dev/null
    else
      mc mirror --overwrite "$src" "local/${S3_BUCKET}" >/dev/null
    fi
    ;;
  put)
    key=${1:?object key required}
    tmp=/tmp/memora-object
    cat > "$tmp"
    mc cp "$tmp" "local/${S3_BUCKET}/${key}" >/dev/null
    rm -f "$tmp"
    ;;
  cat)
    key=${1:?object key required}
    mc cat "local/${S3_BUCKET}/${key}"
    ;;
  stat)
    key=${1:?object key required}
    mc stat "local/${S3_BUCKET}/${key}" >/dev/null
    ;;
  *)
    echo "[memora] unknown object command" >&2
    exit 2
    ;;
esac
