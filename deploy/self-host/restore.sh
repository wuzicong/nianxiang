#!/usr/bin/env bash
# 按 manifest 恢复 Postgres 和对象桶。没有 --yes 不会改数据。
# 不打印口令。恢复后的轮换提醒是固定文案。
set -euo pipefail
umask 077

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source-path=SCRIPTDIR
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

usage() {
  cat <<'EOF'
用法: restore.sh --stamp STAMP --yes [--compose] [--fresh] [--no-pause-writers] [--exact-objects]
      restore.sh --dry-run [--stamp STAMP] [--compose]

  --stamp             备份目录里 manifest-<stamp>.txt 的时间戳
  --yes               确认会覆盖数据库对象，以及桶里同名对象
  --compose           在 Compose 网络里恢复。默认 compose.prod.yml
  --fresh             目标是空库（新卷）。不加时使用 pg_restore --clean --if-exists
  --no-pause-writers  不停止 api / worker。生产恢复不要加这个
  --exact-objects     mc mirror --remove，让桶和备份一致。会删掉备份之后新上传的对象
  --dry-run           不连接、不覆盖。带 --stamp 时会检查文件是否齐

Compose 模式默认会停止正在运行的 api / worker，恢复后不自动拉起。
Redis 队列不在备份里，恢复后保持空队列。
EOF
}

DRY_RUN=0
USE_COMPOSE=0
PAUSE_WRITERS=1
FRESH=0
YES=0
EXACT=0
STAMP=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --compose) USE_COMPOSE=1 ;;
    --fresh) FRESH=1 ;;
    --yes) YES=1 ;;
    --no-pause-writers) PAUSE_WRITERS=0 ;;
    --exact-objects) EXACT=1 ;;
    --stamp)
      STAMP="${2:-}"
      shift
      ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown argument" ;;
  esac
  shift
done

if [[ "$USE_COMPOSE" -eq 1 && -z "${COMPOSE_FILE:-}" ]]; then
  COMPOSE_FILE="$REPO_ROOT/compose.prod.yml"
fi

if [[ "$DRY_RUN" -eq 1 && -z "$STAMP" ]]; then
  log "dry-run: 不会连接数据库或对象存储，也不会打印口令"
  log "真实恢复需要 --stamp、--yes，以及 BACKUP_DIR 里的 manifest"
  if [[ "$PAUSE_WRITERS" -eq 1 ]]; then
    log "pause_writers=yes"
  else
    log "pause_writers=no"
  fi
  log "恢复后请轮换离开过本机的基础设施口令；备份介质可能被他人接触时 TRUNCATE sessions"
  exit 0
fi

[[ -n "$STAMP" ]] || die "--stamp required"
assert_stamp "$STAMP"

BACKUP_DIR=${BACKUP_DIR:-./backups}
manifest="$BACKUP_DIR/manifest-${STAMP}.txt"

if [[ "$DRY_RUN" -eq 1 ]]; then
  if [[ -f "$manifest" ]]; then
    log "manifest=ok"
  else
    log "manifest=missing"
    die "dry-run: real restore would fail, manifest missing"
  fi
  log "dry-run: 不会覆盖数据"
  exit 0
fi

[[ "$YES" -eq 1 ]] || die "refusing to restore without --yes"
[[ -f "$manifest" ]] || die "manifest missing"

got_stamp=$(manifest_get "$manifest" stamp || true)
[[ "$got_stamp" == "$STAMP" ]] || die "manifest stamp mismatch"
assert_bucket_name "${S3_BUCKET:-}"
manifest_bucket=$(manifest_get "$manifest" s3_bucket || true)
[[ "$manifest_bucket" == "$S3_BUCKET" ]] || die "S3_BUCKET does not match manifest"

dump_name=$(manifest_get "$manifest" postgres_dump || true)
objects_name=$(manifest_get "$manifest" objects || true)
dump_sha=$(manifest_get "$manifest" postgres_dump_sha256 || true)
age_flag=$(manifest_get "$manifest" age_encrypted || true)
objects_files=$(manifest_get "$manifest" objects_files || true)
tar_sha=$(manifest_get "$manifest" objects_tar_sha256 || true)

case "$dump_name" in
  "memora-${STAMP}.dump"|"memora-${STAMP}.dump.age") ;;
  *) die "unexpected dump name in manifest" ;;
esac
case "$objects_name" in
  "objects-${STAMP}"|"objects-${STAMP}.tar.age") ;;
  *) die "unexpected objects name in manifest" ;;
esac
case "$age_flag" in
  yes|no) ;;
  *) die "unexpected age flag in manifest" ;;
esac

[[ -f "$BACKUP_DIR/$dump_name" ]] || die "dump file missing"
if [[ "$age_flag" == "yes" ]]; then
  [[ -f "$BACKUP_DIR/$objects_name" ]] || die "encrypted object archive missing"
else
  [[ -d "$BACKUP_DIR/$objects_name" ]] || die "object backup missing"
  [[ -f "$BACKUP_DIR/objects-${STAMP}.sha256" ]] || die "object checksum missing"
fi

work=$(mktemp -d)
chmod 700 "$work"
cleanup() {
  local status=$?
  set +e
  end_private_mc
  rm -rf "$work"
  exit "$status"
}
trap cleanup EXIT

dump_path=""
if [[ "$age_flag" == "yes" ]]; then
  decrypt_age_file "$BACKUP_DIR/$dump_name" "$work/memora.dump"
  decrypt_age_file "$BACKUP_DIR/$objects_name" "$work/objects.tar"
  actual_tar=$(sha256sum "$work/objects.tar" | awk '{print $1}')
  [[ -n "$tar_sha" && "$actual_tar" == "$tar_sha" ]] || die "object archive checksum mismatch"
  tar -C "$work" -xf "$work/objects.tar"
  rm -f "$work/objects.tar"
  dump_path="$work/memora.dump"
  objects_dir="$work/objects-${STAMP}"
  objects_sha="$work/objects-${STAMP}.sha256"
else
  dump_path="$BACKUP_DIR/$dump_name"
  objects_dir="$BACKUP_DIR/$objects_name"
  objects_sha="$BACKUP_DIR/objects-${STAMP}.sha256"
fi

actual_dump=$(sha256sum "$dump_path" | awk '{print $1}')
[[ -n "$dump_sha" && "$actual_dump" == "$dump_sha" ]] || die "dump checksum mismatch"
magic=$(head -c 5 "$dump_path" || true)
[[ "$magic" == "PGDMP" ]] || die "dump magic mismatch"

if [[ "${objects_files:-0}" != "0" ]]; then
  hash_tree "$objects_dir" "$work/objects.now.sha256"
  if ! diff -q "$objects_sha" "$work/objects.now.sha256" >/dev/null; then
    die "object checksum mismatch"
  fi
fi

if [[ "$USE_COMPOSE" -eq 1 ]]; then
  log "restore stamp=${STAMP} mode=compose bucket=${S3_BUCKET}"
else
  log "restore stamp=${STAMP} mode=host bucket=${S3_BUCKET}"
  log "宿主机模式不会自动停止 api / worker，请先手动停写"
fi

if [[ "$USE_COMPOSE" -eq 1 && "$PAUSE_WRITERS" -eq 1 ]]; then
  writers_stop_if_running
  log "api / worker 保持停止。确认数据后再启动"
fi

restore_args=(--no-owner --no-privileges --exit-on-error)
if [[ "$FRESH" -eq 0 ]]; then
  restore_args+=(--clean --if-exists)
fi

if [[ "$USE_COMPOSE" -eq 1 ]]; then
  require_docker
  compose_pg restore "${restore_args[@]}" <"$dump_path"
else
  : "${DATABASE_URL:?DATABASE_URL required}"
  command -v pg_restore >/dev/null 2>&1 || die "restore needs pg_restore on PATH"
  run_scrubbed pg_restore "${restore_args[@]}" --dbname "$DATABASE_URL" "$dump_path"
fi

if [[ "${objects_files:-0}" != "0" ]]; then
  if [[ "$USE_COMPOSE" -eq 1 ]]; then
    if [[ "$EXACT" -eq 1 ]]; then
      export MC_EXACT=1
    else
      export MC_EXACT=0
    fi
    compose run --rm --no-deps --entrypoint /bin/sh \
      -e "S3_BUCKET=${S3_BUCKET}" \
      -e "MC_EXACT=${MC_EXACT}" \
      -v "${SELF_HOST_DIR}/lib/mc-inside.sh:/mc-inside.sh:ro" \
      -v "${objects_dir}:/backup:ro" \
      minio-init /mc-inside.sh mirror-in /backup
  else
    : "${S3_ENDPOINT:?S3_ENDPOINT required}"
    : "${S3_ACCESS_KEY_ID:?S3_ACCESS_KEY_ID required}"
    : "${S3_SECRET_ACCESS_KEY:?S3_SECRET_ACCESS_KEY required}"
    command -v mc >/dev/null 2>&1 || die "restore needs mc on PATH"
    begin_private_mc
    run_scrubbed mc alias set memora-backup "$S3_ENDPOINT" "$S3_ACCESS_KEY_ID" "$S3_SECRET_ACCESS_KEY"
    if [[ "$EXACT" -eq 1 ]]; then
      run_scrubbed mc mirror --overwrite --remove "$objects_dir" "memora-backup/${S3_BUCKET}"
    else
      run_scrubbed mc mirror --overwrite "$objects_dir" "memora-backup/${S3_BUCKET}"
    fi
    end_private_mc
  fi
else
  log "object backup empty, skip mirror"
fi

log "restore finished stamp=${STAMP}"
log "恢复不会改掉用户口令哈希。对外服务前请先："
log "1. 确认 api / worker 仍是停止的，抽查相册后再启动"
log "2. 如果这份备份离开过本机，轮换 Postgres、MinIO 和 .env 里的口令"
log "3. 备份介质可能被他人接触时，在库里执行 TRUNCATE sessions，让旧会话失效"
log "Redis 队列没有恢复，保持空队列，不要把旧的 AOF 拷回来"
