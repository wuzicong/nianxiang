#!/bin/sh
# 生产镜像入口。已有的环境变量不覆盖。
# Docker secret：/run/secrets/<变量名>，或 <变量名>_FILE 指向的文件。
# 口令文件末尾的换行会去掉。不要把口令打到日志里。
set -eu

load_secret() {
  secret_name="$1"
  secret_file="$2"
  if [ -z "$secret_file" ] || [ ! -f "$secret_file" ]; then
    return 0
  fi
  current="$(printenv "$secret_name" || true)"
  if [ -n "$current" ]; then
    return 0
  fi
  secret_value="$(tr -d '\r\n' < "$secret_file")"
  export "$secret_name=$secret_value"
}

for var in \
  DATABASE_URL \
  REDIS_URL \
  POSTGRES_USER \
  POSTGRES_PASSWORD \
  POSTGRES_DB \
  MINIO_ROOT_USER \
  MINIO_ROOT_PASSWORD \
  S3_ACCESS_KEY_ID \
  S3_SECRET_ACCESS_KEY \
  S3_BUCKET \
  WEB_ORIGINS \
  API_ORIGIN
do
  file_var="${var}_FILE"
  file_path="$(printenv "$file_var" || true)"
  if [ -n "$file_path" ]; then
    load_secret "$var" "$file_path"
  fi
  load_secret "$var" "/run/secrets/$var"
done

# 对象存储口令和 MinIO 根口令是同一份时，可以只挂根口令。
if [ -z "${S3_SECRET_ACCESS_KEY:-}" ]; then
  load_secret S3_SECRET_ACCESS_KEY "${MINIO_ROOT_PASSWORD_FILE:-}"
  load_secret S3_SECRET_ACCESS_KEY /run/secrets/MINIO_ROOT_PASSWORD
fi
if [ -z "${S3_ACCESS_KEY_ID:-}" ]; then
  load_secret S3_ACCESS_KEY_ID "${MINIO_ROOT_USER_FILE:-}"
  load_secret S3_ACCESS_KEY_ID /run/secrets/MINIO_ROOT_USER
fi

# Compose 内部网络用服务名当主机。口令做百分号编码，允许含 @。
if [ -z "${DATABASE_URL:-}" ] && [ -n "${POSTGRES_HOST:-}" ]; then
  DATABASE_URL="$(node --input-type=module -e '
    const user = process.env.POSTGRES_USER || "memora";
    const pass = process.env.POSTGRES_PASSWORD || "";
    const host = process.env.POSTGRES_HOST || "postgres";
    const db = process.env.POSTGRES_DB || "memora";
    if (!pass) {
      console.error("[memora] POSTGRES_PASSWORD or DATABASE_URL is required");
      process.exit(1);
    }
    const probe = new URL("http://local");
    probe.username = user;
    probe.password = pass;
    const database = encodeURIComponent(db);
    process.stdout.write("postgresql://" + probe.username + ":" + probe.password + "@" + host + ":5432/" + database);
  ')"
  export DATABASE_URL
fi

if [ "${MEMORA_REQUIRE_STORAGE:-}" = "1" ]; then
  if [ -z "${DATABASE_URL:-}" ] || [ -z "${REDIS_URL:-}" ]; then
    echo "[memora] DATABASE_URL and REDIS_URL are required" >&2
    exit 1
  fi
  if [ -z "${S3_ACCESS_KEY_ID:-}" ] || [ -z "${S3_SECRET_ACCESS_KEY:-}" ]; then
    echo "[memora] S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY are required" >&2
    exit 1
  fi
fi

if [ "${POSTGRES_PASSWORD:-}" = "memora-dev-change-me" ] || [ "${S3_SECRET_ACCESS_KEY:-}" = "memora-dev-change-me" ]; then
  echo "[memora] warning: still using the dev password; change it before exposing this host" >&2
fi

exec "$@"
