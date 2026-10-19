#!/usr/bin/env bash
# 备份 Postgres（pg_dump custom）和对象桶（mc mirror）。
# 先 dump 再镜像桶：不停写时，镜像比数据库快照更新，减少「库里有键、桶里没有」。
# 口令不写进日志，也不写进 ~/.mc。
set -euo pipefail
umask 077

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source-path=SCRIPTDIR
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

usage() {
  cat <<'EOF'
用法: backup.sh [--dry-run] [--compose] [--pause-writers] [--with-config]

  --dry-run         只检查参数和工具，不连接数据库或对象存储
  --compose         在 Compose 网络里执行。默认文件是仓库根目录的 compose.prod.yml
  --pause-writers   备份前停止正在运行的 api / worker，结束（含失败）后再启动
  --with-config     再跑 backup-config.sh，复制 .env 和 secret 文件

宿主机模式需要 DATABASE_URL、S3_ENDPOINT、S3_ACCESS_KEY_ID、S3_SECRET_ACCESS_KEY、pg_dump、mc。
Compose 模式的口令留在容器环境或 Docker secret 里。S3_ENDPOINT 不要夹带账号口令。
可选：BACKUP_AGE_RECIPIENT=age1... 会加密并删掉明文。私钥不要放进仓库。
EOF
}

DRY_RUN=0
USE_COMPOSE=0
PAUSE_WRITERS=0
WITH_CONFIG=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --compose) USE_COMPOSE=1 ;;
    --pause-writers) PAUSE_WRITERS=1 ;;
    --with-config) WITH_CONFIG=1 ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown argument" ;;
  esac
  shift
done

BACKUP_DIR=${BACKUP_DIR:-./backups}
POSTGRES_USER=${POSTGRES_USER:-memora}
POSTGRES_DB=${POSTGRES_DB:-memora}

if [[ "$USE_COMPOSE" -eq 1 && -z "${COMPOSE_FILE:-}" ]]; then
  COMPOSE_FILE="$REPO_ROOT/compose.prod.yml"
fi

if [[ "$DRY_RUN" -eq 1 ]]; then
  log "dry-run: 不会连接数据库或对象存储，也不会打印口令"
  if [[ "$USE_COMPOSE" -eq 1 ]]; then
    log "mode=compose"
    if [[ -f "${COMPOSE_FILE%%:*}" ]]; then
      log "compose_file=ok"
    else
      log "compose_file=missing"
    fi
  else
    log "mode=host"
    if [[ -n "${DATABASE_URL:-}" ]]; then
      log "database_url=set"
    else
      log "database_url=missing"
    fi
    if [[ -n "${S3_ENDPOINT:-}" ]]; then
      log "s3_endpoint=set"
    else
      log "s3_endpoint=missing"
    fi
    if [[ -n "${S3_ACCESS_KEY_ID:-}" ]]; then
      log "s3_access_key_id=set"
    else
      log "s3_access_key_id=missing"
    fi
    if [[ -n "${S3_SECRET_ACCESS_KEY:-}" ]]; then
      log "s3_secret_access_key=set"
    else
      log "s3_secret_access_key=missing"
    fi
    if command -v pg_dump >/dev/null 2>&1; then
      log "pg_dump=ok"
    else
      log "pg_dump=missing"
    fi
    if command -v mc >/dev/null 2>&1; then
      log "mc=ok"
    else
      log "mc=missing"
    fi
  fi
  if [[ -n "${S3_BUCKET:-}" ]]; then
    assert_bucket_name "$S3_BUCKET"
    log "s3_bucket=ok"
  else
    log "s3_bucket=missing"
  fi
  if age_enabled; then
    if command -v age >/dev/null 2>&1; then
      log "age=ok"
    else
      log "age=missing"
    fi
  else
    log "age=off"
  fi
  if [[ "$PAUSE_WRITERS" -eq 1 ]]; then
    log "pause_writers=yes"
  else
    log "pause_writers=no"
  fi
  log "backup_dir=${BACKUP_DIR}"
  if [[ "$WITH_CONFIG" -eq 1 ]]; then
    BACKUP_DIR="$BACKUP_DIR" "$SCRIPT_DIR/backup-config.sh" --dry-run
  fi
  exit 0
fi

assert_bucket_name "${S3_BUCKET:-}"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
BACKUP_DIR=$(cd "$BACKUP_DIR" && pwd)

STAMP=$(new_stamp)
DUMP="$BACKUP_DIR/memora-${STAMP}.dump"
OBJECTS="$BACKUP_DIR/objects-${STAMP}"
OBJECTS_SHA="$BACKUP_DIR/objects-${STAMP}.sha256"

cleanup() {
  local status=$?
  set +e
  end_private_mc
  if [[ "$PAUSE_WRITERS" -eq 1 ]]; then
    if ! writers_resume; then
      log "备份过程已结束，但 api / worker 没有拉起"
      if [[ "$status" -eq 0 ]]; then
        status=1
      fi
    fi
  fi
  exit "$status"
}
trap cleanup EXIT

if [[ "$PAUSE_WRITERS" -eq 1 ]]; then
  [[ "$USE_COMPOSE" -eq 1 ]] || die "--pause-writers 需要 --compose"
  writers_stop_if_running
fi

dump_ok=0
if [[ "$USE_COMPOSE" -eq 1 ]]; then
  require_docker
  if compose_pg dump >"$DUMP"; then
    dump_ok=1
  fi
else
  : "${DATABASE_URL:?DATABASE_URL required}"
  command -v pg_dump >/dev/null 2>&1 || die "backup needs pg_dump on PATH"
  if run_scrubbed pg_dump --format=custom --no-owner --no-privileges --file "$DUMP" --dbname "$DATABASE_URL"; then
    dump_ok=1
  fi
fi

if [[ "$dump_ok" -ne 1 ]]; then
  rm -f "$DUMP"
  die "pg_dump failed"
fi
chmod 600 "$DUMP"

magic=$(head -c 5 "$DUMP" || true)
if [[ "$magic" != "PGDMP" ]]; then
  rm -f "$DUMP"
  die "pg_dump output is not a custom-format dump"
fi

dump_sha=$(sha256sum "$DUMP" | awk '{print $1}')
dump_bytes=$(wc -c <"$DUMP" | tr -d ' ')

mkdir -p "$OBJECTS"
chmod 700 "$OBJECTS"
if [[ "$USE_COMPOSE" -eq 1 ]]; then
  compose run --rm --no-deps --entrypoint /bin/sh \
    -e "S3_BUCKET=${S3_BUCKET}" \
    -e "HOST_UID=$(id -u)" \
    -e "HOST_GID=$(id -g)" \
    -v "${SELF_HOST_DIR}/lib/mc-inside.sh:/mc-inside.sh:ro" \
    -v "${OBJECTS}:/backup" \
    minio-init /mc-inside.sh mirror-out /backup
else
  : "${S3_ENDPOINT:?S3_ENDPOINT required}"
  : "${S3_ACCESS_KEY_ID:?S3_ACCESS_KEY_ID required}"
  : "${S3_SECRET_ACCESS_KEY:?S3_SECRET_ACCESS_KEY required}"
  command -v mc >/dev/null 2>&1 || die "backup needs mc on PATH"
  case "$S3_ENDPOINT" in
    http://*|https://*) ;;
    *) die "S3_ENDPOINT must start with http:// or https://" ;;
  esac
  case "$S3_ENDPOINT" in
    *://*:*@*) die "S3_ENDPOINT must not include credentials" ;;
  esac
  begin_private_mc
  run_scrubbed mc alias set memora-backup "$S3_ENDPOINT" "$S3_ACCESS_KEY_ID" "$S3_SECRET_ACCESS_KEY"
  run_scrubbed mc mirror --overwrite "memora-backup/${S3_BUCKET}" "$OBJECTS"
  find "$OBJECTS" -type d -exec chmod 700 {} +
  find "$OBJECTS" -type f -exec chmod 600 {} +
  end_private_mc
fi

hash_tree "$OBJECTS" "$OBJECTS_SHA"
objects_files=$(count_lines "$OBJECTS_SHA")

AGE=no
DUMP_NAME="memora-${STAMP}.dump"
OBJECTS_NAME="objects-${STAMP}"
objects_tar_sha=""
if age_enabled; then
  tar_path="$BACKUP_DIR/objects-${STAMP}.tar"
  tar -C "$BACKUP_DIR" -cf "$tar_path" "objects-${STAMP}" "objects-${STAMP}.sha256"
  chmod 600 "$tar_path"
  objects_tar_sha=$(sha256sum "$tar_path" | awk '{print $1}')
  encrypt_file_if_needed "$DUMP"
  encrypt_file_if_needed "$tar_path"
  rm -rf "$OBJECTS"
  rm -f "$OBJECTS_SHA"
  AGE=yes
  DUMP_NAME="memora-${STAMP}.dump.age"
  OBJECTS_NAME="objects-${STAMP}.tar.age"
fi

manifest="$BACKUP_DIR/manifest-${STAMP}.txt"
{
  printf 'memora_backup=1\n'
  printf 'stamp=%s\n' "$STAMP"
  if [[ "$USE_COMPOSE" -eq 1 ]]; then
    printf 'mode=compose\n'
  else
    printf 'mode=host\n'
  fi
  printf 's3_bucket=%s\n' "$S3_BUCKET"
  printf 'postgres_dump=%s\n' "$DUMP_NAME"
  printf 'postgres_dump_sha256=%s\n' "$dump_sha"
  printf 'postgres_dump_bytes=%s\n' "$dump_bytes"
  printf 'objects=%s\n' "$OBJECTS_NAME"
  printf 'objects_files=%s\n' "$objects_files"
  if [[ -n "$objects_tar_sha" ]]; then
    printf 'objects_tar_sha256=%s\n' "$objects_tar_sha"
  fi
  printf 'order=pg_dump_then_object_mirror\n'
  if [[ "$PAUSE_WRITERS" -eq 1 ]]; then
    printf 'writers_paused=yes\n'
  else
    printf 'writers_paused=no\n'
  fi
  printf 'age_encrypted=%s\n' "$AGE"
} >"$manifest"
chmod 600 "$manifest"

if [[ "$WITH_CONFIG" -eq 1 ]]; then
  BACKUP_DIR="$BACKUP_DIR" "$SCRIPT_DIR/backup-config.sh" --yes --stamp "$STAMP"
fi

log "backup written under ${BACKUP_DIR} stamp=${STAMP}"
